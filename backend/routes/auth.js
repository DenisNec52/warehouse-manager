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
const bcrypt   = require("bcryptjs");
const User     = require("../models/User");
const Notification = require("../models/Notification");
const { protect, revokeSessions } = require("../middleware/auth");
const { passwordRule } = require("../utils/passwordPolicy");
const { audit } = require("../utils/audit");
const { loginLimiter, loginIpLimiter, badgeLoginLimiter, forgotPasswordLimiter } = require("../middleware/rateLimiter");
const validate = require("../middleware/validate");
const email    = require("../utils/email");
const { lookupLocation } = require("../utils/geoip");
const badge    = require("../utils/badge");
const { clientIp } = require("../utils/clientIp");
const { notificationScope } = require("../utils/colleagues");

const router = express.Router();

// ── Cookie options ────────────────────────────────────────────
// sameSite "lax": in produzione il frontend (Vercel) chiama le API tramite la
// rewrite /api -> Render, quindi dal browser sono richieste SAME-ORIGIN del sito
// e il cookie viaggia normalmente. Non serve "none" (che inviava il cookie anche
// in contesti cross-site, riaprendo il CSRF): con "lax" un sito malevolo non può
// far partire POST/PUT/DELETE autenticati verso le nostre API. I login legittimi
// (anche l'atterraggio GET dal link badge via email) continuano a funzionare.
const cookieOpts = {
  httpOnly: true,
  secure:   process.env.COOKIE_SECURE === "true",
  sameSite: "lax",
  maxAge:   7 * 24 * 60 * 60 * 1000,  // 7 giorni
};

const METHOD_LABELS = { password: "credenziali", qr: "QR code", nfc: "tag NFC" };

// ── Sessione condivisa: JWT + cookie + tracciamento accesso ────
// Usata sia dal login classico sia dal login automatico via badge,
// così ogni accesso (qualunque sia il metodo) viene registrato allo
// stesso modo: lastLogin/IP, geolocalizzazione best-effort, notifica.
/** Firma il JWT con la versione di sessione ATTUALE dell'utente e lo mette nel cookie. */
async function issueToken(res, userId) {
  const fresh = await User.findById(userId).select("+tokenVersion role").lean();
  const token = jwt.sign(
    { id: userId, role: fresh.role, tv: fresh.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
  res.cookie("wh_token", token, cookieOpts);
}

// Hash bcrypt fittizio (costo 12, come quelli veri): se lo username non esiste
// si esegue comunque un confronto, così il tempo di risposta non rivela quali
// username sono registrati.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 12);

async function startSession(req, res, user, method = "password") {
  await issueToken(res, user._id);

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
  loginIpLimiter,
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
      if (!user || !user.isActive) {
        await bcrypt.compare(String(password), DUMMY_HASH);
        return res.status(401).json({ message: "Credenziali non valide." });
      }

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

// ── POST /api/auth/logout-all — esci da TUTTI i dispositivi ───
// Incrementa la versione delle sessioni: ogni token emesso finora smette di
// funzionare alla richiesta successiva (telefono perso, PC condiviso...).
router.post("/logout-all", protect, async (req, res) => {
  await revokeSessions(req.user._id);
  await audit(req, { action: "auth.logout_all", entityType: "user", entityId: req.user._id, entityLabel: req.user.username });
  res.clearCookie("wh_token", { httpOnly: true, secure: cookieOpts.secure, sameSite: cookieOpts.sameSite });
  res.json({ message: "Disconnesso da tutti i dispositivi." });
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
    passwordRule("newPassword"),
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
      // Chi aveva rubato la sessione (motivo frequente di un reset) viene buttato fuori.
      await revokeSessions(user._id);
      req.user = user;
      await audit(req, { action: "user.password_reset_self", entityType: "user", entityId: user._id, entityLabel: user.username });

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
    passwordRule("newPassword"),
  ],
  validate,
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id).select("+password");
      const ok   = await user.comparePassword(req.body.currentPassword);
      if (!ok) return res.status(400).json({ message: "Password attuale non corretta." });

      user.password = req.body.newPassword;
      await user.save();
      // Tutte le altre sessioni vengono chiuse; questo dispositivo resta collegato
      // con un token nuovo.
      await revokeSessions(user._id);
      await issueToken(res, user._id);
      await audit(req, { action: "user.password_change", entityType: "user", entityId: user._id, entityLabel: user.username });
      res.json({ message: "Password aggiornata con successo. Le altre sessioni sono state chiuse." });
    } catch (err) {
      res.status(500).json({ message: "Errore aggiornamento password." });
    }
  }
);

module.exports = router;
