/**
 * models/WebhookDelivery.js — storico dei tentativi di invio dei webhook,
 * per capire dalla UI perché il gestionale non ha ricevuto un evento.
 * Si cancella da solo dopo 7 giorni.
 */
const mongoose = require("mongoose");

const deliverySchema = new mongoose.Schema({
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: "WebhookSubscription", required: true },
  deliveryId:   { type: String, required: true },
  event:        { type: String, required: true },
  attempt:      { type: Number, default: 1 },
  ok:           { type: Boolean, default: false },
  status:       { type: String, default: "" },
  durationMs:   { type: Number, default: 0 },
  at:           { type: Date, default: Date.now, expires: 7 * 24 * 60 * 60 },
}, { versionKey: false });

deliverySchema.index({ subscription: 1, at: -1 });

module.exports = mongoose.model("WebhookDelivery", deliverySchema);
