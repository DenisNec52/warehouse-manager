/**
 * models/StandardTime.js
 *
 * Tempi standard di saldatura, per reparto. Due forme:
 *  - GENERICO per tipologia (+ dimensione): commessa vuota, es. "Quadra saldata" 210 min
 *    (sono i tempi del foglio plastificato della Seconda Saldatura);
 *  - PER PEZZO: una riga del foglio di lavorazione (es. Prima Saldatura) con commessa,
 *    posizione, cliente, quantità, tipologia, DN, Ø elemento, dimensione e tempo a pezzo.
 * Il tempo è sempre per singola custodia, in minuti.
 */
const mongoose = require("mongoose");

const standardTimeSchema = new mongoose.Schema({
  department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true, index: true },
  // ── Identità del pezzo (vuote per i tempi generici) ──
  commessa:   { type: String, trim: true, default: "", maxlength: 50 },
  posizione:  { type: String, trim: true, default: "", maxlength: 20 },
  cliente:    { type: String, trim: true, default: "", maxlength: 200 },
  quantita:   { type: Number, default: null, min: 1 },
  // ── Caratteristiche ──
  tipologia:  { type: String, required: true, trim: true },            // es. "T.C." o "Custodia IP65 (calandrata)"
  dimensione: { type: String, trim: true, default: "" },               // es. "PICCOLA", "" se unica
  dn:         { type: String, trim: true, default: "", maxlength: 50 },
  diametro:   { type: String, trim: true, default: "", maxlength: 50 }, // Ø elemento (mm), testo: es. "10 inc."
  label:      { type: String, required: true, trim: true },            // nome breve mostrato nei menu
  minuti:     { type: Number, required: true, min: 1 },                // tempo standard per pezzo
  isActive:   { type: Boolean, default: true },
  updatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

// Unicità nel reparto: un pezzo è commessa+posizione; un tempo generico (commessa "")
// è tipologia+dimensione. Un solo indice copre entrambi i casi. Il vecchio indice
// reparto+tipologia+dimensione lo rimuove la migrazione "2026-11-01-tempi-per-pezzo".
standardTimeSchema.index(
  { department: 1, commessa: 1, posizione: 1, tipologia: 1, dimensione: 1 },
  { unique: true, name: "reparto_pezzo_tipologia" },
);

module.exports = mongoose.model("StandardTime", standardTimeSchema);
