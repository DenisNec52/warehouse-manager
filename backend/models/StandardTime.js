/**
 * models/StandardTime.js
 *
 * Tempi standard di saldatura per tipologia (+ dimensione) di custodia.
 * Sostituisce il foglio plastificato di reparto: il tempo è per singola custodia, in minuti.
 */
const mongoose = require("mongoose");

const standardTimeSchema = new mongoose.Schema({
  tipologia:  { type: String, required: true, trim: true },            // es. "Custodia IP65 (calandrata)"
  dimensione: { type: String, trim: true, default: "" },               // es. "Piccola (DN80-DN150)", "" se unica
  label:      { type: String, required: true, trim: true },            // nome breve per il reparto, es. "IP65 Piccola"
  minuti:     { type: Number, required: true, min: 1 },                // tempo standard per pezzo
  isActive:   { type: Boolean, default: true },
  updatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

standardTimeSchema.index({ tipologia: 1, dimensione: 1 }, { unique: true });

module.exports = mongoose.model("StandardTime", standardTimeSchema);
