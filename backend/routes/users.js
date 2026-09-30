/**
 * routes/users.js — Gestione utenti (admin e supervisore)
 *
 * Gerarchia:
 * - super-admin (uno solo, User.isSuperAdmin): nessun altro può eliminarlo, disattivarlo,
 *   declassarlo, cambiargli password o badge. Il flag non è assegnabile via API.
 * - admin: possono creare altri admin e gestirsi a vicenda.
 * - supervisore: gestisce operatori e supervisori, mai account admin, e non può creare admin.
 *
 * Creazione e modifica accettano solo i campi elencati qui sotto: il resto del body
 * (isSuperAdmin, badgeSecretHash, isActive...) viene ignorato.
 */
const express  = require("express");
const mongoose = require("mongoose");
const { body } = require("express-validator");
const User       = require("../models/User");
const Department = require("../models/Department");
const { protect, requireSupervisor, requireAdmin } = require("../middleware/auth");
const validate = require("../middleware/validate");
const badge    = require("../utils/badge");
const router   = express.Router();

router.use(protect, requireSupervisor);

const ROLES = ["admin", "supervisore", "operatore"];

/**
 * Carica il destinatario e verifica che chi agisce possa gestirlo:
 * - il super-admin lo gestisce solo lui stesso;
 * - un supervisore non tocca gli account admin.
 */
async function loadManageableTarget(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Utente non trovato." });
  let target;
  try { target = await User.findById(req.params.id); } catch (err) { return next(err); }
  if (!target) return res.status(404).json({ message: "Utente non trovato." });
  const isSelf = String(target._id) === String(req.user._id);
  if (target.isSuperAdmin && !isSelf)
    return res.status(403).json({ message: "L'account super-admin può essere gestito solo dal suo titolare." });
  if (target.role === "admin" && req.user.role !== "admin")
    return res.status(403).json({ message: "Non puoi modificare un account admin." });
  req.target = target;
  next();
}

/** Id reparto validi ed esistenti, oppure un messaggio d'errore. */
async function validDepartmentIds(ids) {
  if (!Array.isArray(ids)) return { error: "Reparti non validi." };
  const unique = [...new Set(ids.map(String))];
  if (!unique.every(id => mongoose.isValidObjectId(id))) return { error: "Reparti non validi." };
  const found = await Department.countDocuments({ _id: { $in: unique } });
  if (found !== unique.length) return { error: "Uno o più reparti non esistono." };
  return { ids: unique };
}

const deptRules = [
  body("departments").optional().isArray().withMessage("Reparti non validi"),
  // null = torna ai reparti del gruppo; array = eccezione individuale
  body("visibleDepartments").optional({ values: "undefined" }).custom(v => v === null || Array.isArray(v)).withMessage("Visibilità non valida"),
];

