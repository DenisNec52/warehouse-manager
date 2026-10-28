/**
 * models/IdempotencyRecord.js — risposte già date alle richieste POST dell'API
 * di integrazione, indicizzate per (chiave API, Idempotency-Key).
 *
 * Se il gestionale ripete una richiesta (timeout di rete, retry automatico),
 * riceve la stessa risposta della prima volta invece di creare un secondo
 * movimento o una seconda prenotazione. Scadono dopo 48 ore.
 */
const mongoose = require("mongoose");

const idempotencySchema = new mongoose.Schema({
  apiKey:      { type: mongoose.Schema.Types.ObjectId, ref: "ApiKey", required: true },
  key:         { type: String, required: true },
  method:      { type: String, required: true },
  path:        { type: String, required: true },
  requestHash: { type: String, required: true },
  state:       { type: String, enum: ["processing", "done"], default: "processing" },
  statusCode:  { type: Number, default: null },
  body:        { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt:   { type: Date, default: Date.now, expires: 48 * 60 * 60 },
}, { versionKey: false });

idempotencySchema.index({ apiKey: 1, key: 1 }, { unique: true });

module.exports = mongoose.model("IdempotencyRecord", idempotencySchema);
