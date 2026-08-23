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

// Voce dello storico posizionamento: ogni volta che piano/pedana/data
// arrivo cambiano viene aggiunta una nuova voce (mai sovrascritta) con
// chi, dove e quando — così il tracciamento resta completo nel tempo.
const placementEntrySchema = new mongoose.Schema({
  at:          { type: Date, default: Date.now },  // quando è stata registrata (data + ora server)
  arrivalDate: Date,                                // data di arrivo dichiarata
  floor:       Number,
  pallet:      Number,
  note:        { type: String, trim: true, default: "" },
  placedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  placedByName: String,
});

const productSchema = new mongoose.Schema({
  name: {
    type:     String,
    required: [true, "Nome prodotto obbligatorio"],
    trim:     true,
  },
  // Non univoco a livello DB: lo stesso codice (commessa/posizione) può
  // legittimamente comparire su più pedane per stock fisicamente separato.
  // L'univocità per la creazione manuale da UI è comunque verificata a
  // livello applicativo in routes/products.js.
  code: {
    type:     String,
    required: [true, "Codice prodotto obbligatorio"],
    trim:     true,
    uppercase: true,
  },
  // Derivati automaticamente da "code" (vedi utils/codeParser.js) per
  // permettere la ricerca esatta commessa+posizione senza match su
  // posizioni diverse della stessa commessa (es. "1684-2" ≠ "1684-1").
  // Un codice senza posizione esplicita ha posizione implicita 1.
  commessa:  { type: String, uppercase: true, trim: true },
  posizione: { type: Number, default: 1 },
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

  // Il magazzino ha 5 piani, con un numero variabile di pedane per piano
  // (indicativamente 7-20) — range non vincolante, editabile dall'admin.
  floor:       { type: Number, min: 1, max: 5,  default: null },
  pallet:      { type: Number, min: 1, max: 30, default: null },
  arrivalDate: { type: Date, default: null },

  // Storico completo: chi ha posizionato il pezzo, dove e quando —
  // ogni modifica a piano/pedana/data arrivo aggiunge una voce, non
  // sostituisce mai le precedenti.
  placementHistory: [placementEntrySchema],

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
productSchema.index({ name: "text", code: "text", description: "text" });
productSchema.index({ code: 1 });
productSchema.index({ commessa: 1, posizione: 1 });
productSchema.index({ floor: 1, pallet: 1 });
productSchema.index({ category: 1 });
productSchema.index({ quantity: 1 });
productSchema.index({ isActive: 1 });

// ── Virtual: true se sotto la soglia minima ───────────────────
productSchema.virtual("isLowStock").get(function() {
  return this.quantity <= this.minQuantity;
});

productSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Product", productSchema);
