// ══════════════════════════════════════════════════════════════
// routes/production.js — Tempi standard + Andon Board saldatura
// ══════════════════════════════════════════════════════════════
const express  = require("express");
const mongoose = require("mongoose");
const { body, query } = require("express-validator");
const StandardTime    = require("../models/StandardTime");
const ProductionEntry = require("../models/ProductionEntry");
const User            = require("../models/User");
const { protect, requireSupervisor } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { checkDepartment, visibleScope } = require("../utils/departmentAccess");
const { colleagueFilter, hiddenSuperAdminId } = require("../utils/colleagues");
const Department = require("../models/Department");
const ChecklistSubmission = require("../models/ChecklistSubmission");
const { PERIODS, resolvePeriod } = require("../utils/reportPeriod");
const { exportLimiter, importLimiter } = require("../middleware/rateLimiter");
const { buildReport, maskSuperAdmin } = require("../utils/andonReport");
const { buildAndonWorkbook } = require("../utils/andonExcel");
const { secureUpload } = require("../middleware/secureUpload");
const { parseStandardTimesFile } = require("../utils/xlsxImport");
const { parseAndonXlsx } = require("../utils/xlsxAndonImport");
const BomRecipe   = require("../models/BomRecipe");
const Product     = require("../models/Product");
const Movement    = require("../models/Movement");
const AppSettings = require("../models/AppSettings");
const router   = express.Router();

// Upload Excel "a prova di malware": solo .xlsx vero (magic bytes), in memoria,
// max ~1.5MB (un foglio di tempi standard è piccolo), mai scritto su disco.
const uploadXlsx = secureUpload({
  field:       "file",
  maxBytes:    1.5 * 1024 * 1024,
  allowedExt:  [".xlsx"],
  allowedMime: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  signature:   "xlsx",
});
// Tempi standard: anche .csv (es. esportato da Excel). Il CSV non ha magic bytes:
// secureUpload verifica che sia testo e non un binario travestito.
const uploadSheet = secureUpload({
  field:       "file",
  maxBytes:    1.5 * 1024 * 1024,
  allowedExt:  [".xlsx", ".csv"],
  allowedMime: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv", "text/plain", "application/csv", "application/vnd.ms-excel", "application/octet-stream"],
  signature:   ["xlsx", "csv"],
});

// Express 4 does not forward rejected promises: without this, a DB error in an async
// handler becomes an unhandled rejection and takes the whole process down.
for (const method of ["get", "post", "put", "delete"]) {
  const register = router[method].bind(router);
  router[method] = (path, ...handlers) => register(path, ...handlers.map((h) =>
    typeof h === "function" && h.constructor.name === "AsyncFunction"
      ? (req, res, next) => h(req, res, next).catch(next)
      : h));
}

router.use(protect);

const isSupervisor = (user) => ["admin", "supervisore"].includes(user?.role);

/** "YYYY-MM-DD" -> Date a mezzanotte UTC, così il giorno non slitta col fuso. */
const dayStart = (iso) => new Date(`${iso}T00:00:00.000Z`);
const isoDate  = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(dayStart(v).getTime());

// ── Tempi standard ────────────────────────────────────────────

/**
 * Filtro reparto per le letture: ?department=<id> (verificato) oppure, se assente,
 * tutti i reparti visibili all'utente. Risponde lui con l'errore e restituisce null.
 */
async function departmentFilter(req, res) {
  if (!req.query.department) return visibleScope(req.user);
  const check = await checkDepartment(req.user, req.query.department);
  if (check.status) { res.status(check.status).json({ message: check.message }); return null; }
  return { department: check.department._id };
}

/**
 * Filtro delle righe di produzione per le letture: reparti visibili (departmentFilter)
 * e, per gli operai, solo le righe dei colleghi della propria mansione (utils/colleagues).
 */
async function productionScope(req, res) {
  const scope = await departmentFilter(req, res);
  if (!scope) return null;
  return { ...scope, ...(await colleagueFilter(req, "operatore")) };
}

router.get("/standard-times", async (req, res) => {
  const scope = await departmentFilter(req, res);
  if (!scope) return;
  const items = await StandardTime.find({ ...scope, isActive: true }).sort({ tipologia: 1, minuti: 1 }).lean();
  res.json({ standardTimes: items });
});

const standardTimeRules = [
  body("department").optional().isMongoId().withMessage("Reparto non valido"),
  body("tipologia").trim().notEmpty().withMessage("Tipologia obbligatoria"),
  body("dimensione").optional().trim(),
  body("label").trim().notEmpty().withMessage("Nome breve obbligatorio"),
  body("minuti").isInt({ min: 1, max: 24 * 60 }).withMessage("Minuti tra 1 e 1440").toInt(),
  // Dati del pezzo (facoltativi: vuoti = tempo generico per tipologia)
  body("commessa").optional().trim().isLength({ max: 50 }),
  body("posizione").optional().trim().isLength({ max: 20 }),
  body("cliente").optional().trim().isLength({ max: 200 }),
  body("quantita").optional({ values: "falsy" }).isInt({ min: 1, max: 100000 }).withMessage("Quantità non valida").toInt(),
  body("dn").optional().trim().isLength({ max: 50 }),
  body("diametro").optional().trim().isLength({ max: 50 }),
];

