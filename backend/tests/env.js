/**
 * tests/env.js — variabili d'ambiente comuni per l'esecuzione dei test.
 * Caricato da Jest PRIMA di ogni test file (vedi "jest.setupFiles" in
 * package.json), così ogni suite trova già un ambiente coerente senza
 * doverlo ripetere. Nessun valore qui è un segreto reale.
 */
process.env.NODE_ENV      = "test";
process.env.JWT_SECRET    = "test_jwt_secret_non_usare_in_produzione";
process.env.JWT_EXPIRES_IN = "1h";
process.env.FRONTEND_URL  = "http://localhost:5173";
process.env.COOKIE_SECURE = "false";
process.env.ENABLE_EMAIL      = "false";
process.env.ENABLE_CLOUDINARY = "false";

// Limiti alti durante i test: i rate limiter sono pensati per il traffico
// reale, non per decine di richieste ravvicinate fatte da Supertest.
process.env.RATE_LIMIT_MAX          = "100000";
process.env.RATE_LIMIT_LOGIN_MAX    = "100000";
process.env.RATE_LIMIT_BADGE_MAX    = "100000";
process.env.RATE_LIMIT_VISION_MAX   = "100000";
process.env.RATE_LIMIT_FORGOT_MAX   = "100000";
