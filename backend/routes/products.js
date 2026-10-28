/**
 * routes/products.js
 *
 * CRUD completo prodotti con ricerca, filtri e paginazione.
 * GET    /api/products          — lista con filtri
 * GET    /api/products/:id      — dettaglio
 * POST   /api/products          — crea
 * PUT    /api/products/:id      — aggiorna
 * DELETE /api/products/:id      — elimina (soft delete)
 * GET    /api/products/low-stock — prodotti sotto soglia
 */
const express  = require("express");
const { body } = require("express-validator");
const Product  = require("../models/Product");
const Notification = require("../models/Notification");
const { maskField, visibilityContext } = require("../utils/colleagues");
const { protect, requireAdmin } = require("../middleware/auth");
const validate = require("../middleware/validate");
const email    = require("../utils/email");
const { parseCode } = require("../utils/codeParser");
const { makeUploader, cloudinary, ENABLED: CLOUDINARY_ENABLED } = require("../config/cloudinary");
const mongoose = require("mongoose");
const { audit, diff } = require("../utils/audit");
const { inTransaction } = require("../utils/transactions");
const { recordMovement, afterMovement, StockError } = require("../services/stock");
const { serializeProduct } = require("../services/serializers");
const events = require("../services/events");

const router = express.Router();
const uploadCover = makeUploader();
router.use(protect);  // tutte le route richiedono autenticazione

// ── GET /api/products — lista con ricerca e filtri ────────────
router.get("/", async (req, res) => {
  try {
    // I parametri arrivano dalla query string: forziamo il tipo così un valore inatteso
    // (es. ?search[$ne]=) non manda in errore 500 la ricerca.
    const asStr = (v) => (typeof v === "string" ? v : "");
    const search = asStr(req.query.search).trim();
    const category = asStr(req.query.category);
    const lowStock = asStr(req.query.lowStock);
    const sortFields = ["createdAt", "-createdAt", "name", "-name", "quantity", "-quantity", "code", "-code"];
    const sort = sortFields.includes(req.query.sort) ? req.query.sort : "-createdAt";
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const filter = { isActive: true };

    // Se la ricerca è nel formato "commessa-posizione" (es. "1684-2" o
    // "1684/2"), match esatto: mai risultati di commesse diverse che
    // condividono solo la posizione. Altrimenti ricerca full-text normale.
    if (search) {
      const posMatch = search.trim().match(/^(.+?)[-/](\d+)$/);
      if (posMatch) {
        filter.commessa  = posMatch[1].trim().toUpperCase();
        filter.posizione = parseInt(posMatch[2], 10);
      } else {
        filter.$text = { $search: search };
      }
    }
    if (category) filter.category = category;
    if (lowStock === "true") filter.$expr = { $lte: ["$quantity", "$minQuantity"] };

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Product.countDocuments(filter);

    const products = await Product.find(filter)
      .populate("category", "name color icon")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Aggiunge flag isLowStock a ogni prodotto
    const result = products.map(p => ({
      ...p,
      isLowStock: p.quantity <= p.minQuantity,
    }));

    res.json({
      products: result,
      pagination: {
        page:  parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Errore nel recupero prodotti." });
  }
});

// ── GET /api/products/low-stock ───────────────────────────────
router.get("/low-stock", async (req, res) => {
  try {
    const products = await Product.find({
      isActive: true,
      $expr: { $lte: ["$quantity", "$minQuantity"] },
    })
      .populate("category", "name color icon")
      .sort("quantity")
      .limit(50)
      .lean();

    res.json({ products: products.map(p => ({ ...p, isLowStock: true })) });
  } catch (err) {
    res.status(500).json({ message: "Errore." });
  }
});

// ── GET /api/products/:id ─────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("category", "name color icon")
      .populate("createdBy", "name username")
      .populate("updatedBy", "name username");

    if (!product || !product.isActive)
      return res.status(404).json({ message: "Prodotto non trovato." });

    const ctx = await visibilityContext(req);
    res.json({ product: maskField(maskField(product, "createdBy", ctx), "updatedBy", ctx) });
  } catch (err) {
    res.status(500).json({ message: "Errore." });
  }
});

// ── Campi modificabili dal client ─────────────────────────────
// Whitelist esplicita: tutto il resto del body (isActive, createdBy, updatedBy,
// placementHistory, images, commessa/posizione...) viene ignorato. Senza questa
// lista un utente qualsiasi poteva disattivare un prodotto (aggirando il DELETE
// riservato agli admin) o riscriverne lo storico di posizionamento.
const EDITABLE_FIELDS = [
  "name", "description", "minQuantity", "unit", "category", "location",
  "floor", "pallet", "arrivalDate", "supplier", "unitPrice", "notes",
];
// Campi confrontati nel registro modifiche.
const AUDITED_FIELDS = ["code", "quantity", ...EDITABLE_FIELDS];

