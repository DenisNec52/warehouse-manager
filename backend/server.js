/**
 * server.js — Entry point principale
 *
 * Configura Express con tutti i middleware di sicurezza,
 * collega MongoDB e avvia il server con graceful shutdown.
 */
require("dotenv").config();
const express       = require("express");
const mongoose      = require("mongoose");
const cors          = require("cors");
const helmet        = require("helmet");
const cookieParser  = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");
const morgan        = require("morgan");

const app  = express();
const PORT = process.env.PORT || 5000;

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

// ── Request logger (solo in sviluppo) ────────────────────────
if (process.env.NODE_ENV !== "production") app.use(morgan("dev"));

// ── Routes ────────────────────────────────────────────────────
app.use("/api/auth",         require("./routes/auth"));
app.use("/api/users",        require("./routes/users"));
app.use("/api/products",     require("./routes/products"));
app.use("/api/categories",   require("./routes/categories"));
app.use("/api/movements",    require("./routes/movements"));
app.use("/api/notifications",require("./routes/notifications"));
app.use("/api/dashboard",    require("./routes/dashboard"));

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

// ── Connect MongoDB + Start server ───────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅  MongoDB connesso");
    const server = app.listen(PORT, () =>
      console.log(`🚀  Server avviato sulla porta ${PORT} [${process.env.NODE_ENV}]`)
    );

    // Graceful shutdown — Render invia SIGTERM prima del restart
    process.on("SIGTERM", () => {
      console.log("SIGTERM ricevuto — chiusura in corso...");
      server.close(() => {
        mongoose.connection.close(false, () => {
          console.log("Server e DB chiusi.");
          process.exit(0);
        });
      });
    });
  })
  .catch(err => {
    console.error("❌  Errore MongoDB:", err.message);
    process.exit(1);
  });
