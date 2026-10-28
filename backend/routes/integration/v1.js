/**
 * routes/integration/v1.js — API di integrazione per sistemi esterni
 * (gestionale offerte, ERP, BI...). Documentazione: docs/INTEGRAZIONE.md e
 * docs/openapi.yaml (servito anche su GET /api/v1/openapi.yaml).
 *
 * Regole comuni:
 * - autenticazione con chiave API (middleware/apiKeyAuth.js), permessi a scope
 * - errori sempre nella forma { error: { code, message, details? } }
 * - POST idempotenti con header Idempotency-Key (middleware/idempotency.js)
 * - liste di sincronizzazione con cursore stabile (updatedAt, _id) e updatedSince
 * - versione nell'URL: un cambio incompatibile diventerà /api/v2, la v1 resta
 */
const path     = require("path");
const express  = require("express");
const mongoose = require("mongoose");
const { body, query, validationResult } = require("express-validator");

const Product         = require("../../models/Product");
const Movement        = require("../../models/Movement");
const Reservation     = require("../../models/Reservation");
const ProductionEntry = require("../../models/ProductionEntry");
const { authenticateApiKey, requireScope, apiKeyLimiter, problem } = require("../../middleware/apiKeyAuth");
const { idempotent } = require("../../middleware/idempotency");
const { inTransaction } = require("../../utils/transactions");
const { audit } = require("../../utils/audit");
const { recordMovement, afterMovement, serializeMovement, StockError } = require("../../services/stock");
const { availability, createReservation, releaseReservation, consumeReservation, mergeItems, normCode } = require("../../services/reservations");
const { serializeProduct, serializeReservation } = require("../../services/serializers");
const events = require("../../services/events");

const router = express.Router();

// Documentazione macchina, senza autenticazione (descrive l'API, non contiene dati).
router.get("/openapi.yaml", (_req, res) => {
  res.type("application/yaml").sendFile(path.join(__dirname, "../../docs/openapi.yaml"));
});

router.use(apiKeyLimiter, authenticateApiKey);

// Errori di validazione nel formato dell'API.
const check = (req, res, next) => {
  const errs = validationResult(req);
  if (errs.isEmpty()) return next();
  return problem(res, 400, "validation_error", "Richiesta non valida.", {
    details: errs.array().map((e) => ({ field: e.path, message: e.msg })),
  });
};

// Risposta di una transazione abortita con un errore di dominio.
const sendAbort = (res, r) => problem(res, r.status, r.code || "error", r.message, r.details ? { details: r.details } : {});

const handle = (fn) => async (req, res, next) => {
  try { await fn(req, res, next); }
  catch (err) {
    if (err instanceof StockError)
      return problem(res, err.status, err.status === 404 ? "not_found" : "stock_error", err.message, err.extra?.available !== undefined ? { details: err.extra } : {});
    next(err);
  }
};

// ── Cursore di sincronizzazione ───────────────────────────────
// Ordinamento (updatedAt, _id): stabile anche con più documenti aggiornati nello
// stesso millisecondo. Il cursore è opaco per il chiamante.
const encodeCursor = (doc) => Buffer.from(JSON.stringify([doc.updatedAt.toISOString(), String(doc._id)])).toString("base64url");
function decodeCursor(raw) {
  try {
    const [t, id] = JSON.parse(Buffer.from(String(raw), "base64url").toString("utf8"));
    const at = new Date(t);
    if (isNaN(at) || !mongoose.isValidObjectId(id)) return null;
    return { $or: [{ updatedAt: { $gt: at } }, { updatedAt: at, _id: { $gt: new mongoose.Types.ObjectId(id) } }] };
  } catch { return null; }
}
const pageRules = [
  query("limit").optional().isInt({ min: 1, max: 500 }).toInt(),
  query("updatedSince").optional().isISO8601(),
  query("cursor").optional().isString().isLength({ max: 200 }),
];
async function syncPage(Model, baseFilter, req, { populate } = {}) {
  const limit = req.query.limit || 100;
  const and = [baseFilter];
  if (req.query.updatedSince) and.push({ updatedAt: { $gte: new Date(req.query.updatedSince) } });
  if (req.query.cursor) {
    const c = decodeCursor(req.query.cursor);
    if (!c) return { error: true };
    and.push(c);
  }
  let q = Model.find({ $and: and }).sort({ updatedAt: 1, _id: 1 }).limit(limit + 1);
  if (populate) q = q.populate(populate);
  const docs = await q.lean();
  const hasMore = docs.length > limit;
  const page = docs.slice(0, limit);
  return { docs: page, hasMore, nextCursor: page.length ? encodeCursor(page[page.length - 1]) : (req.query.cursor || null) };
}

