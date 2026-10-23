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
  department:     { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true, index: true },
  departmentName: { type: String, trim: true, default: "" },              // snapshot per report e storico
  // Operatore (saldatore): opzionale, perché le righe importate da foglio Excel
  // possono non avere ancora la firma. null = "non assegnato".
  operatore:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  operatoreNome:  { type: String, trim: true, default: "" },              // snapshot per report e storico
  commessa:       { type: String, required: true, trim: true, index: true },
  posizione:      { type: String, trim: true, default: "" },
  cliente:        { type: String, trim: true, default: "" },              // da foglio saldatura
  quantita:       { type: Number, required: true, min: 1 },

  // Riferimento al catalogo Tempi standard: opzionale (le righe importate portano
  // i propri snapshot custodiaLabel/tempoStdMinuti senza per forza una voce a catalogo).
  standardTime:   { type: mongoose.Schema.Types.ObjectId, ref: "StandardTime", default: null },
  custodiaLabel:  { type: String, required: true, trim: true },           // snapshot, es. "T.F. PICCOLA"
  dn:             { type: String, trim: true, default: "" },              // da foglio: DN
  diametro:       { type: String, trim: true, default: "" },              // da foglio: Ø Elem. (mm)
  tipologia:      { type: String, trim: true, default: "" },              // da foglio: Tipologia (separata, es. "T.F.")
  dimensione:     { type: String, trim: true, default: "" },              // da foglio: Dimensione (separata, es. "PICCOLA")
  // Firme: NON vengono dal foglio. Si compilano da sole quando un utente preme
  // "Inizia" / "Finisci" sulla riga (chi finisce può essere un altro). firmaInizio/
  // firmaFine sono lo snapshot del nome, come operatoreNome.
  firmaInizio:    { type: String, trim: true, default: "" },
  firmaFine:      { type: String, trim: true, default: "" },
  iniziataDa:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  iniziataAt:     { type: Date, default: null },
  finitaDa:       { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  finitaAt:       { type: Date, default: null },
  tempoStdMinuti: { type: Number, required: true, min: 1 },               // snapshot, per pezzo

  tempoImpiegatoMinuti: { type: Number, required: true, min: 1 },         // totale della riga
  dataFine:       { type: Date, default: null },                          // commessa finita
  sospesa:        { type: Boolean, default: false },
  bindello:       { type: Boolean, default: false },
  note:           { type: String, trim: true, default: "" },

  // ── Fase di lavorazione + consumo magazzino ───────────────────
  // fase: una delle AppSettings.workPhases (es. "Prima saldatura"). Facoltativa:
  // le righe storiche e quelle senza scarico restano valide con fase null.
  fase:           { type: String, trim: true, default: null },
  // Snapshot degli articoli scalati dal magazzino per questa riga (per lo storico
  // e per mostrare nell'Andon "fascia presa/preparata da X, saldata da Y").
  // I movimenti OUT corrispondenti sono in Movement (movementIds).
  consumi: [{
    _id:         false,
    product:     { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productName: String,
    code:        String,
    quantita:    Number,
  }],
  movementIds:    [{ type: mongoose.Schema.Types.ObjectId, ref: "Movement" }],
  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

productionEntrySchema.virtual("tempoAttesoMinuti").get(function () {
  return this.tempoStdMinuti * this.quantita;
});

productionEntrySchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("ProductionEntry", productionEntrySchema);
