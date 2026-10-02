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

// ── POST /api/products — crea prodotto ────────────────────────
router.post("/",
  [
    body("code").trim().notEmpty().withMessage("Codice obbligatorio"),
    body("quantity").isInt({ min: 0 }).withMessage("Quantità deve essere >= 0"),
    body("minQuantity").optional().isInt({ min: 0 }),
    body("unitPrice").optional().isFloat({ min: 0 }),
  ],
  validate,
  async (req, res) => {
    try {
      // Converti categoria vuota in null per evitare errore ObjectId
      if (!req.body.category) req.body.category = null;

      // Duplicato solo se stesso codice sulla STESSA pedana/categoria —
      // lo stesso codice può legittimamente comparire su pedane diverse
      const existing = await Product.findOne({
        code: req.body.code.toUpperCase(),
        pallet:   req.body.pallet   ?? null,
        category: req.body.category ?? null,
      });
      if (existing)
        return res.status(409).json({ message: `Codice ${req.body.code.toUpperCase()} già presente su questa pedana.` });

      const { commessa, posizione } = parseCode(req.body.code);

      // Prima voce dello storico posizionamento, se pedana/piano/arrivo indicati
      const placementHistory = (req.body.floor || req.body.pallet || req.body.arrivalDate)
        ? [{
            arrivalDate:  req.body.arrivalDate || null,
            floor:        req.body.floor  || null,
            pallet:       req.body.pallet || null,
            note:         req.body.notes || "",
            placedBy:     req.user._id,
            placedByName: req.user.name,
          }]
        : [];

      const product = await Product.create({
        ...req.body,
        name:      req.body.name || req.body.code.toUpperCase(),
        code:      req.body.code.toUpperCase(),
        commessa, posizione,
        placementHistory,
        createdBy: req.user._id,
      });

      await product.populate("category", "name color icon");

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
      res.status(500).json({ message: err.message || "Errore creazione prodotto." });
    }
  }
);

// ── PUT /api/products/:id — aggiorna prodotto ─────────────────
router.put("/:id",
  [
    body("name").optional().trim().notEmpty(),
    body("quantity").optional().isInt({ min: 0 }),
    body("minQuantity").optional().isInt({ min: 0 }),
    body("unitPrice").optional().isFloat({ min: 0 }),
    body("floor").optional({ nullable: true }).isInt({ min: 1, max: 5 }),
    body("pallet").optional({ nullable: true }).isInt({ min: 1, max: 30 }),
    body("arrivalDate").optional({ nullable: true }).isISO8601(),
  ],
  validate,
  async (req, res) => {
    try {
      const prev = await Product.findById(req.params.id);
      if (!prev || !prev.isActive)
        return res.status(404).json({ message: "Prodotto non trovato." });

      const { code, ...data } = req.body;

      // Se cambia il codice, duplicato solo se stesso codice sulla STESSA
      // pedana/categoria di destinazione — mai bloccare per un codice
      // uguale ma su un'altra pedana (è un articolo fisicamente diverso).
      if (code) {
        const effPallet   = data.pallet   !== undefined ? data.pallet   : prev.pallet;
        const effCategory = data.category !== undefined ? data.category : prev.category;
        const existing = await Product.findOne({
          code: code.toUpperCase(), pallet: effPallet ?? null, category: effCategory ?? null,
          _id: { $ne: req.params.id },
        });
        if (existing)
          return res.status(409).json({ message: `Codice ${code.toUpperCase()} già presente su questa pedana.` });
        data.code = code.toUpperCase();
        Object.assign(data, parseCode(code));
      }

      // Traccia una nuova voce di posizionamento se piano/pedana/data
      // arrivo cambiano — non sovrascrive mai lo storico precedente
      const floorChanged   = data.floor       !== undefined && data.floor       != prev.floor;
      const palletChanged  = data.pallet      !== undefined && data.pallet      != prev.pallet;
      const arrivalChanged = data.arrivalDate !== undefined && String(data.arrivalDate) !== String(prev.arrivalDate || "");
      const update = { $set: { ...data, updatedBy: req.user._id } };
      if (floorChanged || palletChanged || arrivalChanged) {
        update.$push = {
          placementHistory: {
            arrivalDate:  data.arrivalDate !== undefined ? data.arrivalDate : prev.arrivalDate,
            floor:        data.floor       !== undefined ? data.floor      : prev.floor,
            pallet:       data.pallet      !== undefined ? data.pallet     : prev.pallet,
            note:         data.placementNote || "",
            placedBy:     req.user._id,
            placedByName: req.user.name,
          },
        };
      }
      delete update.$set.placementNote;

      const product = await Product.findByIdAndUpdate(
        req.params.id, update,
        { new: true, runValidators: true }
      ).populate("category", "name color icon");

      // Verifica soglia dopo aggiornamento
      const wasOk  = prev.quantity > prev.minQuantity;
      const isNow  = product.quantity <= product.minQuantity;
      if (wasOk && isNow) {
        await Notification.create({
          type:    "low_stock",
          title:   `Scorta bassa — ${product.name}`,
          message: `Il prodotto ${product.code} è sceso a ${product.quantity} ${product.unit}.`,
          link:    `/products/${product._id}`,
        });
        email.sendLowStockAlert(product).catch(() => {});
      }

      res.json({ product });
    } catch (err) {
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
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: false, updatedBy: req.user._id },
      { new: true }
    );
    if (!product) return res.status(404).json({ message: "Prodotto non trovato." });
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
