/**
 * models/Movement.js
 *
 * Registro immutabile di ogni entrata/uscita.
 * Snapshot del prodotto al momento del movimento per storico accurato.
 * TTL opzionale per pulizia automatica dati vecchi.
 */
const mongoose = require("mongoose");

const movementSchema = new mongoose.Schema({
  product: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      "Product",
    required: true,
  },
  // Snapshot del prodotto (per storico anche se il prodotto viene eliminato)
  productSnapshot: {
    name:     String,
    code:     String,
    unit:     String,
    category: String,
  },

  type:     { type: String, required: true, enum: ["IN","OUT"] },
  quantity: { type: Number, required: true, min: 1 },

  // Quantità prima e dopo il movimento (per audit trail)
  quantityBefore: { type: Number, required: true },
  quantityAfter:  { type: Number, required: true },

  reason:   { type: String, trim: true, default: "" },   // motivazione
  note:     { type: String, trim: true, default: "" },
  reference:{ type: String, trim: true, default: "" },   // es. numero ordine

  performedBy: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      "User",
    required: true,
  },
  performedByName: String,  // snapshot nome utente

  // Provenienza: "ui" (app), "api" (integrazione esterna, vedi routes/integration),
  // "adjustment" (rettifica inventario dalla scheda prodotto).
  source:      { type: String, enum: ["ui", "api", "adjustment"], default: "ui" },
  apiKey:      { type: mongoose.Schema.Types.ObjectId, ref: "ApiKey", default: null },
  externalRef: { type: String, trim: true, default: "" },   // es. id offerta/DDT nel sistema esterno
  reservation: { type: mongoose.Schema.Types.ObjectId, ref: "Reservation", default: null },

  // Correzione da parte di un admin (vedi PUT /api/movements/:id): chi e quando
  correctedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  correctedByName: { type: String, default: "" },
  correctedAt:     { type: Date, default: null },
}, { timestamps: true });

// ── Indici per query frequenti ────────────────────────────────
movementSchema.index({ product: 1, createdAt: -1 });
movementSchema.index({ performedBy: 1 });
movementSchema.index({ type: 1 });
movementSchema.index({ createdAt: -1 });
movementSchema.index({ updatedAt: 1, _id: 1 });   // feed di sincronizzazione dell'API (/api/v1/movements)

module.exports = mongoose.model("Movement", movementSchema);
