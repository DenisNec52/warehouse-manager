/**
 * models/WebhookSubscription.js — URL esterni da avvisare quando succede qualcosa
 * in magazzino (movimento, scorta bassa, prenotazione...). Vedi services/webhooks.js.
 *
 * Il segreto di firma serve in chiaro per calcolare l'HMAC di ogni invio, quindi
 * non può essere un hash: è cifrato con AES-256-GCM (chiave da
 * DATA_ENCRYPTION_KEY, o derivata da JWT_SECRET se assente) e mostrato una sola
 * volta alla creazione.
 */
const mongoose = require("mongoose");

const webhookSchema = new mongoose.Schema({
  name:   { type: String, required: true, trim: true, maxlength: 80 },
  url:    { type: String, required: true, trim: true, maxlength: 500 },
  events: { type: [String], default: [] },
  secretEnc: { type: String, required: true, select: false },
  active: { type: Boolean, default: true },

  lastDeliveryAt:      { type: Date, default: null },
  lastStatus:          { type: String, default: "" },      // "200", "timeout", "rifiutato: ip privato"...
  consecutiveFailures: { type: Number, default: 0 },
  disabledReason:      { type: String, default: "" },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

webhookSchema.methods.toPublic = function() {
  return {
    id: this._id, name: this.name, url: this.url, events: this.events, active: this.active,
    lastDeliveryAt: this.lastDeliveryAt, lastStatus: this.lastStatus,
    consecutiveFailures: this.consecutiveFailures, disabledReason: this.disabledReason,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("WebhookSubscription", webhookSchema);