/** Campi salvabili di un tempo standard (whitelist: nient'altro dal body finisce nel DB). */
const standardTimeFields = (b) => ({
  tipologia: b.tipologia, dimensione: b.dimensione || "", label: b.label, minuti: b.minuti,
  commessa: b.commessa || "", posizione: b.posizione || "", cliente: b.cliente || "",
  quantita: b.quantita || null, dn: b.dn || "", diametro: b.diametro || "",
});
const DUPLICATE_STD = "In questo reparto esiste già un tempo per questo pezzo (commessa e posizione) o per questa tipologia e dimensione.";

router.post("/standard-times", requireSupervisor, standardTimeRules, validate, async (req, res) => {
  const check = await checkDepartment(req.user, req.body.department, { forWrite: true });
  if (check.status) return res.status(check.status).json({ message: check.message });
  try {
    const item = await StandardTime.create({
      department: check.department._id, ...standardTimeFields(req.body), updatedBy: req.user._id,
    });
    res.status(201).json({ standardTime: item });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: DUPLICATE_STD });
    res.status(500).json({ message: "Errore." });
  }
});

router.put("/standard-times/:id", requireSupervisor, standardTimeRules, validate, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Tempo standard non trovato." });
  // I dati del pezzo si aggiornano solo se inviati: un client che modifica solo tempo e
  // tipologia non deve cancellare commessa, posizione, cliente ecc. di un pezzo importato.
  const all = standardTimeFields(req.body);
  const update = Object.fromEntries(Object.entries(all).filter(([k]) =>
    ["tipologia", "dimensione", "label", "minuti"].includes(k) || req.body[k] !== undefined));
  try {
    const item = await StandardTime.findByIdAndUpdate(
      req.params.id,
      { ...update, updatedBy: req.user._id },
      { new: true, runValidators: true },
    );
    if (!item) return res.status(404).json({ message: "Tempo standard non trovato." });
    res.json({ standardTime: item });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: DUPLICATE_STD });
    res.status(500).json({ message: "Errore." });
  }
});

// Disattivazione, non cancellazione: le righe storiche continuano a referenziarlo.
router.delete("/standard-times/:id", requireSupervisor, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Tempo standard non trovato." });
  await StandardTime.findByIdAndUpdate(req.params.id, { isActive: false, updatedBy: req.user._id });
  res.json({ message: "Tempo standard rimosso." });
});

// ── Import tempi standard da Excel (.xlsx) ─────────────────────
// Due passi nello STESSO endpoint, il file è sempre la fonte di verità (non ci
// fidiamo mai di righe pre-parsate inviate dal client):
//   • commit assente/false → ANTEPRIMA: parsa e restituisce righe valide + errori,
//     senza scrivere nulla. Il supervisore controlla prima di salvare.
//   • commit="true"        → SALVA nel reparto scelto (upsert: aggiorna i minuti
//     se tipologia+dimensione esiste già, altrimenti crea; non cancella nulla).
// Catena di sicurezza: importLimiter (anti-DoS) → requireSupervisor (ruolo) →
// uploadXlsx (solo .xlsx vero, in memoria) → parser in sola lettura (anti
// zip-bomb / formula-injection / prototype-pollution).
// Campi che un import può scrivere su un tempo standard (whitelist fissa).
const IMPORT_FIELDS = ["cliente", "quantita", "tipologia", "dimensione", "dn", "diametro", "label", "minuti"];
// Nel reparto un pezzo è commessa+posizione; un tempo generico (senza commessa) è tipologia+dimensione.
const stdKey = (t) => (t.commessa
  ? `P\u0000${t.commessa}\u0000${t.posizione || ""}`
  : `G\u0000${t.tipologia}\u0000${t.dimensione || ""}`);

router.post("/standard-times/import", importLimiter, requireSupervisor, uploadSheet, async (req, res) => {
  const check = await checkDepartment(req.user, req.body.department, { forWrite: true });
  if (check.status) return res.status(check.status).json({ message: check.message });

  let parsed;
  try {
    parsed = await parseStandardTimesFile(req.file.buffer, req.fileKind);
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || "File non leggibile." });
  }

  // Confronto con i tempi già presenti NEL REPARTO SCELTO: gli altri reparti non vengono
  // mai letti né toccati, quindi Prima e Seconda Saldatura non possono entrare in conflitto.
  const existing = await StandardTime.find({ department: check.department._id }).lean();
  const byKey = new Map(existing.map((t) => [stdKey(t), t]));
  const rows = parsed.rows.map((r) => {
    const cur = byKey.get(stdKey(r));
    if (!cur) return { ...r, status: "nuovo" };
    const changes = IMPORT_FIELDS.filter((f) => (cur[f] ?? null) !== (r[f] ?? null) && !(cur[f] == null && r[f] === ""));
    if (!cur.isActive) changes.push("riattivato");
    return { ...r, status: changes.length ? "aggiornato" : "invariato", changes, id: String(cur._id),
      before: changes.length ? Object.fromEntries(IMPORT_FIELDS.filter((f) => changes.includes(f)).map((f) => [f, cur[f]])) : undefined };
  });
  const count = (s) => rows.filter((r) => r.status === s).length;

  const commit = req.body.commit === "true" || req.body.commit === true;
  if (!commit) {
    return res.json({
      preview:    true,
      department: check.department._id,
      perPiece:   parsed.perPiece,
      summary: {
        valid: rows.length, nuovi: count("nuovo"), aggiornati: count("aggiornato"), invariati: count("invariato"),
        errors: parsed.errors.length, duplicates: parsed.duplicates, truncated: parsed.truncated,
      },
      rows,
      errors: parsed.errors,
    });
  }

  // Salvataggio: aggiunge i nuovi, aggiorna i cambiati, non tocca gli invariati, non cancella nulla.
  let created = 0, updated = 0, failed = 0;
  const saveErrors = [];
  for (const r of rows) {
    if (r.status === "invariato") continue;
    const fields = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, r[f] ?? (f === "quantita" ? null : "")]));
    try {
      if (r.status === "nuovo") {
        await StandardTime.create({
          department: check.department._id, commessa: r.commessa, posizione: r.posizione,
          ...fields, isActive: true, updatedBy: req.user._id,
        });
        created++;
      } else {
        await StandardTime.updateOne({ _id: r.id, department: check.department._id },
          { $set: { ...fields, isActive: true, updatedBy: req.user._id } }, { runValidators: true });
        updated++;
      }
    } catch (err) {
      failed++;
      saveErrors.push({ row: r.row, message: err.code === 11000 ? DUPLICATE_STD : "Salvataggio non riuscito." });
    }
  }

  res.json({
    preview:    false,
    department: check.department._id,
    summary: { created, updated, unchanged: count("invariato"), failed, skipped: parsed.errors.length, truncated: parsed.truncated },
    errors: [...parsed.errors, ...saveErrors],
  });
});

