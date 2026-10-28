/**
 * models/ReservationLock.js — un documento per codice articolo, usato solo come
 * "lucchetto" dentro le transazioni di prenotazione e consumo.
 *
 * Due prenotazioni simultanee sullo stesso codice leggono la disponibilità e poi
 * inseriscono documenti DIVERSI: senza un punto di scrittura comune potrebbero
 * passare entrambe e prenotare più del disponibile. Incrementando lo stesso
 * documento qui, la seconda transazione va in WriteConflict, viene ripetuta
 * (utils/transactions.js) e a quel punto vede la prima prenotazione.
 */
const mongoose = require("mongoose");

const lockSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  v:    { type: Number, default: 0 },
}, { versionKey: false });

module.exports = mongoose.model("ReservationLock", lockSchema);
