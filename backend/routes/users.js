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
const { protect, requireSupervisor, requireAdmin } = require("../middleware/auth");
const validate = require("../middleware/validate");
const badge    = require("../utils/badge");
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
  res.json({ users: users.map(u => ({ ...u, password: undefined, badgeSecretHash: undefined })) });
});

// Crea utente
router.post("/",
  [
    body("username").trim().isLength({ min: 3 }).withMessage("Username min 3 caratteri"),
    body("password").isLength({ min: 6 }).withMessage("Password min 6 caratteri"),
    body("name").trim().notEmpty().withMessage("Nome obbligatorio"),
    body("role").isIn(["supervisore","operatore"]).withMessage("Ruolo non valido"),
    body("email").optional({ checkFalsy: true }).isEmail().withMessage("Email non valida").normalizeEmail(),
  ],
  validate,
  async (req, res) => {
    try {
      const user = await User.create(req.body);
      res.status(201).json({ user: user.toPublic() });
    } catch (err) {
      if (err.code === 11000) {
        const field = Object.keys(err.keyPattern || {})[0];
        return res.status(409).json({ message: field === "email" ? "Email già in uso su un altro account." : "Username già in uso." });
      }
      res.status(500).json({ message: "Errore creazione utente." });
    }
  }
);

// Aggiorna utente
router.put("/:id",
  blockIfTargetIsAdmin,
  [
    body("role").optional().isIn(["supervisore","operatore"]),
    body("email").optional({ checkFalsy: true }).isEmail().withMessage("Email non valida").normalizeEmail(),
  ],
  validate,
  async (req, res) => {
    try {
      const { password, email, ...data } = req.body;
      // Email vuota ("") deve poter RIMUOVERE l'email esistente: con un indice
      // sparse, $set a null la valorizzerebbe comunque (il campo esisterebbe
      // con valore null), e il prossimo utente senza email fallirebbe con un
      // errore di chiave duplicata. $unset invece la rende assente, come per
      // un utente che non ha mai avuto un'email — coerente con models/User.js.
      const update = { $set: data };
      if (email === "") update.$unset = { email: 1 };
      else if (email !== undefined) update.$set.email = email;

      const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
      if (!user) return res.status(404).json({ message: "Utente non trovato." });
      res.json({ user: user.toPublic() });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ message: "Email già in uso su un altro account." });
      res.status(500).json({ message: "Errore aggiornamento utente." });
    }
  }
);

// Elimina definitivamente l'utente (solo admin — azione irreversibile)
router.delete("/:id", requireAdmin, blockIfTargetIsAdmin, async (req, res) => {
  if (req.params.id === req.user._id.toString())
    return res.status(400).json({ message: "Non puoi eliminare te stesso." });
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ message: "Utente non trovato." });
  res.json({ message: "Utente eliminato definitivamente." });
});

// Attiva/disattiva utente (reversibile — admin e supervisore)
router.put("/:id/status", blockIfTargetIsAdmin,
  [body("isActive").isBoolean().withMessage("Stato non valido")],
  validate,
  async (req, res) => {
    if (req.params.id === req.user._id.toString())
      return res.status(400).json({ message: "Non puoi disattivare te stesso." });
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true });
    if (!user) return res.status(404).json({ message: "Utente non trovato." });
    res.json({ user: user.toPublic() });
  }
);

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

// ── Badge QR/NFC di UN ALTRO utente (admin/supervisore) ────────
// Stessa logica di /api/auth/badge/* ma per conto di un altro account:
// utile perché un operatore senza badge non può accedere per generarsene
// uno da solo, e perché un badge fisico può andare perso/rubato.

// Genera/rigenera il badge — il segreto viene mostrato una sola volta.
router.post("/:id/badge/regenerate", blockIfTargetIsAdmin, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "Utente non trovato." });

    const secret = badge.generateSecret();
    target.badgeSecretHash = badge.hashSecret(secret);
    target.badgeIssuedAt   = new Date();
    target.badgeEnabled    = true;
    await target.save();

    const qrUrl  = badge.badgeUrl(target._id, secret, "qr");
    const nfcUrl = badge.badgeUrl(target._id, secret, "nfc");
    res.json({
      url:           qrUrl,
      nfcUrl,
      qrImage:       await badge.qrImageDataUrl(qrUrl),
      badgeIssuedAt: target.badgeIssuedAt,
    });
  } catch (err) {
    console.error("[users/badge/regenerate]", err);
    res.status(500).json({ message: "Errore generazione badge." });
  }
});

// Abilita/disabilita il badge
router.put("/:id/badge/status", blockIfTargetIsAdmin,
  [body("enabled").isBoolean().withMessage("Stato non valido")],
  validate,
  async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.id, { badgeEnabled: req.body.enabled }, { new: true });
    if (!user) return res.status(404).json({ message: "Utente non trovato." });
    res.json({ badgeEnabled: user.badgeEnabled });
  }
);

// Revoca il badge (nessun QR o tag NFC di quell'utente funzionerà più)
router.delete("/:id/badge", blockIfTargetIsAdmin, async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { badgeSecretHash: null, badgeIssuedAt: null }, { new: true });
  if (!user) return res.status(404).json({ message: "Utente non trovato." });
  res.json({ message: "Badge revocato." });
});

module.exports = router;