// ── Distinta base (BOM) per custodia × fase ───────────────────
// La distinta dice quali articoli di magazzino consuma una custodia in una fase.
// Serve alla modalità ibrida: proporre i componenti, poi l'operatore conferma.

const bomRules = [
  body("department").optional().isMongoId().withMessage("Reparto non valido"),
  body("standardTime").isMongoId().withMessage("Custodia non valida"),
  body("fase").trim().notEmpty().withMessage("Fase obbligatoria"),
  body("components").isArray({ max: 100 }).withMessage("Componenti non validi"),
];

/** Valida e normalizza una lista di componenti {product, quantita}. { list } o { error }. */
async function validComponents(raw) {
  if (!Array.isArray(raw)) return { error: "Componenti non validi." };
  const list = [];
  for (const c of raw) {
    if (!mongoose.isValidObjectId(c?.product)) return { error: "Articolo non valido." };
    const q = parseInt(c.quantita, 10);
    if (!Number.isInteger(q) || q < 1 || q > 100000) return { error: "Quantità componente non valida." };
    list.push({ product: c.product, quantita: q });
  }
  const ids = [...new Set(list.map(c => String(c.product)))];
  if (ids.length) {
    const found = await Product.countDocuments({ _id: { $in: ids }, isActive: true });
    if (found !== ids.length) return { error: "Uno o più articoli non esistono o non sono attivi." };
  }
  return { list };
}

// Lista distinte (di una custodia o di tutto il reparto visibile)
router.get("/bom", async (req, res) => {
  const scope = await departmentFilter(req, res);
  if (!scope) return;
  const filter = { ...scope, isActive: true };
  if (mongoose.isValidObjectId(req.query.standardTime)) filter.standardTime = req.query.standardTime;
  const recipes = await BomRecipe.find(filter).populate("components.product", "name code quantity unit").lean();
  res.json({ recipes });
});

// Proposta componenti per custodia + fase, già moltiplicata per la quantità (modalità ibrida)
router.get("/bom/resolve", async (req, res) => {
  const quantita = Math.max(1, Math.min(100000, parseInt(req.query.quantita, 10) || 1));
  if (!mongoose.isValidObjectId(req.query.standardTime)) return res.status(400).json({ message: "Custodia non valida." });
  const recipe = await BomRecipe.findOne({
    standardTime: req.query.standardTime,
    fase: String(req.query.fase || "").trim(),
    isActive: true,
  }).populate("components.product", "name code quantity unit");
  if (!recipe) return res.json({ found: false, components: [] });
  const components = recipe.components.filter(c => c.product).map(c => ({
    product: c.product._id,
    name:    c.product.name,
    code:    c.product.code,
    unit:    c.product.unit,
    stock:   c.product.quantity,
    quantitaPerPezzo: c.quantita,
    quantita:         c.quantita * quantita,
  }));
  res.json({ found: true, components });
});

// Crea/aggiorna la distinta (upsert per reparto + custodia + fase) — supervisore/admin
router.post("/bom", requireSupervisor, bomRules, validate, async (req, res) => {
  const check = await checkDepartment(req.user, req.body.department, { forWrite: true });
  if (check.status) return res.status(check.status).json({ message: check.message });

  const std = await StandardTime.findOne({ _id: req.body.standardTime, department: check.department._id });
  if (!std) return res.status(400).json({ message: "Custodia non trovata in questo reparto." });

  const settings = await AppSettings.getSettings();
  const fase = String(req.body.fase).trim();
  if (!settings.workPhases.includes(fase)) return res.status(400).json({ message: "Fase di lavorazione non valida." });

  const comp = await validComponents(req.body.components);
  if (comp.error) return res.status(400).json({ message: comp.error });

  const recipe = await BomRecipe.findOneAndUpdate(
    { department: check.department._id, standardTime: std._id, fase },
    { $set: { components: comp.list, isActive: true, updatedBy: req.user._id } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).populate("components.product", "name code quantity unit");
  res.status(201).json({ recipe });
});

// Elimina una distinta — supervisore/admin
router.delete("/bom/:id", requireSupervisor, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Distinta non trovata." });
  await BomRecipe.findByIdAndDelete(req.params.id);
  res.json({ message: "Distinta eliminata." });
});

// ── Andon Board ───────────────────────────────────────────────

const periodRules = [
  query("from").optional().custom(isoDate).withMessage("Data 'from' non valida (YYYY-MM-DD)"),
  query("to").optional().custom(isoDate).withMessage("Data 'to' non valida (YYYY-MM-DD)"),
];

