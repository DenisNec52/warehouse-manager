/**
 * routes/auth.js
 *
 * Autenticazione con JWT in cookie httpOnly.
 * POST /api/auth/login   — login con username/password
 * GET  /api/auth/badge/:userId/:secret — login automatico da QR o tag NFC
 * POST /api/auth/badge/regenerate — genera/rigenera il proprio badge
 * PUT  /api/auth/badge/status     — abilita/disabilita il proprio badge
 * DELETE /api/auth/badge          — revoca il proprio badge
 * POST /api/auth/logout  — logout
 * GET  /api/auth/me      — utente corrente
 * PUT  /api/auth/theme   — salva tema utente
 * PUT  /api/auth/password — cambia password
 */
const express  = require("express");
const crypto   = require("crypto");
const { body } = require("express-validator");
const jwt      = require("jsonwebtoken");
const User     = require("../models/User");
const Notification = require("../models/Notification");
const { protect }  = require("../middleware/auth");
const { loginLimiter, badgeLoginLimiter, forgotPasswordLimiter } = require("../middleware/rateLimiter");
const validate = require("../middleware/validate");
const email    = require("../utils/email");
const { lookupLocation } = require("../utils/geoip");
const badge    = require("../utils/badge");
const { clientIp } = require("../utils/clientIp");
const { notificationScope } = require("../utils/colleagues");

const router = express.Router();

// ── Cookie options ────────────────────────────────────────────
const cookieOpts = {
  httpOnly: true,
  secure:   process.env.COOKIE_SECURE === "true",
  sameSite: process.env.COOKIE_SECURE === "true" ? "none" : "lax",
  maxAge:   7 * 24 * 60 * 60 * 1000,  // 7 giorni
};

const METHOD_LABELS = { password: "credenziali", qr: "QR code", nfc: "tag NFC" };

// ── Sessione condivisa: JWT + cookie + tracciamento accesso ────
// Usata sia dal login classico sia dal login automatico via badge,
// così ogni accesso (qualunque sia il metodo) viene registrato allo
// stesso modo: lastLogin/IP, geolocalizzazione best-effort, notifica.
async function startSession(req, res, user, method = "password") {
  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
  res.cookie("wh_token", token, cookieOpts);

  const ip = clientIp(req);
  await User.findByIdAndUpdate(user._id, { lastLogin: new Date(), lastLoginIP: ip });

  lookupLocation(ip)
    .then(location => {
      if (location) return User.findByIdAndUpdate(user._id, { lastLoginLocation: location });
    })
    .catch(() => {});

  await Notification.create({
    type:    "login",
    title:   "Accesso effettuato",
    message: `${user.name} (${user.role}) ha effettuato l'accesso con ${METHOD_LABELS[method] || method}.`,
    userId:  user._id,
  });

  email.sendLoginNotification(user).catch(() => {});
}

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

      await startSession(req, res, user, "password");
      res.json({ user: user.toPublic() });
    } catch (err) {
      console.error("[auth/login]", err);
      res.status(500).json({ message: "Errore del server." });
    }
  }
);

/** Utente del badge se id e segreto sono validi e il badge è attivo, altrimenti null. */
async function findBadgeUser(userId, secret) {
  if (typeof userId !== "string" || !/^[a-f0-9]{24}$/i.test(userId)) return null;
  if (typeof secret !== "string" || secret.length < 20 || secret.length > 128) return null;
  const user = await User.findById(userId).select("+badgeSecretHash");
  if (!user || !user.isActive || !user.badgeEnabled || !user.badgeSecretHash) return null;
  return badge.verifySecret(secret, user.badgeSecretHash) ? user : null;
}

// ── POST /api/auth/badge-login — login da badge QR/NFC ─────────
// Chiamata dalla pagina /badge del frontend e dallo scanner nella pagina di login:
// il cookie di sessione arriva nella risposta a una richiesta dell'app, esattamente
// come nel login con password, quindi funziona negli stessi browser.
router.post("/badge-login", badgeLoginLimiter, async (req, res) => {
  try {
    const { userId, secret, src } = req.body || {};
    const user = await findBadgeUser(userId, secret);
    if (!user)
      return res.status(401).json({ message: "Badge non valido, revocato o disattivato." });

    await startSession(req, res, user, src === "nfc" ? "nfc" : "qr");
    res.json({ user: user.toPublic() });
  } catch (err) {
    console.error("[auth/badge-login]", err);
    res.status(500).json({ message: "Errore del server." });
  }
});

// ── GET /api/auth/badge/:userId/:secret — link dei badge generati prima di /badge ──
// Non apre più la sessione qui (il cookie resterebbe isolato dal sito): rimanda alla
// pagina /badge del frontend con gli stessi dati, che fa il login con POST /badge-login.
router.get("/badge/:userId/:secret", badgeLoginLimiter, (req, res) => {
  const source = req.query.src === "nfc" ? "nfc" : "qr";
  res.redirect(badge.badgeUrl(req.params.userId, req.params.secret, source));
});

// ── POST /api/auth/badge/regenerate — genera/rigenera il PROPRIO badge ──
// Il segreto in chiaro viene restituito una sola volta: da questo momento
// in poi nel DB resta solo il suo HMAC. Rigenerare invalida immediatamente
// qualsiasi QR o tag NFC creato in precedenza per questo account.
router.post("/badge/regenerate", protect, async (req, res) => {
  try {
    const secret = badge.generateSecret();
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { badgeSecretHash: badge.hashSecret(secret), badgeIssuedAt: new Date(), badgeEnabled: true },
      { new: true }
    );
    // Stesso segreto, due varianti di URL (solo per distinguere in seguito
    // nei log/notifiche se l'accesso arriva da QR o da NFC): il QR incorpora
    // la variante "qr", il link da scrivere sul tag usa la variante "nfc".
    const qrUrl  = badge.badgeUrl(user._id, secret, "qr");
    const nfcUrl = badge.badgeUrl(user._id, secret, "nfc");
    res.json({
      url:           qrUrl,
      nfcUrl,
      qrImage:       await badge.qrImageDataUrl(qrUrl),
      badgeIssuedAt: user.badgeIssuedAt,
    });
  } catch (err) {
    console.error("[auth/badge/regenerate]", err);
    res.status(500).json({ message: "Errore generazione badge." });
  }
});

