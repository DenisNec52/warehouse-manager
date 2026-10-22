/**
 * models/AppSettings.js
 *
 * Impostazioni globali dell'app, modificabili SOLO dal super-admin (pannello
 * dedicato). Documento singolo (singleton, key fisso "app").
 *
 * - appName: nome mostrato nella sidebar.
 * - workPhases: fasi di lavorazione (es. "Prima saldatura", ...). Le usa anche
 *   la deduzione automatica del magazzino (distinta base per fase).
 * - moduleVisibility: per ogni modulo di menu, i ruoli ammessi a vederlo. È uno
 *   STRATO di nascondimento lato interfaccia che si somma — non sostituisce — ai
 *   controlli di autorizzazione lato server (quelli restano la vera difesa).
 */
const mongoose = require("mongoose");

const DEFAULT_PHASES = ["Prima saldatura", "Seconda saldatura", "Montaggio", "Collaudo"];

const appSettingsSchema = new mongoose.Schema({
  key:      { type: String, default: "app", unique: true },
  appName:  { type: String, default: "Warehouse Manager", trim: true },
  workPhases: { type: [String], default: () => [...DEFAULT_PHASES] },
  // { [moduleKey]: ["admin","supervisore","operatore"] }. Chiave assente = visibile a tutti.
  moduleVisibility: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

/** Restituisce il documento singleton, creandolo coi default se non esiste. */
appSettingsSchema.statics.getSettings = function () {
  return this.findOneAndUpdate(
    { key: "app" },
    { $setOnInsert: { key: "app" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
};

module.exports = mongoose.model("AppSettings", appSettingsSchema);
module.exports.DEFAULT_PHASES = DEFAULT_PHASES;
