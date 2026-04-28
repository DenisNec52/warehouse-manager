const express  = require("express");
const Category = require("../models/Category");
const auth     = require("../middleware/auth");
const router   = express.Router();

router.use(auth);

// GET /api/categories — tutti gli utenti
router.get("/", async (_req, res) => {
  try {
    const cats = await Category.find().sort({ createdAt: 1 }).lean();
    res.json({ categories: cats.map(c => c.name) });
  } catch (err) {
    res.status(500).json({ message: "Errore nel recupero reparti." });
  }
});

// POST /api/categories — solo Amministratore
router.post("/", async (req, res) => {
  try {
    if (req.user.role !== "Amministratore")
      return res.status(403).json({ message: "Solo l'Amministratore può aggiungere reparti." });

    const { name } = req.body;
    if (!name?.trim())
      return res.status(400).json({ message: "Nome reparto obbligatorio." });

    const exists = await Category.findOne({ name: name.trim() });
    if (exists) return res.status(409).json({ message: "Reparto già esistente." });

    const cat = await Category.create({ name: name.trim(), createdBy: req.user.name });
    res.status(201).json({ category: cat.name });
  } catch (err) {
    res.status(500).json({ message: "Errore nella creazione del reparto." });
  }
});

// DELETE /api/categories/:name — solo Amministratore
router.delete("/:name", async (req, res) => {
  try {
    if (req.user.role !== "Amministratore")
      return res.status(403).json({ message: "Solo l'Amministratore può eliminare reparti." });
    await Category.deleteOne({ name: req.params.name });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Errore nella rimozione del reparto." });
  }
});

module.exports = router;
