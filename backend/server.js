require("dotenv").config();
const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  credentials: true,
}));
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── HOME + FAVICON → redirect al frontend ────────────────────────────────────
app.get("/", (_req, res) => {
  const frontend = process.env.FRONTEND_URL || "https://warehouse-frontend.onrender.com";
  res.redirect(301, frontend);
});
app.get("/favicon.ico", (_req, res) => res.status(204).end());

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.use("/api/auth",       require("./routes/auth"));
app.use("/api/movements",  require("./routes/movements"));
app.use("/api/inventory",  require("./routes/inventory"));
app.use("/api/categories", require("./routes/categories"));

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({
  status: "ok",
  db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  ts: new Date().toISOString(),
}));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ message: "Endpoint non trovato" }));

// ── GLOBAL ERROR ──────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Errore interno del server" });
});

// ── CONNECT + START ───────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connesso");
    app.listen(PORT, () => console.log(`🚀 Server sulla porta ${PORT}`));
  })
  .catch(err => {
    console.error("❌ MongoDB errore:", err.message);
    process.exit(1);
  });
