/**
 * models/ProductionEntry.js
 *
 * Riga dell'Andon Board di saldatura: chi ha lavorato quale commessa, quanti pezzi,
 * tempo standard atteso vs tempo impiegato.
 *
 * Il tempo standard viene copiato al momento della registrazione (tempoStdMinuti, custodiaLabel):
 * se la tabella dei tempi cambia in futuro, lo storico non viene riscritto.
 */
const mongoose = require("mongoose");

const productionEntrySchema = new mongoose.Schema({
  data:           { type: Date, required: true, index: true },            // giorno di lavoro
  operatore:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  operatoreNome:  { type: String, required: true, trim: true },           // snapshot per report e storico
  commessa:       { type: String, required: true, trim: true, index: true },
  posizione:      { type: String, trim: true, default: "" },
  quantita:       { type: Number, required: true, min: 1 },

  standardTime:   { type: mongoose.Schema.Types.ObjectId, ref: "StandardTime", required: true },
  custodiaLabel:  { type: String, required: true, trim: true },           // snapshot, es. "IP65 Piccola"
  tempoStdMinuti: { type: Number, required: true, min: 1 },               // snapshot, per pezzo

  tempoImpiegatoMinuti: { type: Number, required: true, min: 1 },         // totale della riga
  dataFine:       { type: Date, default: null },                          // commessa finita
  sospesa:        { type: Boolean, default: false },
  bindello:       { type: Boolean, default: false },
  note:           { type: String, trim: true, default: "" },
  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

productionEntrySchema.virtual("tempoAttesoMinuti").get(function () {
  return this.tempoStdMinuti * this.quantita;
});

productionEntrySchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("ProductionEntry", productionEntrySchema);
