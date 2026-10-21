/**
 * routes/settings.js — impostazioni globali dell'app.
 *
 * GET  /api/settings  — lette da qualunque utente autenticato (servono al frontend
 *                       per nome app, fasi, visibilità moduli).
 * PUT  /api/settings  — SOLO super-admin.
 *
 * La visibilità moduli qui è uno strato lato UI: i controlli di ruolo veri restano
 * sulle singole route (requireAdmin/requireSupervisor ecc.).
 */
const express     = require("express");
const { body }    = require("express-validator");
const AppSettings = require("../models/AppSettings");
const { protect, requireSuperAdmin } = require("../middleware/auth");
const validate    = require("../middleware/validate");
const router      = express.Router();

router.use(protect);

// Moduli di menu su cui il super-admin può regolare la visibilità per ruolo.
const NAV_KEYS = [
  "checklist", "products", "movements", "production", "standard-times",
  "users", "admin-checklist", "admin", "departments", "categories",
  "notifications", "settings",
];
const ROLES = ["admin", "supervisore", "operatore"];

const publicView = (s) => ({
  appName:          s.appName,
  workPhases:       s.workPhases || [],
  moduleVisibility: s.moduleVisibility || {},
});

router.get("/", async (_req, res) => {
  const s = await AppSettings.getSettings();
  res.json({ settings: publicView(s) });
});

router.put("/", requireSuperAdmin,
  [
    body("appName").optional().trim().isLength({ min: 1, max: 60 }).withMessage("Nome app 1–60 caratteri"),
    body("workPhases").optional().isArray({ max: 30 }).withMessage("Fasi non valide (max 30)"),
    body("moduleVisibility").optional().isObject().withMessage("Visibilità non valida"),
  ],
  validate,
  async (req, res) => {
    const $set = {};
    if (req.body.appName !== undefined) $set.appName = String(req.body.appName).trim();

    if (Array.isArray(req.body.workPhases)) {
      // Deduplica, togli vuoti, limita numero e lunghezza.
      $set.workPhases = [...new Set(req.body.workPhases.map((p) => String(p).trim()).filter(Boolean))]
        .slice(0, 30).map((p) => p.slice(0, 40));
    }

    if (req.body.moduleVisibility && typeof req.body.moduleVisibility === "object") {
      const mv = {};
      for (const [k, v] of Object.entries(req.body.moduleVisibility)) {
        if (!NAV_KEYS.includes(k) || !Array.isArray(v)) continue;   // ignora chiavi/valori ignoti
        mv[k] = [...new Set(v.filter((r) => ROLES.includes(r)))];
      }
      $set.moduleVisibility = mv;
    }

    $set.updatedBy = req.user._id;
    const s = await AppSettings.findOneAndUpdate(
      { key: "app" }, { $set }, { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    res.json({ settings: publicView(s) });
  },
);

module.exports = router;
