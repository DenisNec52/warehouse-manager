// ══════════════════════════════════════════════════════════════
// routes/categories.js
// ══════════════════════════════════════════════════════════════
const express  = require("express");
const { body } = require("express-validator");
const Category = require("../models/Category");
const { protect, requireAdmin } = require("../middleware/auth");
const validate = require("../middleware/validate");
const router   = express.Router();

router.use(protect);

router.get("/", async (_req, res) => {
  const cats = await Category.find({ isActive: true }).sort("name").lean();
  res.json({ categories: cats });
});

router.post("/", requireAdmin,
  [body("name").trim().notEmpty().withMessage("Nome obbligatorio")],
  validate,
  async (req, res) => {
    try {
      const cat = await Category.create({ ...req.body, createdBy: req.user._id });
      res.status(201).json({ category: cat });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ message: "Categoria già esistente." });
      res.status(500).json({ message: "Errore." });
    }
  }
);

router.put("/:id", requireAdmin, async (req, res) => {
  const cat = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!cat) return res.status(404).json({ message: "Categoria non trovata." });
  res.json({ category: cat });
});

router.delete("/:id", requireAdmin, async (req, res) => {
  await Category.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ message: "Categoria eliminata." });
});

module.exports = router;
