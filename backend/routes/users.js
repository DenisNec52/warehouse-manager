/**
 * routes/users.js — Gestione utenti (admin e supervisore)
 *
 * Il ruolo "admin" non è mai assegnabile via API, nemmeno da un admin:
 * si ottiene solo tramite lo script di seed. Un supervisore inoltre non
 * può in alcun modo modificare, eliminare o resettare la password di
 * un account admin.
 */
const express  = require("express");
const { body } = require("express-validator");
const User     = require("../models/User");
const { protect, requireSupervisor } = require("../middleware/auth");
const validate = require("../middleware/validate");
const router   = express.Router();

router.use(protect, requireSupervisor);

// Blocca qualsiasi scrittura su un account admin da parte di un supervisore
async function blockIfTargetIsAdmin(req, res, next) {
  if (req.user.role === "admin") return next();
  const target = await User.findById(req.params.id).select("role");
  if (target?.role === "admin")
    return res.status(403).json({ message: "Non puoi modificare un account admin." });
  next();
}

// Lista utenti
router.get("/", async (_req, res) => {
  const users = await User.find().sort("-createdAt").lean();
  res.json({ users: users.map(u => ({ ...u, password: undefined })) });
});

// Crea utente
router.post("/",
  [
    body("username").trim().isLength({ min: 3 }).withMessage("Username min 3 caratteri"),
    body("password").isLength({ min: 6 }).withMessage("Password min 6 caratteri"),
    body("name").trim().notEmpty().withMessage("Nome obbligatorio"),
    body("role").isIn(["supervisore","operatore"]).withMessage("Ruolo non valido"),
  ],
  validate,
  async (req, res) => {
    try {
      const user = await User.create(req.body);
      res.status(201).json({ user: user.toPublic() });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ message: "Username già in uso." });
      res.status(500).json({ message: "Errore creazione utente." });
    }
  }
);

// Aggiorna utente
router.put("/:id",
  blockIfTargetIsAdmin,
  [body("role").optional().isIn(["supervisore","operatore"])],
  validate,
  async (req, res) => {
    const { password, ...data } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!user) return res.status(404).json({ message: "Utente non trovato." });
    res.json({ user: user.toPublic() });
  }
);

// Elimina utente
router.delete("/:id", blockIfTargetIsAdmin, async (req, res) => {
  if (req.params.id === req.user._id.toString())
    return res.status(400).json({ message: "Non puoi eliminare te stesso." });
  await User.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ message: "Utente disabilitato." });
});

// Reset password utente
router.put("/:id/password",
  blockIfTargetIsAdmin,
  [body("newPassword").isLength({ min: 8 }).withMessage("Password min 6 caratteri")],
  validate,
  async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Utente non trovato." });
    user.password = req.body.newPassword;
    await user.save();
    res.json({ message: "Password aggiornata." });
  }
);

module.exports = router;