function periodFilter(q) {
  const filter = {};
  if (q.from || q.to) {
    filter.data = {};
    if (q.from) filter.data.$gte = dayStart(q.from);
    if (q.to) {
      const end = dayStart(q.to);
      end.setUTCDate(end.getUTCDate() + 1);   // 'to' incluso
      filter.data.$lt = end;
    }
  }
  if (q.operatore && mongoose.isValidObjectId(q.operatore)) filter.operatore = new mongoose.Types.ObjectId(q.operatore);
  if (q.commessa) filter.commessa = String(q.commessa).trim();
  if (q.fase) filter.fase = String(q.fase).trim();          // una lavorazione alla volta, senza mischiare
  return filter;
}

router.get("/entries", periodRules, validate, async (req, res) => {
  const scope = await productionScope(req, res);
  if (!scope) return;
  const entries = await ProductionEntry.find({ ...periodFilter(req.query), ...scope })
    .sort({ data: -1, createdAt: -1 })
    .limit(500)
    .lean();
  const hideId = await hiddenSuperAdminId(req);
  if (hideId) entries.forEach(e => maskSuperAdmin(e, hideId));
  res.json({ entries });
});

const entryRules = [
  body("department").optional().isMongoId().withMessage("Reparto non valido"),
  body("data").custom(isoDate).withMessage("Data non valida (YYYY-MM-DD)"),
  body("commessa").trim().notEmpty().withMessage("Numero commessa obbligatorio"),
  body("posizione").optional().trim(),
  body("quantita").isInt({ min: 1, max: 10000 }).withMessage("Quantità non valida").toInt(),
  // Facoltativa solo in modifica di una riga importata dal foglio (che non ha una voce a catalogo):
  // vedi buildEntryFields
  body("standardTime").optional({ values: "falsy" }).isMongoId().withMessage("Tipologia custodia non valida"),
  body("cliente").optional().trim().isLength({ max: 200 }),
  body("dn").optional().trim().isLength({ max: 50 }),
  body("diametro").optional().trim().isLength({ max: 50 }),
  body("tempoImpiegatoMinuti").isInt({ min: 1, max: 100000 }).withMessage("Tempo impiegato non valido").toInt(),
  body("dataFine").optional({ values: "falsy" }).custom(isoDate).withMessage("Data fine non valida (YYYY-MM-DD)"),
  body("sospesa").optional().isBoolean().toBoolean(),
  body("bindello").optional().isBoolean().toBoolean(),
  body("note").optional().trim().isLength({ max: 500 }),
  body("operatore").optional({ values: "falsy" }).isMongoId().withMessage("Operatore non valido"),
];

/**
 * Campi comuni a creazione e modifica, con snapshot del tempo standard.
 * In modifica, se la tipologia non cambia, la riga tiene il suo snapshot originale:
 * correggere i pezzi di una riga vecchia non deve applicarle il tempo attuale della tabella.
 */
async function buildEntryFields(req, department, existing = null) {
  let snapshot;
  const keep = (e) => ({ standardTime: e.standardTime, custodiaLabel: e.custodiaLabel, tempoStdMinuti: e.tempoStdMinuti, tipologia: e.tipologia, dimensione: e.dimensione });
  const sameStd = existing && String(existing.standardTime) === String(req.body.standardTime)
    && String(existing.department) === String(department._id);
  if (!req.body.standardTime) {
    // Riga importata dal foglio: tiene tipologia, grandezza e tempo standard del foglio
    if (!existing || existing.standardTime) return { error: "Tipologia custodia obbligatoria." };
    snapshot = keep(existing);
  } else if (sameStd) {
    snapshot = keep(existing);
  } else {
    // La tipologia deve essere un tempo standard attivo dello stesso reparto della riga.
    const std = await StandardTime.findOne({ _id: req.body.standardTime, isActive: true, department: department._id });
    if (!std) return { error: "Tipologia custodia non trovata in questo reparto." };
    snapshot = { standardTime: std._id, custodiaLabel: std.label, tempoStdMinuti: std.minuti, tipologia: std.tipologia, dimensione: std.dimensione };
  }
  const b = req.body;
  return {
    fields: {
      department: department._id,
      departmentName: department.name,
      data: dayStart(b.data),
      commessa: b.commessa,
      posizione: b.posizione || "",
      cliente: b.cliente || "",
      dn: b.dn || "",
      diametro: b.diametro || "",
      quantita: b.quantita,
      ...snapshot,
      tempoImpiegatoMinuti: b.tempoImpiegatoMinuti,
      dataFine: b.dataFine ? dayStart(b.dataFine) : null,
      sospesa: Boolean(b.sospesa),
      bindello: Boolean(b.bindello),
      note: b.note || "",
    },
  };
}

/** Solo supervisori/admin possono registrare per un altro operatore. */
async function resolveOperatore(req, fallbackUser) {
  const requested = req.body.operatore;
  if (!requested || String(requested) === String(fallbackUser._id)) return { user: fallbackUser };
  if (!isSupervisor(req.user)) return { error: "Puoi registrare solo a tuo nome.", status: 403 };
  const user = await User.findById(requested);
  if (!user) return { error: "Operatore non trovato.", status: 404 };
  return { user };
}

/**
 * Scarica dal magazzino gli articoli consumati, DENTRO una transazione:
 * per ciascuno verifica la scorta (blocca se insufficiente), decrementa la
 * giacenza e registra un Movement OUT. Restituisce lo snapshot da salvare sulla
 * riga e gli id dei movimenti. Lancia { status, message } in caso di problema
 * (la transazione viene annullata: nessuno scarico parziale).
 */