// ── PUT /api/auth/badge/status — abilita/disabilita il PROPRIO badge ──
router.put("/badge/status", protect,
  [body("enabled").isBoolean().withMessage("Stato non valido")],
  validate,
  async (req, res) => {
    const user = await User.findByIdAndUpdate(req.user._id, { badgeEnabled: req.body.enabled }, { new: true });
    res.json({ badgeEnabled: user.badgeEnabled });
  }
);

// ── DELETE /api/auth/badge — revoca il PROPRIO badge ──
router.delete("/badge", protect, async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { badgeSecretHash: null, badgeIssuedAt: null });
  res.json({ message: "Badge revocato." });
});

// ── POST /api/auth/logout ─────────────────────────────────────
router.post("/logout", protect, (req, res) => {
  res.clearCookie("wh_token", { httpOnly: true, secure: cookieOpts.secure, sameSite: cookieOpts.sameSite });
  res.json({ message: "Logout effettuato." });
});

// ── GET /api/auth/me ──────────────────────────────────────────
router.get("/me", protect, async (req, res) => {
  // Conta notifiche non lette
  const unread = await Notification.countDocuments({
    ...notificationScope(req.user),
    read: false,
  });
  res.json({ user: req.user.toPublic(), unreadNotifications: unread });
});

// ── PUT /api/auth/email — imposta/aggiorna la PROPRIA email ───
// Serve solo per poter usare "password dimenticata": senza email
// associata il recupero non è possibile e serve un admin/supervisore.
router.put("/email", protect,
  [body("email").isEmail().withMessage("Email non valida").normalizeEmail()],
  validate,
  async (req, res) => {
    try {
      const updated = await User.findByIdAndUpdate(
        req.user._id, { email: req.body.email }, { new: true, runValidators: true }
      );
      res.json({ email: updated.email });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ message: "Questa email è già associata a un altro account." });
      res.status(500).json({ message: "Errore salvataggio email." });
    }
  }
);

// ── POST /api/auth/forgot-password — invia link di reset ──────
// Risposta SEMPRE generica (stesso messaggio, stesso status) sia che
// l'utente esista o meno, sia che abbia un'email associata o meno:
// evita di far scoprire a chi non è autorizzato quali username esistono.
router.post("/forgot-password", forgotPasswordLimiter,
  [body("username").trim().notEmpty().withMessage("Username obbligatorio")],
  validate,
  async (req, res) => {
    const GENERIC = { message: "Se l'account esiste ed ha un'email associata, riceverai un link per reimpostare la password." };
    try {
      const user = await User.findOne({ username: req.body.username.toLowerCase() });
      if (user && user.isActive && user.email) {
        const rawToken = crypto.randomBytes(32).toString("base64url");
        user.resetPasswordTokenHash = crypto.createHmac("sha256", process.env.JWT_SECRET).update(rawToken).digest("hex");
        user.resetPasswordExpires   = new Date(Date.now() + 60 * 60 * 1000); // 1 ora
        await user.save();

        const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
        const resetUrl = `${frontendUrl}/reset-password?uid=${user._id}&token=${rawToken}`;
        email.sendPasswordReset(user, resetUrl).catch(() => {});
      }
      res.json(GENERIC);
    } catch (err) {
      console.error("[auth/forgot-password]", err);
      res.json(GENERIC); // generico anche in caso di errore interno — non far trapelare dettagli
    }
  }
);

// ── POST /api/auth/reset-password — imposta la nuova password ──
router.post("/reset-password",
  [
    body("userId").isMongoId().withMessage("Richiesta non valida"),
    body("token").isLength({ min: 20, max: 128 }).withMessage("Richiesta non valida"),
    body("newPassword").isLength({ min: 6 }).withMessage("Nuova password minimo 6 caratteri"),
  ],
  validate,
  async (req, res) => {
    try {
      const { userId, token, newPassword } = req.body;
      const user = await User.findById(userId).select("+resetPasswordTokenHash +resetPasswordExpires");

      const invalid = !user || !user.resetPasswordTokenHash || !user.resetPasswordExpires
        || user.resetPasswordExpires < new Date();
      if (invalid) return res.status(400).json({ message: "Link scaduto o non valido. Richiedine uno nuovo." });

      const candidate = Buffer.from(crypto.createHmac("sha256", process.env.JWT_SECRET).update(token).digest("hex"), "hex");
      const stored    = Buffer.from(user.resetPasswordTokenHash, "hex");
      const ok = candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
      if (!ok) return res.status(400).json({ message: "Link scaduto o non valido. Richiedine uno nuovo." });

      user.password = newPassword;
      user.resetPasswordTokenHash = null;
      user.resetPasswordExpires   = null;
      await user.save();

      // Login automatico dopo il reset, stessa UX del login da badge.
      await startSession(req, res, user, "password");
      res.json({ user: user.toPublic() });
    } catch (err) {
      console.error("[auth/reset-password]", err);
      res.status(500).json({ message: "Errore reimpostazione password." });
    }
  }
);

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
