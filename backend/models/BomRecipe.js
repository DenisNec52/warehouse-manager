/**
 * models/BomRecipe.js — Distinta base (Bill of Materials) per custodia e fase.
 *
 * Dice QUALI articoli di magazzino e QUANTI servono per UNA custodia in UNA fase
 * di lavorazione (es. "IP65 Piccola" + "Prima saldatura" = 2× flangia 1534-1,
 * 4× taglio, 1× setto laser). Prendendo una commessa con quantità N, il sistema
 * PROPONE N× questa distinta; l'operatore conferma o aggiusta (modalità ibrida)
 * e solo allora le scorte vengono scalate (vedi routes/production.js).
 *
 * La distinta è una PROPOSTA riusabile, non un movimento: lo scarico effettivo
 * è registrato dai Movement OUT creati al salvataggio della riga di produzione.
 */
const mongoose = require("mongoose");

const bomComponentSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  quantita: { type: Number, required: true, min: 1 },   // per singola custodia
}, { _id: false });

const bomRecipeSchema = new mongoose.Schema({
  department:   { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true, index: true },
  standardTime: { type: mongoose.Schema.Types.ObjectId, ref: "StandardTime", required: true }, // la custodia
  fase:         { type: String, required: true, trim: true },   // deve essere tra AppSettings.workPhases
  components:   { type: [bomComponentSchema], default: [] },
  isActive:     { type: Boolean, default: true },
  updatedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

// Una sola distinta per combinazione reparto + custodia + fase.
bomRecipeSchema.index({ department: 1, standardTime: 1, fase: 1 }, { unique: true });

module.exports = mongoose.model("BomRecipe", bomRecipeSchema);
