/**
 * utils/transactions.js
 *
 * MongoDB può annullare una transazione con un errore "transitorio"
 * (TransientTransactionError, es. WriteConflict con due movimenti simultanei
 * sullo stesso prodotto): niente è stato scritto e la documentazione MongoDB
 * indica di ripetere l'operazione. Qui la logica di ripetizione è condivisa
 * tra le route della UI e l'API di integrazione.
 */
const mongoose = require("mongoose");

const isTransient = (err) =>
  typeof err?.hasErrorLabel === "function" && err.hasErrorLabel("TransientTransactionError");

const pause = (attempt) => new Promise((r) => setTimeout(r, (25 + Math.random() * 75) * attempt));

/**
 * Avvolge un handler Express: se lancia un errore transitorio lo ripete
 * (fino a `attempts` volte, attesa casuale crescente), altrimenti risponde 500.
 */
function retryOnTransient(handler, attempts = 8, label = "tx") {
  return async (req, res, next) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await handler(req, res, next);
      } catch (err) {
        if (!isTransient(err) || attempt >= attempts || res.headersSent) {
          console.error(`[${label}] ${req.method} ${req.originalUrl} non riuscito dopo ${attempt} tentativi`, err.message);
          if (!res.headersSent) res.status(500).json({ message: "Operazione non riuscita, riprova." });
          return;
        }
        await pause(attempt);
      }
    }
  };
}

/**
 * Esegue `fn(session)` in una transazione, ripetendola sugli errori transitori.
 * Se `fn` restituisce un oggetto con `abort: true` la transazione viene annullata
 * e l'oggetto restituito così com'è (utile per gli errori "di dominio": 400/404/409).
 */
async function inTransaction(fn, attempts = 8) {
  for (let attempt = 1; ; attempt++) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const result = await fn(session);
      if (result && result.abort) {
        await session.abortTransaction();
        return result;
      }
      await session.commitTransaction();
      return result;
    } catch (err) {
      if (session.inTransaction()) await session.abortTransaction().catch(() => {});
      if (!isTransient(err) || attempt >= attempts) throw err;
      await pause(attempt);
    } finally {
      session.endSession();
    }
  }
}

module.exports = { isTransient, retryOnTransient, inTransaction };
