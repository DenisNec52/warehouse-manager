/**
 * app.js
 *
 * Costruisce e configura l'app Express (middleware di sicurezza, routing,
 * error handler) SENZA connettersi a MongoDB né mettersi in ascolto su una
 * porta. Estratto da server.js per poter essere importato dai test
 * (supertest(app)) senza avviare un server reale o richiedere una .env
 * caricata da file — chi lo importa si assume la responsabilità di aver
 * già impostato le variabili d'ambiente necessarie (server.js lo fa via
 * dotenv+validateEnv, i test lo fanno nel proprio setup).
 */
const express       = require("express");
const mongoose      = require("mongoose");
const cors          = require("cors");
const helmet        = require("helmet");
const cookieParser  = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");
const morgan        = require("morgan");

const app = express();

// ── Trust proxy (Render/Railway/Vercel) ───────────────────────
// Necessario per rate limiter e IP detection dietro reverse proxy
app.set("trust proxy", 1);

// Non rivelare il framework/stack (helmet lo fa già, ma esplicitarlo
// non costa nulla ed è robusto anche se un giorno helmet venisse tolto).
app.disable("x-powered-by");

// ── Security headers via Helmet ───────────────────────────────
app.use(helmet());

// ── Sanitizza input MongoDB per prevenire NoSQL injection ─────
app.use(mongoSanitize());

// ── CORS — accetta solo il frontend configurato ───────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,  // obbligatorio per cookie httpOnly
  methods:     ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ── Body parsing ──────────────────────────────────────────────
// Solo JSON: il frontend invia esclusivamente application/json (e multipart
// per gli upload, gestito da multer nelle singole route). Niente parser
// urlencoded: un form HTML cross-site può inviare SOLO urlencoded/multipart/
// text, mai JSON — non parsando l'urlencoded, un eventuale form malevolo non
// produce comunque un req.body sfruttabile. Difesa in profondità anti-CSRF
// che si somma al cookie sameSite=lax.
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

// ── Request logger (solo in sviluppo, silenzioso nei test) ────
if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") app.use(morgan("dev"));

// ── Rate limiting globale ─────────────────────────────────────
// Rete di sicurezza contro abusi/DoS su tutte le API. Saltato nei test
// (le suite fanno molte richieste ravvicinate di proposito).
if (process.env.NODE_ENV !== "test") {
  const { apiLimiter } = require("./middleware/rateLimiter");
  app.use("/api", apiLimiter);
}

// ── Routes ────────────────────────────────────────────────────
app.use("/api/auth",         require("./routes/auth"));
app.use("/api/users",        require("./routes/users"));
app.use("/api/products",     require("./routes/products"));
app.use("/api/categories",   require("./routes/categories"));
app.use("/api/movements",    require("./routes/movements"));
app.use("/api/notifications",require("./routes/notifications"));
app.use("/api/dashboard",    require("./routes/dashboard"));
app.use("/api/checklist",    require("./routes/checklist"));
app.use("/api/vision",       require("./routes/vision"));
app.use("/api/production",   require("./routes/production"));
app.use("/api/departments",  require("./routes/departments"));
app.use("/api/settings",     require("./routes/settings"));

// ── Health check ──────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({
  status: "ok",
  db:     mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  ts:     new Date().toISOString(),
  env:    process.env.NODE_ENV,
}));

// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ message: "Endpoint non trovato" }));

// ── Global error handler ──────────────────────────────────────
// In produzione i dettagli di un errore 5xx (messaggio ed eventuale stack)
// restano solo nei log del server: al client va un messaggio generico, così
// non trapelano informazioni interne (query, path, nomi di libreria...) utili
// a un attaccante. Gli errori 4xx "voluti" conservano il loro messaggio: sono
// pensati per l'utente (es. "Credenziali non valide").
app.use((err, _req, res, _next) => {
  console.error("[ERR]", err.stack || err.message);
  const status = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === "production";
  const message = (isProd && status >= 500)
    ? "Errore interno del server"
    : (err.message || "Errore interno del server");
  res.status(status).json({
    message,
    ...(!isProd && { stack: err.stack }),
  });
});

module.exports = app;
