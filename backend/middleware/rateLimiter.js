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