async function applyConsumi(consumi, meta, session) {
  const snap = [];
  const movementIds = [];
  for (const c of consumi) {
    const product = await Product.findById(c.product).session(session);
    if (!product || !product.isActive) throw { status: 400, message: "Articolo da scalare non trovato." };
    if (product.quantity < c.quantita)
      throw { status: 409, message: `Scorta insufficiente per ${product.code}: disponibili ${product.quantity}, richiesti ${c.quantita}.` };

    const before = product.quantity;
    product.quantity = before - c.quantita;
    await product.save({ session });

    const [mv] = await Movement.create([{
      product: product._id,
      productSnapshot: { name: product.name, code: product.code, unit: product.unit, category: "" },
      type: "OUT",
      quantity: c.quantita,
      quantityBefore: before,
      quantityAfter:  product.quantity,
      reason:    `Produzione — ${meta.fase}`,
      reference: meta.commessa,
      performedBy:     meta.performedBy,
      performedByName: meta.operatoreNome,
    }], { session });

    movementIds.push(mv._id);
    snap.push({ product: product._id, productName: product.name, code: product.code, quantita: c.quantita });
  }
  return { snap, movementIds };
}

router.post("/entries", entryRules, validate, async (req, res) => {
  const check = await checkDepartment(req.user, req.body.department, { forWrite: true });
  if (check.status) return res.status(check.status).json({ message: check.message });
  const { fields, error } = await buildEntryFields(req, check.department);
  if (error) return res.status(400).json({ message: error });
  const op = await resolveOperatore(req, req.user);
  if (op.error) return res.status(op.status).json({ message: op.error });

  const operatoreNome = op.user.name || op.user.username;
  const consumiInput = Array.isArray(req.body.consumi) ? req.body.consumi : null;
  // Riga inserita a mano = lavoro registrato dall'operatore: firmata da lui come
  // iniziata e, se ha già la data fine, anche come finita (niente "Inizia" da premere).
  const now = new Date();
  Object.assign(fields, {
    iniziataDa: op.user._id, iniziataAt: now, firmaInizio: operatoreNome,
    ...(fields.dataFine ? { finitaDa: op.user._id, finitaAt: now, firmaFine: operatoreNome } : {}),
  });

  // Senza consumi confermati → comportamento classico (nessuno scarico magazzino).
  if (!consumiInput || !consumiInput.length) {
    const entry = await ProductionEntry.create({
      ...fields, operatore: op.user._id, operatoreNome, createdBy: req.user._id,
    });
    return res.status(201).json({ entry });
  }

  // Con scarico: la fase deve essere valida e i consumi ben formati.
  const fase = typeof req.body.fase === "string" ? req.body.fase.trim() : "";
  const settings = await AppSettings.getSettings();
  if (!fase || !settings.workPhases.includes(fase))
    return res.status(400).json({ message: "Fase di lavorazione obbligatoria per lo scarico magazzino." });

  const comp = await validComponents(consumiInput);
  if (comp.error) return res.status(400).json({ message: comp.error });

  const session = await mongoose.startSession();
  try {
    let entry;
    await session.withTransaction(async () => {
      const { snap, movementIds } = await applyConsumi(
        comp.list, { fase, commessa: fields.commessa, operatoreNome, performedBy: req.user._id }, session,
      );
      const [created] = await ProductionEntry.create([{
        ...fields, fase, operatore: op.user._id, operatoreNome, createdBy: req.user._id,
        consumi: snap, movementIds,
      }], { session });
      entry = created;
    });
    res.status(201).json({ entry });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ message: err.message });
    console.error("[production/entries scarico]", err);
    res.status(500).json({ message: "Errore durante lo scarico del magazzino. Nessuna modifica applicata." });
  } finally {
    session.endSession();
  }
});