// ── Info sulla chiave (test di connessione) ───────────────────
router.get("/me", (req, res) => {
  res.json({ data: { name: req.apiKey.name, prefix: req.apiKey.prefix, scopes: req.apiKey.scopes, expiresAt: req.apiKey.expiresAt } });
});

// ── Prodotti ──────────────────────────────────────────────────
router.get("/products", requireScope("products:read"),
  [...pageRules, query("code").optional().isString().isLength({ max: 100 }), query("commessa").optional().isString().isLength({ max: 50 }),
    query("includeInactive").optional().isBoolean().toBoolean()],
  check,
  handle(async (req, res) => {
    const filter = {};
    if (!req.query.includeInactive) filter.isActive = true;
    if (req.query.code) filter.code = normCode(req.query.code);
    if (req.query.commessa) filter.commessa = String(req.query.commessa).trim().toUpperCase();
    const page = await syncPage(Product, filter, req, { populate: { path: "category", select: "name" } });
    if (page.error) return problem(res, 400, "invalid_cursor", "Cursore non valido.");
    res.json({ data: page.docs.map(serializeProduct), nextCursor: page.nextCursor, hasMore: page.hasMore });
  }));

router.get("/products/:id", requireScope("products:read"), handle(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return problem(res, 404, "not_found", "Prodotto non trovato.");
  const p = await Product.findById(req.params.id).populate("category", "name").lean();
  if (!p) return problem(res, 404, "not_found", "Prodotto non trovato.");
  res.json({ data: serializeProduct(p) });
}));

// ── Disponibilità per codice ──────────────────────────────────
// GET /api/v1/stock?codes=1534-1,1684-2  (max 100 codici)
router.get("/stock", requireScope("products:read"),
  [query("codes").isString().withMessage("codes obbligatorio (separati da virgola)")],
  check,
  handle(async (req, res) => {
    const codes = [...new Set(req.query.codes.split(",").map(normCode).filter(Boolean))];
    if (!codes.length || codes.length > 100) return problem(res, 400, "validation_error", "Da 1 a 100 codici.");
    const avail = await availability(codes);
    res.json({ data: codes.map((c) => avail.get(c)) });
  }));

// ── Movimenti ─────────────────────────────────────────────────
router.get("/movements", requireScope("movements:read"),
  [...pageRules, query("externalRef").optional().isString().isLength({ max: 120 }), query("code").optional().isString().isLength({ max: 100 })],
  check,
  handle(async (req, res) => {
    const filter = {};
    if (req.query.externalRef) filter.externalRef = String(req.query.externalRef);
    if (req.query.code) filter["productSnapshot.code"] = normCode(req.query.code);
    const page = await syncPage(Movement, filter, req);
    if (page.error) return problem(res, 400, "invalid_cursor", "Cursore non valido.");
    res.json({ data: page.docs.map(serializeMovement), nextCursor: page.nextCursor, hasMore: page.hasMore });
  }));

