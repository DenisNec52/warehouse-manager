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
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
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
app.use((err, _req, res, _next) => {
  console.error("[ERR]", err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    message: err.message || "Errore interno del server",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

module.exports = app;