// ── Import righe Andon da foglio Excel (.xlsx) ─────────────────
// Importa TUTTE le colonne del foglio saldatura (commessa, posizione, cliente,
// quantità, tipologia, DN, Ø, dimensione, temp standard, firme) tenendo ogni campo
// separato. Ogni riga viene marcata con la FASE scelta (default la prima, es.
// "Prima saldatura"): i dati di una lavorazione non si mischiano con le altre.
// Data = quella scelta, altrimenti la data scritta sul foglio. Reimportare lo
// stesso foglio non duplica: i capi già presenti (stessa fase/reparto/data/campi)
// vengono saltati. commit assente/false → ANTEPRIMA (non salva); commit="true" →
// crea le righe nel reparto scelto. Nessuno scarico magazzino qui (quello avviene registrando
// una riga con i consumi confermati). Catena sicura: importLimiter → requireSupervisor
// → uploadXlsx (solo .xlsx vero, in memoria) → parser in sola lettura.
router.post("/entries/import", importLimiter, requireSupervisor, uploadXlsx, async (req, res) => {
  const check = await checkDepartment(req.user, req.body.department, { forWrite: true });
  if (check.status) return res.status(check.status).json({ message: check.message });

  let parsed;
  try { parsed = await parseAndonXlsx(req.file.buffer); }
  catch (err) { return res.status(err.status || 400).json({ message: err.message || "File Excel non leggibile." }); }

  // Operatore (saldatore) da attribuire a tutte le righe: facoltativo.
  let operatore = null, operatoreNome = "";
  if (req.body.operatore && mongoose.isValidObjectId(req.body.operatore)) {
    const u = await User.findById(req.body.operatore).select("name username");
    if (u) { operatore = u._id; operatoreNome = u.name || u.username; }
  }
  const dataIso = isoDate(req.body.data) ? req.body.data : (parsed.sheetDate || new Date().toISOString().slice(0, 10));

  const settings = await AppSettings.getSettings();
  const fase = typeof req.body.fase === "string" && req.body.fase.trim() ? req.body.fase.trim() : settings.workPhases[0];
  if (!fase || !settings.workPhases.includes(fase))
    return res.status(400).json({ message: "Fase di lavorazione non valida." });

  // Capi già importati in questa fase/reparto/giorno, contati per chiave: due capi
  // identici nello stesso foglio entrano entrambi, ma un reimport non duplica.
  const keyOf = (r) => [r.commessa, r.posizione, r.cliente, r.quantita, r.tipologia, r.dimensione, r.dn, r.diametro, r.tempoStdMinuti].join("|");
  const existing = await ProductionEntry.find({ department: check.department._id, fase, data: dayStart(dataIso) })
    .select("commessa posizione cliente quantita tipologia dimensione dn diametro tempoStdMinuti").lean();
  const already = new Map();
  existing.forEach(e => { const k = keyOf(e); already.set(k, (already.get(k) || 0) + 1); });
  const toImport = [], duplicates = new Set();
  for (const r of parsed.rows) {
    const k = keyOf(r), n = already.get(k) || 0;
    if (n > 0) { already.set(k, n - 1); duplicates.add(r); } else toImport.push(r);
  }

  const commit = req.body.commit === "true" || req.body.commit === true;
  if (!commit) {
    return res.json({
      preview: true,
      department: check.department._id,
      fase, data: dataIso, sheetDate: parsed.sheetDate,
      summary: { valid: parsed.rows.length, toImport: toImport.length, duplicates: duplicates.size, errors: parsed.errors.length, truncated: parsed.truncated },
      rows: parsed.rows.map(r => ({ ...r, duplicate: duplicates.has(r) })),
      errors: parsed.errors,
    });
  }

  const docs = toImport.map(r => ({
    data: dayStart(dataIso),
    department: check.department._id,
    departmentName: check.department.name,
    operatore, operatoreNome,
    commessa: r.commessa, posizione: r.posizione, cliente: r.cliente,
    quantita: r.quantita,
    standardTime: null,
    custodiaLabel: r.custodiaLabel, dn: r.dn, diametro: r.diametro,
    tipologia: r.tipologia, dimensione: r.dimensione,
    // Le firme del foglio non si importano: le mette l'app con Inizia/Finisci.
    fase,
    tempoStdMinuti: r.tempoStdMinuti,
    tempoImpiegatoMinuti: r.tempoStdMinuti * r.quantita,   // default = al tempo standard (eff. 100%), poi correggibile
    createdBy: req.user._id,
  }));

  let created = 0, failed = 0;
  if (docs.length) {
    try {
      const inserted = await ProductionEntry.insertMany(docs, { ordered: false });
      created = inserted.length;
    } catch (err) {
      console.error("[production/entries/import]", err?.message);
      created = err?.insertedDocs?.length || 0;
      failed = docs.length - created;
    }
  }

  res.json({
    preview: false,
    department: check.department._id,
    fase, data: dataIso,
    summary: { created, failed, duplicates: duplicates.size, skipped: parsed.errors.length, truncated: parsed.truncated },
    errors: parsed.errors,
  });
});

async function loadEditableEntry(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(404).json({ message: "Riga non trovata." }); return null; }
  const entry = await ProductionEntry.findById(req.params.id);
  if (!entry) { res.status(404).json({ message: "Riga non trovata." }); return null; }
  const visible = req.user.visibleDepartmentIds();
  if (visible && !visible.includes(String(entry.department))) {
    res.status(403).json({ message: "Non hai accesso a questo reparto." });
    return null;
  }
  if (!isSupervisor(req.user) && String(entry.operatore) !== String(req.user._id)) {
    res.status(403).json({ message: "Puoi modificare solo le tue righe." });
    return null;
  }
  return entry;
}

router.put("/entries/:id", entryRules, validate, async (req, res) => {
  const entry = await loadEditableEntry(req, res);
  if (!entry) return;
  // La riga resta nel suo reparto (anche se nel frattempo disattivato); spostarla richiede
  // accesso al nuovo reparto, che deve essere attivo.
  const target = req.body.department || String(entry.department);
  const moving = target !== String(entry.department);
  const check = await checkDepartment(req.user, target, { forWrite: moving });
  if (check.status) return res.status(check.status).json({ message: check.message });
  const { fields, error } = await buildEntryFields(req, check.department, entry);
  if (error) return res.status(400).json({ message: error });

  // L'operatore della riga cambia solo se un supervisore lo chiede esplicitamente.
  if (req.body.operatore && String(req.body.operatore) !== String(entry.operatore)) {
    const op = await resolveOperatore(req, { _id: entry.operatore });
    if (op.error) return res.status(op.status).json({ message: op.error });
    fields.operatore = op.user._id;
    fields.operatoreNome = op.user.name || op.user.username;
  }
  entry.set(fields);
  await entry.save();
  res.json({ entry });
});

router.delete("/entries/:id", async (req, res) => {
  const entry = await loadEditableEntry(req, res);
  if (!entry) return;
  await entry.deleteOne();
  res.json({ message: "Riga eliminata." });
});

// ── Firma inizio / fine lavorazione ───────────────────────────
// Chi prende la commessa preme "Inizia", chi la completa "Finisci" (anche un altro
// utente). Ogni passo è un update condizionato: se due persone premono insieme,
// solo la prima vince e la seconda riceve 409, nessuna firma viene sovrascritta.