// POST /api/v1/movements — entrata/uscita da sistema esterno (es. DDT di carico).
// Il prodotto si indica con productId oppure con code; un codice presente su più
// pedane è ambiguo e va risolto passando productId (la risposta elenca i candidati).
router.post("/movements", requireScope("movements:write"), idempotent(),
  [
    body("productId").optional().isMongoId(),
    body("code").optional().isString().trim().isLength({ min: 1, max: 100 }),
    body("type").isIn(["IN", "OUT"]).withMessage("type deve essere IN o OUT"),
    body("quantity").isInt({ min: 1, max: 1000000 }).toInt(),
    body("reason").optional().isString().trim().isLength({ max: 200 }),
    body("reference").optional().isString().trim().isLength({ max: 120 }),
    body("externalRef").optional().isString().trim().isLength({ max: 120 }),
    body("note").optional().isString().trim().isLength({ max: 1000 }),
  ],
  check,
  handle(async (req, res) => {
    const { productId, code, type, quantity, reason, reference, externalRef, note } = req.body;
    if (!productId && !code) return problem(res, 400, "validation_error", "Indica productId oppure code.");

    const result = await inTransaction(async (session) => {
      let product;
      if (productId) {
        product = await Product.findById(productId).session(session);
      } else {
        const found = await Product.find({ code: normCode(code), isActive: true }).session(session);
        if (found.length > 1) {
          return { abort: true, status: 409, code: "ambiguous_code", message: `Il codice ${normCode(code)} è su più pedane: indica productId.`,
            details: found.map((p) => ({ productId: String(p._id), floor: p.floor, pallet: p.pallet, quantity: p.quantity })) };
        }
        product = found[0];
      }
      if (!product || !product.isActive) return { abort: true, status: 404, code: "not_found", message: "Prodotto non trovato." };

      const r = await recordMovement({
        product, type, quantity, actor: req.user,
        extra: { reason: reason || "Integrazione", reference, externalRef, note, source: "api", apiKey: req.apiKey._id },
      }, session);
      await audit(req, {
        action: "movement.create", entityType: "movement", entityId: r.movement._id,
        entityLabel: `${type} ${quantity} ${product.unit} · ${product.code}`,
        meta: { productId: String(product._id), quantityBefore: r.qBefore, quantityAfter: r.qAfter, externalRef: externalRef || "" },
      }, { session });
      return r;
    });
    if (result.abort) return sendAbort(res, result);

    await afterMovement(result, { actorName: req.user.name });
    res.status(201).json({ data: serializeMovement(result.movement) });
  }));

// ── Prenotazioni (offerte) ────────────────────────────────────
const MAX_RESERVATION_DAYS = 90;

router.get("/reservations", requireScope("reservations:read"),
  [...pageRules, query("externalRef").optional().isString().isLength({ max: 120 }),
    query("status").optional().isIn(["active", "released", "consumed", "expired"])],
  check,
  handle(async (req, res) => {
    const filter = {};
    if (req.query.externalRef) filter.externalRef = String(req.query.externalRef);
    const now = new Date();
    if (req.query.status === "expired") Object.assign(filter, { status: "active", expiresAt: { $lte: now } });
    else if (req.query.status === "active") Object.assign(filter, Reservation.holdingFilter(now));
    else if (req.query.status) filter.status = req.query.status;
    const page = await syncPage(Reservation, filter, req);
    if (page.error) return problem(res, 400, "invalid_cursor", "Cursore non valido.");
    res.json({ data: page.docs.map((d) => serializeReservation(Reservation.hydrate(d))), nextCursor: page.nextCursor, hasMore: page.hasMore });
  }));

router.get("/reservations/:id", requireScope("reservations:read"), handle(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return problem(res, 404, "not_found", "Prenotazione non trovata.");
  const r = await Reservation.findById(req.params.id);
  if (!r) return problem(res, 404, "not_found", "Prenotazione non trovata.");
  res.json({ data: serializeReservation(r) });
}));

// POST /api/v1/reservations — impegna materiale per un'offerta. Tutto o niente:
// se anche una sola riga non è disponibile, risponde 409 con le righe mancanti.
router.post("/reservations", requireScope("reservations:write"), idempotent(),
  [
    body("externalRef").isString().trim().isLength({ min: 1, max: 120 }).withMessage("externalRef obbligatorio (es. numero offerta)"),
    body("items").isArray({ min: 1, max: 200 }).withMessage("items: da 1 a 200 righe"),
    body("items.*.code").isString().trim().isLength({ min: 1, max: 100 }),
    body("items.*.quantity").isInt({ min: 1, max: 1000000 }).toInt(),
    body("note").optional().isString().trim().isLength({ max: 500 }),
    body("expiresAt").optional({ nullable: true }).isISO8601(),
  ],
  check,
  handle(async (req, res) => {
    let expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
    const maxDate = new Date(Date.now() + MAX_RESERVATION_DAYS * 24 * 3600 * 1000);
    if (expiresAt && expiresAt <= new Date()) return problem(res, 400, "validation_error", "expiresAt deve essere nel futuro.");
    if (expiresAt && expiresAt > maxDate) return problem(res, 400, "validation_error", `expiresAt al massimo tra ${MAX_RESERVATION_DAYS} giorni.`);
    if (!expiresAt) expiresAt = maxDate;   // nessuna prenotazione eterna

    const result = await inTransaction(async (session) => {
      const r = await createReservation({
        externalRef: req.body.externalRef, items: req.body.items, note: req.body.note, expiresAt,
        apiKey: req.apiKey._id, actorName: req.user.name,
      }, session);
      if (r.abort) return r;
      await audit(req, {
        action: "reservation.create", entityType: "reservation", entityId: r.reservation._id, entityLabel: r.reservation.externalRef,
        meta: { items: mergeItems(req.body.items), expiresAt },
      }, { session });
      return r;
    });
    if (result.abort) return sendAbort(res, result);

    const data = serializeReservation(result.reservation);
    events.emit("reservation.created", data);
    res.status(201).json({ data });
  }));