const pick = (src, keys) => {
  const out = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out;
};
const isManager = (user) => user.role === "admin" || user.role === "supervisore";

const productRules = [
  body("name").optional().isString().trim(),
  body("description").optional().isString().trim(),
  body("unit").optional().isString().trim().isLength({ max: 20 }),
  body("location").optional().isString().trim().isLength({ max: 100 }),
  body("supplier").optional().isString().trim().isLength({ max: 200 }),
  body("notes").optional().isString().trim().isLength({ max: 2000 }),
  body("minQuantity").optional().isInt({ min: 0 }).toInt(),
  body("unitPrice").optional().isFloat({ min: 0 }).toFloat(),
  body("category").optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage("Categoria non valida"),
  body("floor").optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: 5 }).toInt(),
  body("pallet").optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: 30 }).toInt(),
  body("arrivalDate").optional({ nullable: true, checkFalsy: true }).isISO8601(),
];

// "" e null significano "nessun valore" per i riferimenti e i numeri opzionali.
function normalizeEmpty(data) {
  for (const k of ["category", "floor", "pallet", "arrivalDate"]) {
    if (k in data && (data[k] === "" || data[k] === null)) data[k] = null;
  }
  return data;
}

// ── POST /api/products — crea prodotto ────────────────────────
// La quantità iniziale si imposta qui (resta tracciata nel registro modifiche);
// da quel momento cambia solo tramite movimenti.
router.post("/",
  [
    body("code").isString().trim().notEmpty().withMessage("Codice obbligatorio"),
    body("quantity").isInt({ min: 0 }).withMessage("Quantità deve essere >= 0").toInt(),
    ...productRules,
  ],
  validate,
  async (req, res) => {
    try {
      const data = normalizeEmpty(pick(req.body, EDITABLE_FIELDS));
      const code = req.body.code.toUpperCase();

      // Duplicato solo se stesso codice sulla STESSA pedana/categoria —
      // lo stesso codice può legittimamente comparire su pedane diverse
      const existing = await Product.findOne({
        code,
        pallet:   data.pallet   ?? null,
        category: data.category ?? null,
      });
      if (existing)
        return res.status(409).json({ message: `Codice ${code} già presente su questa pedana.` });

      const { commessa, posizione } = parseCode(req.body.code);

      // Prima voce dello storico posizionamento, se pedana/piano/arrivo indicati
      const placementHistory = (data.floor || data.pallet || data.arrivalDate)
        ? [{
            arrivalDate:  data.arrivalDate || null,
            floor:        data.floor  || null,
            pallet:       data.pallet || null,
            note:         data.notes || "",
            placedBy:     req.user._id,
            placedByName: req.user.name,
          }]
        : [];

      const product = await Product.create({
        ...data,
        name:      data.name || code,
        code,
        quantity:  req.body.quantity,
        commessa, posizione,
        placementHistory,
        createdBy: req.user._id,
      });

      await product.populate("category", "name color icon");

      await audit(req, {
        action: "product.create", entityType: "product", entityId: product._id, entityLabel: product.code,
        changes: diff({}, product.toObject(), AUDITED_FIELDS),
      });
      events.emit("product.created", serializeProduct(product));

      // Controlla se già sotto soglia al momento della creazione
      if (product.quantity <= product.minQuantity) {
        await Notification.create({
          type:    "low_stock",
          title:   `Scorta bassa — ${product.name}`,
          message: `Il prodotto ${product.code} ha quantità ${product.quantity} ${product.unit} (soglia: ${product.minQuantity}).`,
          link:    `/products/${product._id}`,
          meta:    { productId: product._id },
        });
        email.sendLowStockAlert(product).catch(() => {});
      }

      res.status(201).json({ product });
    } catch (err) {
      console.error("[products/post]", err.message, JSON.stringify(err.errors || {}));
      if (err.code === 11000)
        return res.status(409).json({ message: "Codice prodotto già esistente." });
      if (err.name === "ValidationError")
        return res.status(400).json({ message: "Dati prodotto non validi." });
      res.status(500).json({ message: "Errore creazione prodotto." });
    }
  }
);

