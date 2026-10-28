/**
 * models/Reservation.js — prenotazione di materiale da parte di un sistema esterno
 * (tipicamente un'offerta del gestionale commerciale).
 *
 * Ciclo di vita:
 *   active ──release──▶ released      (offerta persa/annullata)
 *     │
 *     ├──consume──▶ consumed          (offerta accettata: diventano uscite di magazzino)
 *     │
 *     └──(expiresAt passata)──▶ expired (calcolato, non scritto da un job)
 *
 * La prenotazione lavora per CODICE articolo: lo stesso codice può stare su più
 * pedane (più documenti Product); al consumo si scarica in ordine FIFO di arrivo.
 * Una prenotazione non muove la giacenza fisica: riduce solo la quantità
 * "disponibile" che l'API comunica agli altri sistemi.
 */
const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema({
  code:     { type: String, required: true, uppercase: true, trim: true },
  quantity: { type: Number, required: true, min: 1 },
}, { _id: false });

const reservationSchema = new mongoose.Schema({
  externalRef: { type: String, required: true, trim: true, maxlength: 120 },   // es. "OFF-2026-0012"
  note:        { type: String, trim: true, default: "", maxlength: 500 },
  items:       { type: [itemSchema], validate: [(v) => v.length > 0 && v.length <= 200, "Da 1 a 200 righe"] },
  status:      { type: String, enum: ["active", "released", "consumed"], default: "active" },
  expiresAt:   { type: Date, default: null },

  apiKey:      { type: mongoose.Schema.Types.ObjectId, ref: "ApiKey", default: null },
  createdByName: { type: String, default: "" },

  releasedAt:  { type: Date, default: null },
  consumedAt:  { type: Date, default: null },
  consumedMovements: [{ type: mongoose.Schema.Types.ObjectId, ref: "Movement" }],
}, { timestamps: true });

reservationSchema.index({ status: 1, "items.code": 1 });
reservationSchema.index({ externalRef: 1, createdAt: -1 });
reservationSchema.index({ updatedAt: 1, _id: 1 });

/** Stato visto dall'esterno: una prenotazione attiva ma scaduta vale "expired". */
reservationSchema.methods.effectiveStatus = function() {
  if (this.status === "active" && this.expiresAt && this.expiresAt <= new Date()) return "expired";
  return this.status;
};

/** Filtro Mongo delle prenotazioni che impegnano ancora materiale. */
reservationSchema.statics.holdingFilter = function(now = new Date()) {
  return { status: "active", $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] };
};

module.exports = mongoose.model("Reservation", reservationSchema);
