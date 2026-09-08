/**
 * server.js — Entry point principale
 *
 * Carica la configurazione, valida le variabili d'ambiente, poi collega
 * MongoDB e avvia (server con graceful shutdown) l'app Express definita
 * in app.js. La costruzione dell'app è separata in app.js così i test
 * possono importarla direttamente (supertest) senza avviare un server
 * reale — vedi app.js e tests/.
 */
require("dotenv").config();
require("./utils/validateEnv")();
const mongoose = require("mongoose");
const app      = require("./app");

const PORT = process.env.PORT || 5000;

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