router.post("/reservations/:id/release", requireScope("reservations:write"), idempotent(), handle(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return problem(res, 404, "not_found", "Prenotazione non trovata.");
  const result = await inTransaction(async (session) => {
    const r = await releaseReservation(req.params.id, session);
    if (r.abort) return r;
    await audit(req, { action: "reservation.release", entityType: "reservation", entityId: r.reservation._id, entityLabel: r.reservation.externalRef }, { session });
    return r;
  });
  if (result.abort) return sendAbort(res, result);
  const data = serializeReservation(result.reservation);
  events.emit("reservation.released", data);
  res.json({ data });
}));

router.post("/reservations/:id/consume", requireScope("reservations:write"), idempotent(), handle(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return problem(res, 404, "not_found", "Prenotazione non trovata.");
  const result = await inTransaction(async (session) => {
    const r = await consumeReservation(req.params.id, { actor: req.user, apiKey: req.apiKey._id }, session);
    if (r.abort) return r;
    await audit(req, {
      action: "reservation.consume", entityType: "reservation", entityId: r.reservation._id, entityLabel: r.reservation.externalRef,
      meta: { movements: r.results.map((x) => String(x.movement._id)) },
    }, { session });
    return r;
  });
  if (result.abort) return sendAbort(res, result);

  for (const m of result.results) await afterMovement(m, { actorName: req.user.name });
  const data = { ...serializeReservation(result.reservation), movements: result.results.map((x) => serializeMovement(x.movement)) };
  events.emit("reservation.consumed", data);
  res.json({ data });
}));

// ── Commesse ──────────────────────────────────────────────────
// Stato di una commessa: articoli a magazzino + righe di produzione (Andon).
router.get("/commesse/:commessa", requireScope("production:read"), handle(async (req, res) => {
  const commessa = String(req.params.commessa).trim();
  if (!commessa || commessa.length > 50) return problem(res, 400, "validation_error", "Commessa non valida.");
  const [products, entries] = await Promise.all([
    Product.find({ commessa: commessa.toUpperCase(), isActive: true }).populate("category", "name").lean(),
    ProductionEntry.find({ commessa }).sort({ data: 1, posizione: 1 }).lean(),
  ]);
  const status = (e) => (e.finitaAt ? "finita" : e.iniziataAt ? "in_lavorazione" : e.sospesa ? "sospesa" : "da_iniziare");
  res.json({
    data: {
      commessa,
      products: products.map(serializeProduct),
      production: entries.map((e) => ({
        id: String(e._id), posizione: e.posizione, cliente: e.cliente, quantita: e.quantita,
        tipologia: e.tipologia, dimensione: e.dimensione, reparto: e.departmentName,
        data: e.data, status: status(e), iniziataAt: e.iniziataAt, finitaAt: e.finitaAt,
      })),
    },
  });
}));

// 404 e errori nel formato dell'API (non quelli dell'app).
router.use((_req, res) => problem(res, 404, "not_found", "Endpoint non trovato."));
router.use((err, _req, res, _next) => {
  console.error("[api/v1]", err.stack || err.message);
  problem(res, 500, "internal_error", "Errore interno del server.");
});

module.exports = router;
