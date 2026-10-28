/**
 * middleware/idempotency.js — richieste POST ripetibili senza effetti doppi.
 *
 * Il chiamante manda "Idempotency-Key: <valore unico>" (es. un UUID per ogni
 * operazione). Prima volta: la richiesta viene eseguita e la risposta salvata.
 * Ripetizione con la stessa chiave e lo stesso body: si restituisce la risposta
 * salvata (header "Idempotent-Replayed: true"), senza rieseguire nulla.
 * Stessa chiave ma body diverso: 422 (è quasi sempre un bug del chiamante).
 * Se la prima esecuzione finisce con un errore 5xx il record viene rimosso,
 * così il retry può riprovare davvero.
 */
const crypto = require("crypto");
const IdempotencyRecord = require("../models/IdempotencyRecord");
const { problem } = require("./apiKeyAuth");

const KEY_RE = /^[A-Za-z0-9_.:-]{8,128}$/;

const hashBody = (body) =>
  crypto.createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");

function idempotent({ required = true } = {}) {
  return async (req, res, next) => {
    const key = req.headers["idempotency-key"];
    if (!key) {
      if (required) return problem(res, 400, "idempotency_key_required", "Header Idempotency-Key obbligatorio (8-128 caratteri, es. un UUID).");
      return next();
    }
    if (typeof key !== "string" || !KEY_RE.test(key))
      return problem(res, 400, "invalid_idempotency_key", "Idempotency-Key non valida (8-128 caratteri: lettere, numeri, _ . : -).");

    const requestHash = hashBody(req.body);
    let record;
    try {
      record = await IdempotencyRecord.create({
        apiKey: req.apiKey._id, key, method: req.method, path: req.originalUrl, requestHash,
      });
    } catch (err) {
      if (err.code !== 11000) return next(err);
      const prev = await IdempotencyRecord.findOne({ apiKey: req.apiKey._id, key }).lean();
      if (!prev) return problem(res, 409, "idempotency_conflict", "Richiesta in corso con la stessa Idempotency-Key, riprova.");
      if (prev.requestHash !== requestHash || prev.method !== req.method || prev.path !== req.originalUrl)
        return problem(res, 422, "idempotency_key_reused", "Idempotency-Key già usata per una richiesta diversa.");
      if (prev.state === "processing")
        return problem(res, 409, "idempotency_in_progress", "La stessa richiesta è ancora in elaborazione, riprova tra poco.");
      res.set("Idempotent-Replayed", "true");
      return res.status(prev.statusCode).json(prev.body);
    }

    // Intercetta la risposta per salvarla.
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const status = res.statusCode;
      const save = status >= 500
        ? IdempotencyRecord.deleteOne({ _id: record._id })
        : IdempotencyRecord.updateOne({ _id: record._id }, { state: "done", statusCode: status, body });
      // La risposta parte solo dopo il salvataggio: un retry immediato trova già "done".
      save.catch((e) => console.error("[idempotency]", e.message)).finally(() => originalJson(body));
      return res;
    };
    res.on("close", () => {
      // Connessione chiusa senza risposta JSON (crash, timeout): libera la chiave.
      if (!res.headersSent) IdempotencyRecord.deleteOne({ _id: record._id, state: "processing" }).catch(() => {});
    });
    next();
  };
}

module.exports = { idempotent };