async function loadVisibleEntry(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(404).json({ message: "Riga non trovata." }); return null; }
  const entry = await ProductionEntry.findById(req.params.id).select("department").lean();
  if (!entry) { res.status(404).json({ message: "Riga non trovata." }); return null; }
  const visible = req.user.visibleDepartmentIds();
  if (visible && !visible.includes(String(entry.department))) {
    res.status(403).json({ message: "Non hai accesso a questo reparto." });
    return null;
  }
  return entry;
}

const nomeUtente = (u) => u.name || u.username;

router.post("/entries/:id/start", async (req, res) => {
  if (!(await loadVisibleEntry(req, res))) return;
  const now = new Date();
  const set = { iniziataDa: req.user._id, iniziataAt: now, firmaInizio: nomeUtente(req.user) };
  let entry = await ProductionEntry.findOneAndUpdate({ _id: req.params.id, iniziataAt: null }, { $set: set }, { new: true });
  if (!entry) return res.status(409).json({ message: "Commessa già iniziata." });
  // Riga importata senza operatore: diventa di chi l'ha presa
  if (!entry.operatore) {
    entry = await ProductionEntry.findOneAndUpdate({ _id: entry._id, operatore: null },
      { $set: { operatore: req.user._id, operatoreNome: nomeUtente(req.user) } }, { new: true }) || entry;
  }
  res.json({ entry });
});

router.post("/entries/:id/finish", async (req, res) => {
  if (!(await loadVisibleEntry(req, res))) return;
  const now = new Date();
  const entry = await ProductionEntry.findOneAndUpdate(
    { _id: req.params.id, iniziataAt: { $ne: null }, finitaAt: null },
    { $set: { finitaDa: req.user._id, finitaAt: now, firmaFine: nomeUtente(req.user), dataFine: dayStart(now.toISOString().slice(0, 10)) } },
    { new: true },
  );
  if (!entry) {
    const cur = await ProductionEntry.findById(req.params.id).select("iniziataAt").lean();
    return res.status(409).json({ message: cur?.iniziataAt ? "Commessa già finita." : "Prima va iniziata." });
  }
  res.json({ entry });
});

// Correzione di una firma messa per sbaglio: solo supervisori, annulla l'ultimo passo.
router.post("/entries/:id/undo", requireSupervisor, async (req, res) => {
  if (!(await loadVisibleEntry(req, res))) return;
  const entry = await ProductionEntry.findById(req.params.id);
  if (entry.finitaAt) entry.set({ finitaDa: null, finitaAt: null, firmaFine: "", dataFine: null });
  else if (entry.iniziataAt) entry.set({ iniziataDa: null, iniziataAt: null, firmaInizio: "" });
  else return res.status(409).json({ message: "Niente da annullare." });
  await entry.save();
  res.json({ entry });
});

// ── Confronto tempo standard vs impiegato ─────────────────────

// ── Panoramica per la Home: tutti i reparti visibili a colpo d'occhio ──
// Per ogni reparto: oggi e ultimi 7 giorni (righe, pezzi, efficienza), commesse in lavorazione
// (iniziate e non finite) e da avviare, andamento degli ultimi 14 giorni, 5S compilate oggi.
// Stessa visibilità dell'Andon (productionScope): reparti dell'utente e colleghi per gli operai.
const romeDay = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });   // YYYY-MM-DD
const OVERVIEW_DAYS = 14;

router.get("/overview", async (req, res) => {
  const scope = await productionScope(req, res);
  if (!scope) return;
  const today = romeDay();
  const from = new Date(dayStart(today)); from.setUTCDate(from.getUTCDate() - (OVERVIEW_DAYS - 1));
  const weekFrom = new Date(dayStart(today)); weekFrom.setUTCDate(weekFrom.getUTCDate() - 6);
  const sums = {
    righe:           { $sum: 1 },
    pezzi:           { $sum: "$quantita" },
    attesoMinuti:    { $sum: { $multiply: ["$tempoStdMinuti", "$quantita"] } },
    impiegatoMinuti: { $sum: "$tempoImpiegatoMinuti" },
  };

  const [departments, [agg], fiveS] = await Promise.all([
    Department.find({ isActive: true, ...visibleScope(req.user, "_id") }).sort({ order: 1, name: 1 }).select("name").lean(),
    ProductionEntry.aggregate([
      { $match: scope },
      { $facet: {
        perGiorno: [
          { $match: { data: { $gte: from } } },
          { $group: { _id: { dep: "$department", day: { $dateToString: { format: "%Y-%m-%d", date: "$data" } } }, ...sums } },
        ],
        inLavorazione: [
          { $match: { iniziataAt: { $ne: null }, finitaAt: null } },
          { $group: { _id: "$department", n: { $sum: 1 } } },
        ],
        daAvviare: [
          { $match: { iniziataAt: null, data: { $gte: from } } },
          { $group: { _id: "$department", n: { $sum: 1 } } },
        ],
      } },
    ]),
    ChecklistSubmission.aggregate([
      { $match: { date: today, ...visibleScope(req.user) } },
      { $group: { _id: "$department", n: { $sum: 1 } } },
    ]),
  ]);

  const eff = (r) => (r.impiegatoMinuti > 0 ? Math.round((r.attesoMinuti / r.impiegatoMinuti) * 100) / 100 : null);
  const add = (a, r) => ({ righe: a.righe + r.righe, pezzi: a.pezzi + r.pezzi,
    attesoMinuti: a.attesoMinuti + r.attesoMinuti, impiegatoMinuti: a.impiegatoMinuti + r.impiegatoMinuti });
  const zero = { righe: 0, pezzi: 0, attesoMinuti: 0, impiegatoMinuti: 0 };
  const count = (rows, id) => rows.find((r) => String(r._id) === id)?.n || 0;
  const days = Array.from({ length: OVERVIEW_DAYS }, (_, i) => {
    const d = new Date(from); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10);
  });

  const reparti = departments.map((d) => {
    const id = String(d._id);
    const mine = agg.perGiorno.filter((r) => String(r._id.dep) === id);
    const byDay = new Map(mine.map((r) => [r._id.day, r]));
    const oggi = byDay.get(today) || zero;
    const settimana = mine.filter((r) => new Date(dayStart(r._id.day)) >= weekFrom).reduce(add, zero);
    return {
      id, name: d.name,
      oggi:      { righe: oggi.righe, pezzi: oggi.pezzi, efficienza: eff(oggi) },
      settimana: { righe: settimana.righe, pezzi: settimana.pezzi, efficienza: eff(settimana) },
      inLavorazione: count(agg.inLavorazione, id),
      daAvviare:     count(agg.daAvviare, id),
      fiveSOggi:     count(fiveS, id),
      andamento: days.map((day) => { const r = byDay.get(day) || zero; return { day, pezzi: r.pezzi, efficienza: eff(r) }; }),
    };
  });

  const tot = (k) => reparti.reduce((s, r) => s + r[k], 0);
  const all = agg.perGiorno.reduce(add, zero);
  const allToday = agg.perGiorno.filter((r) => r._id.day === today).reduce(add, zero);
  res.json({
    oggi: today,
    totale: {
      pezziOggi: allToday.pezzi, efficienzaOggi: eff(allToday), efficienza14: eff(all),
      inLavorazione: tot("inLavorazione"), daAvviare: tot("daAvviare"), fiveSOggi: tot("fiveSOggi"),
    },
    reparti,
  });
});