// ── PUT /api/products/:id — aggiorna prodotto ─────────────────
// La quantità NON si modifica più direttamente: se cambia, admin e supervisori
// generano una "rettifica inventario" (movimento IN/OUT tracciato, nella stessa
// transazione); un operatore riceve 403 e deve registrare un movimento.
router.put("/:id",
  [
    body("code").optional().isString().trim().notEmpty(),
    body("name").optional().isString().trim().notEmpty(),
    body("quantity").optional().isInt({ min: 0 }).toInt(),
    body("placementNote").optional().isString().trim().isLength({ max: 500 }),
    body("adjustmentReason").optional().isString().trim().isLength({ max: 200 }),
    ...productRules,
  ],
  validate,
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ message: "Prodotto non trovato." });

    try {
      const data = normalizeEmpty(pick(req.body, EDITABLE_FIELDS));
      const code = typeof req.body.code === "string" ? req.body.code : undefined;
      const wantedQty = req.body.quantity;

      const result = await inTransaction(async (session) => {
        const prev = await Product.findById(req.params.id).session(session);
        if (!prev || !prev.isActive) return { abort: true, status: 404, message: "Prodotto non trovato." };
        const before = prev.toObject();

        const qtyChanged = wantedQty !== undefined && wantedQty !== prev.quantity;
        if (qtyChanged && !isManager(req.user))
          return { abort: true, status: 403, message: "La quantità si modifica registrando un movimento di entrata o uscita." };

        // Se cambia il codice, duplicato solo se stesso codice sulla STESSA
        // pedana/categoria di destinazione — mai bloccare per un codice
        // uguale ma su un'altra pedana (è un articolo fisicamente diverso).
        if (code) {
          const effPallet   = data.pallet   !== undefined ? data.pallet   : prev.pallet;
          const effCategory = data.category !== undefined ? data.category : prev.category;
          const existing = await Product.findOne({
            code: code.toUpperCase(), pallet: effPallet ?? null, category: effCategory ?? null,
            _id: { $ne: prev._id },
          }).session(session);
          if (existing)
            return { abort: true, status: 409, message: `Codice ${code.toUpperCase()} già presente su questa pedana.` };
          data.code = code.toUpperCase();
          Object.assign(data, parseCode(code));
        }

        // Traccia una nuova voce di posizionamento se piano/pedana/data
        // arrivo cambiano — non sovrascrive mai lo storico precedente
        const floorChanged   = data.floor       !== undefined && data.floor       != prev.floor;
        const palletChanged  = data.pallet      !== undefined && data.pallet      != prev.pallet;
        const arrivalChanged = data.arrivalDate !== undefined && String(data.arrivalDate ? new Date(data.arrivalDate) : "") !== String(prev.arrivalDate || "");
        const update = { $set: { ...data, updatedBy: req.user._id } };
        if (floorChanged || palletChanged || arrivalChanged) {
          update.$push = {
            placementHistory: {
              arrivalDate:  data.arrivalDate !== undefined ? data.arrivalDate : prev.arrivalDate,
              floor:        data.floor       !== undefined ? data.floor      : prev.floor,
              pallet:       data.pallet      !== undefined ? data.pallet     : prev.pallet,
              note:         req.body.placementNote || "",
              placedBy:     req.user._id,
              placedByName: req.user.name,
            },
          };
        }
        await Product.updateOne({ _id: prev._id }, update, { session, runValidators: true });

        let adjustment = null;
        if (qtyChanged) {
          const fresh = await Product.findById(prev._id).session(session);
          const delta = wantedQty - fresh.quantity;
          adjustment = await recordMovement({
            product: fresh,
            type: delta > 0 ? "IN" : "OUT",
            quantity: Math.abs(delta),
            actor: req.user,
            extra: { reason: req.body.adjustmentReason || "Rettifica inventario", source: "adjustment" },
          }, session);
        }

        const product = await Product.findById(prev._id).session(session);
        await audit(req, {
          action: "product.update", entityType: "product", entityId: product._id, entityLabel: product.code,
          changes: diff(before, product.toObject(), AUDITED_FIELDS),
          meta: adjustment ? { adjustmentMovementId: String(adjustment.movement._id) } : undefined,
        }, { session });
        return { prev: before, product, adjustment };
      });

      if (result.abort) return res.status(result.status).json({ message: result.message });

      const { prev, adjustment } = result;
      const product = await Product.findById(result.product._id).populate("category", "name color icon");

      if (adjustment) {
        await afterMovement(adjustment, { actorName: req.user.name });
      } else {
        // Verifica soglia dopo aggiornamento (es. soglia minima alzata)
        const wasOk = prev.quantity > prev.minQuantity;
        const isNow = product.quantity <= product.minQuantity;
        if (wasOk && isNow) {
          await Notification.create({
            type:    "low_stock",
            title:   `Scorta bassa — ${product.name}`,
            message: `Il prodotto ${product.code} è sceso a ${product.quantity} ${product.unit}.`,
            link:    `/products/${product._id}`,
          });
          email.sendLowStockAlert(product).catch(() => {});
        }
      }
      events.emit("product.updated", serializeProduct(product));

      res.json({ product });
    } catch (err) {
      if (err instanceof StockError) return res.status(err.status).json({ message: err.message, ...err.extra });
      if (err.name === "ValidationError" || err.name === "CastError")
        return res.status(400).json({ message: "Dati prodotto non validi." });
      console.error("[products/put]", err.message);
      res.status(500).json({ message: "Errore aggiornamento prodotto." });
    }
  }
);

