// ══════════════════════════════════════════════════════════════
// routes/categories.js
// ══════════════════════════════════════════════════════════════
const express  = require("express");
const mongoose = require("mongoose");
const { body } = require("express-validator");
const Category = require("../models/Category");
const { protect, requireAdmin } = require("../middleware/auth");
const validate = require("../middleware/validate");
const router   = express.Router();

router.use(protect);

// Solo questi campi arrivano dal client (whitelist): createdBy, isActive, _id ecc. no.
const categoryRules = (optionalName) => [
  (optionalName ? body("name").optional() : body("name")).isString().trim().notEmpty().isLength({ max: 60 }).withMessage("Nome obbligatorio (max 60 caratteri)"),
  body("description").optional().isString().trim().isLength({ max: 300 }),
  body("color").optional().matches(/^#[0-9a-fA-F]{6}$/).withMessage("Colore non valido (#rrggbb)"),
  body("icon").optional().isString().trim().isLength({ max: 16 }), // emoji composte (ZWJ) occupano più caratteri
];
const categoryFields = (b) => Object.fromEntries(
  ["name", "description", "color", "icon"].filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));

router.get("/", async (_req, res) => {
  const cats = await Category.find({ isActive: true }).sort("name").lean();
  res.json({ categories: cats });
});

router.post("/", requireAdmin, categoryRules(false), validate,
  async (req, res) => {
    try {
      const cat = await Category.create({ ...categoryFields(req.body), createdBy: req.user._id });
      res.status(201).json({ category: cat });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ message: "Categoria già esistente." });
      res.status(500).json({ message: "Errore." });
    }
  }
);

router.put("/:id", requireAdmin, categoryRules(true), validate, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Categoria non trovata." });
  try {
    const cat = await Category.findByIdAndUpdate(req.params.id, { $set: categoryFields(req.body) }, { new: true, runValidators: true });
    if (!cat) return res.status(404).json({ message: "Categoria non trovata." });
    res.json({ category: cat });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Categoria già esistente." });
    throw err;
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Categoria non trovata." });
  await Category.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ message: "Categoria eliminata." });
});

module.exports = router;