/** Campi reparto dal body (se presenti), verificati. */
async function departmentFields(reqBody) {
  const out = {};
  if (reqBody.departments !== undefined) {
    const r = await validDepartmentIds(reqBody.departments);
    if (r.error) return { error: r.error };
    out.departments = r.ids;
  }
  if (reqBody.visibleDepartments !== undefined) {
    if (reqBody.visibleDepartments === null) out.visibleDepartments = null;
    else {
      const r = await validDepartmentIds(reqBody.visibleDepartments);
      if (r.error) return { error: r.error };
      out.visibleDepartments = r.ids;
    }
  }
  return { fields: out };
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
    body("role").isIn(ROLES).withMessage("Ruolo non valido"),
    body("email").optional({ checkFalsy: true }).isEmail().withMessage("Email non valida").normalizeEmail(),
    ...deptRules,
  ],
  validate,
  async (req, res) => {
    if (req.body.role === "admin" && req.user.role !== "admin")
      return res.status(403).json({ message: "Solo un admin può creare altri admin." });
    const dept = await departmentFields(req.body);
    if (dept.error) return res.status(400).json({ message: dept.error });
    try {
      const { username, password, name, role, email } = req.body;
      const user = await User.create({ username, password, name, role, email, ...dept.fields });
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
  loadManageableTarget,
  [
    body("name").optional().trim().notEmpty().withMessage("Nome obbligatorio"),
    body("role").optional().isIn(ROLES).withMessage("Ruolo non valido"),
    body("email").optional({ checkFalsy: true }).isEmail().withMessage("Email non valida").normalizeEmail(),
    ...deptRules,
  ],
  validate,
  async (req, res) => {
    const target = req.target;
    const { name, role, email } = req.body;

    if (role !== undefined && role !== target.role) {
      if (target.isSuperAdmin) return res.status(403).json({ message: "Il ruolo del super-admin non può essere cambiato." });
      if (role === "admin" && req.user.role !== "admin")
        return res.status(403).json({ message: "Solo un admin può assegnare il ruolo admin." });
    }
    const dept = await departmentFields(req.body);
    if (dept.error) return res.status(400).json({ message: dept.error });

    try {
      const $set = { ...dept.fields };
      if (name !== undefined) $set.name = name;
      if (role !== undefined) $set.role = role;
      // Email vuota ("") RIMUOVE l'email: con l'indice sparse va resa assente ($unset), non null.
      const update = { $set };
      if (email === "") update.$unset = { email: 1 };
      else if (email !== undefined) $set.email = email;

      const user = await User.findByIdAndUpdate(target._id, update, { new: true, runValidators: true });
      res.json({ user: user.toPublic() });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ message: "Email già in uso su un altro account." });
      res.status(500).json({ message: "Errore aggiornamento utente." });
    }
  }
);

// Elimina definitivamente l'utente (solo admin — azione irreversibile)
router.delete("/:id", requireAdmin, loadManageableTarget, async (req, res) => {
  if (String(req.target._id) === String(req.user._id))
    return res.status(400).json({ message: "Non puoi eliminare te stesso." });
  await req.target.deleteOne();
  res.json({ message: "Utente eliminato definitivamente." });
});

// Attiva/disattiva utente (reversibile — admin e supervisore)
router.put("/:id/status", loadManageableTarget,
  [body("isActive").isBoolean().withMessage("Stato non valido")],
  validate,
  async (req, res) => {
    if (String(req.target._id) === String(req.user._id))
      return res.status(400).json({ message: "Non puoi disattivare te stesso." });
    const user = await User.findByIdAndUpdate(req.target._id, { isActive: req.body.isActive }, { new: true });
    res.json({ user: user.toPublic() });
  }
);

// Reset password utente (il super-admin cambia la propria da /api/auth/password)
router.put("/:id/password",
  loadManageableTarget,
  [body("newPassword").isLength({ min: 8 }).withMessage("Password min 8 caratteri")],
  validate,
  async (req, res) => {
    const user = await User.findById(req.target._id);
    user.password = req.body.newPassword;
    await user.save();
    res.json({ message: "Password aggiornata." });
  }
);

// ── Badge QR/NFC di UN ALTRO utente (admin/supervisore) ────────
// Utile perché un operatore senza badge non può accedere per generarsene
// uno da solo, e perché un badge fisico può andare perso/rubato.

// Genera/rigenera il badge — il segreto viene mostrato una sola volta.
router.post("/:id/badge/regenerate", loadManageableTarget, async (req, res) => {
  try {
    const secret = badge.generateSecret();
    const target = await User.findByIdAndUpdate(
      req.target._id,
      { badgeSecretHash: badge.hashSecret(secret), badgeIssuedAt: new Date(), badgeEnabled: true },
      { new: true },
    );

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
router.put("/:id/badge/status", loadManageableTarget,
  [body("enabled").isBoolean().withMessage("Stato non valido")],
  validate,
  async (req, res) => {
    const user = await User.findByIdAndUpdate(req.target._id, { badgeEnabled: req.body.enabled }, { new: true });
    res.json({ badgeEnabled: user.badgeEnabled });
  }
);

// Revoca il badge (nessun QR o tag NFC di quell'utente funzionerà più)
router.delete("/:id/badge", loadManageableTarget, async (req, res) => {
  await User.findByIdAndUpdate(req.target._id, { badgeSecretHash: null, badgeIssuedAt: null });
  res.json({ message: "Badge revocato." });
});

module.exports = router;
