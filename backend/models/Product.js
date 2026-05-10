/**
 * models/Product.js
 *
 * Schema prodotto completo con:
 * - codice univoco
 * - quantità con soglia "scorta bassa"
 * - categoria e posizione scaffale
 * - struttura pronta per immagini Cloudinary
 * - indici ottimizzati per ricerca
 */
const mongoose = require("mongoose");

// Struttura immagine pronta per Cloudinary (non ancora attiva)
const imageSchema = new mongoose.Schema({
  url:      String,
  publicId: String,
  alt:      String,
}, { _id: false });

const productSchema = new mongoose.Schema({
  name: {
    type:     String,
    required: [true, "Nome prodotto obbligatorio"],
    trim:     true,
  },
  code: {
    type:     String,
    required: [true, "Codice prodotto obbligatorio"],
    unique:   true,
    trim:     true,
    uppercase: true,
  },
  description: { type: String, trim: true, default: "" },
  quantity:    { type: Number, required: true, min: 0, default: 0 },
  minQuantity: { type: Number, default: 10 },  // soglia scorta bassa
  unit:        { type: String, default: "pz", trim: true },  // pz, kg, lt, m...

  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  "Category",
    default: null,
  },
  location: { type: String, trim: true, default: "" },  // es. "A3-S2" (scaffale A3, ripiano 2)

  supplier:  { type: String, trim: true, default: "" },
  unitPrice: { type: Number, default: 0, min: 0 },

  // Struttura pronta per immagini Cloudinary
  images:    [imageSchema],
  coverImage: imageSchema,

  notes:     { type: String, trim: true, default: "" },
  isActive:  { type: Boolean, default: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

// ── Indici per ricerca veloce ─────────────────────────────────
productSchema.index({ code: 1 });
productSchema.index({ name: "text", code: "text", description: "text" });
productSchema.index({ category: 1 });
productSchema.index({ quantity: 1 });
productSchema.index({ isActive: 1 });

// ── Virtual: true se sotto la soglia minima ───────────────────
productSchema.virtual("isLowStock").get(function() {
  return this.quantity <= this.minQuantity;
});

productSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Product", productSchema);
