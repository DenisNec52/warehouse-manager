/**
 * routes/auth.js
 *
 * Autenticazione con JWT in cookie httpOnly.
 * POST /api/auth/login   — login
 * POST /api/auth/logout  — logout
 * GET  /api/auth/me      — utente corrente
 * PUT  /api/auth/theme   — salva tema utente
 * PUT  /api/auth/password — cambia password
 */
const express  = require("express");
const { body } = require("express-validator");
const jwt      = require("jsonwebtoken");
const User     = require("../models/User");
const Notification = require("../models/Notification");
const { protect }  = require("../middleware/auth");
const { loginLimiter } = require("../middleware/rateLimiter");
const validate = require("../middleware/validate");
const email    = require("../utils/email");

const router = express.Router();

// ── Cookie options ────────────────────────────────────────────
const cookieOpts = {
  httpOnly: true,
  secure:   process.env.COOKIE_SECURE === "true",
  sameSite: process.env.COOKIE_SECURE === "true" ? "none" : "lax",
  maxAge:   7 * 24 * 60 * 60 * 1000,  // 7 giorni
};

// ── POST /api/auth/login ──────────────────────────────────────
router.post("/login",
  loginLimiter,
  [
    body("username").trim().notEmpty().withMessage("Username obbligatorio"),
    body("password").notEmpty().withMessage("Password obbligatoria"),
  ],
  validate,
  async (req, res) => {
    try {
      const { username, password } = req.body;

      const user = await User.findOne({ username: username.toLowerCase() }).select("+password");
      if (!user || !user.isActive)
        return res.status(401).json({ message: "Credenziali non valide." });

      const ok = await user.comparePassword(password);
      if (!ok) return res.status(401).json({ message: "Credenziali non valide." });

      // Genera JWT
      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
      );

      // Aggiorna lastLogin
      await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

      // Crea notifica login (per admin)
      await Notification.create({
        type:    "login",
        title:   `Accesso effettuato`,
        message: `${user.name} (${user.role}) ha effettuato l'accesso.`,
        userId:  user._id,
      });

      // Notifica email opzionale
      const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
      email.sendLoginNotification(user, ip).catch(() => {});

      res.cookie("wh_token", token, cookieOpts);
      res.json({ user: user.toPublic() });
    } catch (err) {
      console.error("[auth/login]", err);
      res.status(500).json({ message: "Errore del server." });
    }
  }
);

// ── POST /api/auth/logout ─────────────────────────────────────
router.post("/logout", protect, (req, res) => {
  res.clearCookie("wh_token", { httpOnly: true, sameSite: "lax" });
  res.json({ message: "Logout effettuato." });
});

// ── GET /api/auth/me ──────────────────────────────────────────
router.get("/me", protect, async (req, res) => {
  // Conta notifiche non lette
  const unread = await Notification.countDocuments({
    $or: [{ userId: req.user._id }, { userId: null }],
    read: false,
  });
  res.json({ user: req.user.toPublic(), unreadNotifications: unread });
});

// ── PUT /api/auth/theme — salva tema nel profilo ──────────────
router.put("/theme", protect, async (req, res) => {
  try {
    const { mode, accentColor, radius } = req.body;
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { "theme.mode": mode, "theme.accentColor": accentColor, "theme.radius": radius },
      { new: true, runValidators: true }
    );
    res.json({ theme: updated.theme });
  } catch (err) {
    res.status(500).json({ message: "Errore salvataggio tema." });
  }
});

// ── PUT /api/auth/password ────────────────────────────────────
router.put("/password", protect,
  [
    body("currentPassword").notEmpty().withMessage("Password attuale obbligatoria"),
    body("newPassword").isLength({ min: 6 }).withMessage("Nuova password minimo 6 caratteri"),
  ],
  validate,
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id).select("+password");
      const ok   = await user.comparePassword(req.body.currentPassword);
      if (!ok) return res.status(400).json({ message: "Password attuale non corretta." });

      user.password = req.body.newPassword;
      await user.save();
      res.json({ message: "Password aggiornata con successo." });
    } catch (err) {
      res.status(500).json({ message: "Errore aggiornamento password." });
    }
  }
);

module.exports = router;
