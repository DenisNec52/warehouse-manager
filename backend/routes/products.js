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
const { body, query } = require("express-validator");
const Product  = require("../models/Product");
const Notification = require("../models/Notification");
const { protect, requireAdmin } = require("../middleware/auth");
const validate = require("../middleware/validate");
const email    = require("../utils/email");

const router = express.Router();
router.use(protect);  // tutte le route richiedono autenticazione

// ── GET /api/products — lista con ricerca e filtri ────────────
router.get("/", async (req, res) => {
  try {
    const { search, category, lowStock, page = 1, limit = 20, sort = "-createdAt" } = req.query;
    const filter = { isActive: true };

    // Ricerca full-text su nome, codice, descrizione
    if (search) filter.$text = { $search: search };
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

    res.json({ product });
  } catch (err) {
    res.status(500).json({ message: "Errore." });
  }
});

// ── POST /api/products — crea prodotto ────────────────────────
router.post("/",
  [
    body("name").trim().notEmpty().withMessage("Nome obbligatorio"),
    body("code").trim().notEmpty().withMessage("Codice obbligatorio"),
    body("quantity").isInt({ min: 0 }).withMessage("Quantità deve essere >= 0"),
    body("minQuantity").optional().isInt({ min: 0 }),
    body("unitPrice").optional().isFloat({ min: 0 }),
  ],
  validate,
  async (req, res) => {
    try {
      // Controlla codice duplicato
      const existing = await Product.findOne({ code: req.body.code.toUpperCase() });
      if (existing)
        return res.status(409).json({ message: `Codice ${req.body.code.toUpperCase()} già esistente.` });

      const product = await Product.create({
        ...req.body,
        code:      req.body.code.toUpperCase(),
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
      if (err.code === 11000)
        return res.status(409).json({ message: "Codice prodotto già esistente." });
      res.status(500).json({ message: "Errore creazione prodotto." });
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
  ],
  validate,
  async (req, res) => {
    try {
      const { code, ...data } = req.body;

      // Se cambia il codice, controlla duplicati
      if (code) {
        const existing = await Product.findOne({ code: code.toUpperCase(), _id: { $ne: req.params.id } });
        if (existing)
          return res.status(409).json({ message: `Codice ${code.toUpperCase()} già in uso.` });
        data.code = code.toUpperCase();
      }

      const prev    = await Product.findById(req.params.id);
      if (!prev || !prev.isActive)
        return res.status(404).json({ message: "Prodotto non trovato." });

      const product = await Product.findByIdAndUpdate(
        req.params.id,
        { ...data, updatedBy: req.user._id },
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

module.exports = router;
