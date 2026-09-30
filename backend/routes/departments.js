// ══════════════════════════════════════════════════════════════
// routes/departments.js — Reparti / postazioni (gestione: solo admin)
// ══════════════════════════════════════════════════════════════
const express    = require("express");
const mongoose   = require("mongoose");
const { body }   = require("express-validator");
const Department = require("../models/Department");
const { protect, requireAdmin } = require("../middleware/auth");
const validate   = require("../middleware/validate");
const router     = express.Router();

router.use(protect);

// Tutti i reparti (anche disattivati: servono per leggere lo storico). L'interfaccia
// filtra quelli visibili all'utente con user.visibleDepartmentIds da /auth/me.
router.get("/", async (_req, res) => {
  const departments = await Department.find().sort({ order: 1, name: 1 }).lean();
  res.json({ departments });
});

const rules = [
  body("name").trim().notEmpty().withMessage("Nome reparto obbligatorio").isLength({ max: 60 }),
  body("order").optional().isInt({ min: 0, max: 999 }).toInt(),
  body("isActive").optional().isBoolean().toBoolean(),
];

router.post("/", requireAdmin, rules, validate, async (req, res) => {
  try {
    const last = await Department.findOne().sort({ order: -1 }).select("order");
    const department = await Department.create({
      name: req.body.name,
      order: req.body.order ?? (last ? last.order + 1 : 0),
      createdBy: req.user._id,
    });
    res.status(201).json({ department });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Esiste già un reparto con questo nome." });
    res.status(500).json({ message: "Errore creazione reparto." });
  }
});

router.put("/:id", requireAdmin, rules, validate, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Reparto non trovato." });
  try {
    const update = { name: req.body.name };
    if (req.body.order !== undefined)    update.order = req.body.order;
    if (req.body.isActive !== undefined) update.isActive = req.body.isActive;
    const department = await Department.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!department) return res.status(404).json({ message: "Reparto non trovato." });
    res.json({ department });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Esiste già un reparto con questo nome." });
    res.status(500).json({ message: "Errore modifica reparto." });
  }
});

// Nessuna eliminazione: tempi, righe Andon e compilazioni 5S continuano a riferirsi al reparto.
// Si disattiva con PUT { isActive: false }.

module.exports = router;