router.get("/stats", periodRules, validate, async (req, res) => {
  const scope = await productionScope(req, res);
  if (!scope) return;
  const match = { ...periodFilter(req.query), ...scope };
  const sums = {
    righe:          { $sum: 1 },
    pezzi:          { $sum: "$quantita" },
    attesoMinuti:   { $sum: { $multiply: ["$tempoStdMinuti", "$quantita"] } },
    impiegatoMinuti:{ $sum: "$tempoImpiegatoMinuti" },
  };
  const [result] = await ProductionEntry.aggregate([
    { $match: match },
    { $facet: {
      totale:      [{ $group: { _id: null, ...sums } }],
      perOperatore:[{ $group: { _id: "$operatore", nome: { $last: "$operatoreNome" }, ...sums } }, { $sort: { nome: 1 } }],
      perCommessa: [{ $group: { _id: "$commessa", ...sums } }, { $sort: { _id: 1 } }],
      perGiorno:   [{ $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$data" } }, ...sums } }, { $sort: { _id: 1 } }],
    } },
  ]);

  // efficienza > 1 = più veloce dello standard
  const withEfficiency = (row) => ({
    ...row,
    efficienza: row.impiegatoMinuti > 0 ? Math.round((row.attesoMinuti / row.impiegatoMinuti) * 100) / 100 : null,
  });
  const empty = { righe: 0, pezzi: 0, attesoMinuti: 0, impiegatoMinuti: 0 };

  const hideStatsId = await hiddenSuperAdminId(req);
  const maskName = (row) => (hideStatsId && String(row._id) === hideStatsId ? { ...row, nome: "Altro operatore" } : row);
  res.json({
    totale:       withEfficiency(result.totale[0] ? { ...result.totale[0], _id: undefined } : empty),
    perOperatore: result.perOperatore.map(maskName).map(withEfficiency),
    perCommessa:  result.perCommessa.map(withEfficiency),
    perGiorno:    result.perGiorno.map(withEfficiency),
  });
});

// ── Report per periodo (grafici della dashboard) ed export Excel ──
// Stesso filtro nei due casi: periodo (giorno/settimana/mese che contiene "date") + reparti visibili.

const reportRules = [
  query("period").isIn(PERIODS).withMessage("Periodo non valido (giorno, settimana, mese)"),
  query("date").custom(isoDate).withMessage("Data non valida (YYYY-MM-DD)"),
  query("department").optional().isMongoId().withMessage("Reparto non valido"),
];

router.get("/report", reportRules, validate, async (req, res) => {
  const scope = await productionScope(req, res);
  if (!scope) return;
  res.json(await buildReport(scope, resolvePeriod(req.query.period, req.query.date), { hideUserId: await hiddenSuperAdminId(req) }));
});

router.get("/export", exportLimiter, [...reportRules, query("charts").optional().isIn(["0", "1"])], validate, async (req, res) => {
  const scope = await productionScope(req, res);
  if (!scope) return;
  const range = resolvePeriod(req.query.period, req.query.date);
  const report = await buildReport(scope, range, { withRows: true, hideUserId: await hiddenSuperAdminId(req) });
  const dept = scope.department ? await Department.findById(scope.department).select("name").lean() : null;
  const buffer = await buildAndonWorkbook(report, dept?.name || "Tutti i reparti visibili", req.query.charts === "1");

  const slug = (dept?.name || "reparti").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="andon_${slug}_${range.period}_${range.from}.xlsx"`,
    "Cache-Control": "no-store",
  });
  res.send(buffer);
});

module.exports = router;