// ── POST /api/products/:id/cover — carica/sostituisce la copertina ──
// multipart/form-data, campo file: "image". Vedi config/cloudinary.js.
router.post("/:id/cover", uploadCover, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Nessuna immagine ricevuta (campo 'image' mancante)." });

    const product = await Product.findById(req.params.id);
    if (!product || !product.isActive) return res.status(404).json({ message: "Prodotto non trovato." });

    // Rimuove la vecchia copertina da Cloudinary per non accumulare file orfani
    // (best-effort: se fallisce non blocca il salvataggio della nuova).
    if (product.coverImage?.publicId) {
      cloudinary.uploader.destroy(product.coverImage.publicId).catch(() => {});
    }

    const image = { url: req.file.path, publicId: req.file.filename, alt: product.name };
    product.coverImage = image;
    product.images.push(image);
    product.updatedBy  = req.user._id;
    await product.save();

    res.json({ coverImage: product.coverImage });
  } catch (err) {
    console.error("[products/cover]", err.message);
    res.status(500).json({ message: err.message || "Errore upload immagine." });
  }
});

// ── DELETE /api/products/:id/cover — rimuove la copertina ─────
router.delete("/:id/cover", async (req, res) => {
  try {
    if (!CLOUDINARY_ENABLED) return res.status(503).json({ message: "Upload immagini non configurato." });

    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Prodotto non trovato." });

    const publicId = product.coverImage?.publicId;
    if (publicId) {
      cloudinary.uploader.destroy(publicId).catch(() => {});
      product.images = product.images.filter(img => img.publicId !== publicId);
    }
    product.coverImage  = undefined;
    product.updatedBy   = req.user._id;
    await product.save();

    res.json({ message: "Immagine rimossa." });
  } catch (err) {
    res.status(500).json({ message: "Errore rimozione immagine." });
  }
});

// ── DELETE /api/products/:id — soft delete ────────────────────
router.delete("/:id", requireAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Prodotto non trovato." });
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: false, updatedBy: req.user._id },
      { new: true }
    );
    if (!product) return res.status(404).json({ message: "Prodotto non trovato." });
    await audit(req, {
      action: "product.delete", entityType: "product", entityId: product._id, entityLabel: product.code,
      changes: [{ field: "isActive", from: true, to: false }],
      meta: { quantityAtDelete: product.quantity },
    });
    events.emit("product.updated", serializeProduct(product));
    res.json({ message: "Prodotto eliminato.", id: req.params.id });
  } catch (err) {
    res.status(500).json({ message: "Errore eliminazione." });
  }
});

// ── POST /api/products/import-legacy — importa warehouse_inventory.json ──
// Idempotente: salta i prodotti già presenti (stesso codice+categoria+pedana).
// Con { reset: true } nel body, rimuove prima i prodotti creati dal vecchio
// formato di import (codice con suffisso interno) per un reimport pulito.
router.post("/import-legacy", requireAdmin, async (req, res) => {
  try {
    const path = require("path");
    const fs   = require("fs");
    const { importInventory, resetLegacyImport, backfillCommessaPosizione } = require("../utils/inventoryImporter");

    const inventoryPath = path.join(__dirname, "../utils/warehouse_inventory.json");
    if (!fs.existsSync(inventoryPath))
      return res.status(404).json({ message: "warehouse_inventory.json non trovato sul server." });

    // Allinea gli indici Mongo allo schema corrente (rimuove il vecchio
    // indice unico su "code" se ancora presente da prima della modifica).
    await Product.syncIndexes();

    let removed = 0;
    if (req.body?.reset) removed = await resetLegacyImport();

    const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf-8"));
    const stats = await importInventory(inventory, { adminId: req.user._id });
    const backfilled = await backfillCommessaPosizione();
    res.json({ message: "Import completato.", removed, backfilled, stats });
  } catch (err) {
    console.error("[products/import-legacy]", err.message);
    res.status(500).json({ message: "Errore durante l'import." });
  }
});

module.exports = router;
