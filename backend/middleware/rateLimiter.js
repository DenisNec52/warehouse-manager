/**
 * middleware/rateLimiter.js
 *
 * Rate limiting per prevenire abusi e brute-force.
 */
const rateLimit = require("express-rate-limit");

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;

/** Limiter generico per tutte le API */
exports.apiLimiter = rateLimit({
  windowMs,
  max:     parseInt(process.env.RATE_LIMIT_MAX) || 200,
  message: { message: "Troppe richieste. Riprova tra qualche minuto." },
  standardHeaders: true,
  legacyHeaders:   false,
});

/** Limiter più stretto per il login — anti-brute-force */
exports.loginLimiter = rateLimit({
  windowMs,
  max:     parseInt(process.env.RATE_LIMIT_LOGIN_MAX) || 10,
  message: { message: "Troppi tentativi di accesso. Riprova tra 15 minuti." },
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,
});

/**
 * Limiter per il login via badge (QR/NFC).
 * Il segreto ha 256 bit di entropia quindi il brute-force è comunque
 * infattibile: questo limite serve soprattutto contro scansioni ripetute
 * per errore o tentativi automatizzati, non come vera difesa crittografica.
 * Più permissivo del login classico perché un badge può essere scansionato
 * più volte di seguito in modo legittimo (es. tablet condiviso in magazzino).
 */
exports.badgeLoginLimiter = rateLimit({
  windowMs,
  max:     parseInt(process.env.RATE_LIMIT_BADGE_MAX) || 30,
  message: { message: "Troppi tentativi. Riprova tra qualche minuto." },
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,
});

/**
 * Limiter per /api/vision/scan.
 * I provider AI usati (HuggingFace/Gemini) hanno quote gratuite GIORNALIERE
 * condivise da tutto il magazzino: senza un limite qui, un utente con una
 * fotocamera che scansiona in loop (o un bug nel frontend) può bruciare la
 * quota per tutti gli altri in pochi minuti. Chiave per utente autenticato
 * (non per IP) perché più persone possono scansionare dalla stessa rete
 * aziendale — l'IP da solo penalizzerebbe tutti insieme.
 */
exports.visionLimiter = rateLimit({
  windowMs,
  max:     parseInt(process.env.RATE_LIMIT_VISION_MAX) || 20,
  message: { message: "Troppe scansioni ravvicinate. Attendi qualche minuto prima di riprovare." },
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
});

/** Limiter per "password dimenticata" — anti spam/email-bombing */
exports.forgotPasswordLimiter = rateLimit({
  windowMs,
  max:     parseInt(process.env.RATE_LIMIT_FORGOT_MAX) || 5,
  message: { message: "Troppe richieste. Riprova tra qualche minuto." },
  standardHeaders: true,
  legacyHeaders:   false,
});
