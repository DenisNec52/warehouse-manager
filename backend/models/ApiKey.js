/**
 * models/ApiKey.js — chiavi per l'API di integrazione (/api/v1).
 *
 * Formato della chiave: whk_<prefisso 10 caratteri>_<segreto 43 caratteri>.
 * Nel DB restano solo il prefisso (per trovarla) e lo SHA-256 della chiave
 * intera: la chiave in chiaro viene mostrata UNA volta alla creazione.
 * Con 256 bit di entropia lo SHA-256 basta (bcrypt serve per le password
 * scelte dalle persone, non per segreti casuali di questa lunghezza).
 */
const mongoose = require("mongoose");

const SCOPES = [
  "products:read",      // anagrafica articoli e giacenze
  "movements:read",     // feed dei movimenti
  "movements:write",    // registrare entrate/uscite
  "reservations:read",  // leggere le prenotazioni
  "reservations:write", // creare, rilasciare e consumare prenotazioni
  "production:read",    // stato delle commesse in produzione
];

const apiKeySchema = new mongoose.Schema({
  name:    { type: String, required: true, trim: true, maxlength: 80 },   // es. "Gestionale offerte"
  prefix:  { type: String, required: true, unique: true },
  keyHash: { type: String, required: true, select: false },
  scopes:  { type: [{ type: String, enum: SCOPES }], default: [] },

  // Facoltativo: se impostato, la chiave funziona solo da questi IP (server del gestionale).
  allowedIps: { type: [String], default: [] },

  expiresAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  lastUsedAt: { type: Date, default: null },
  lastUsedIp: { type: String, default: "" },

  // L'admin che l'ha creata: i movimenti fatti con la chiave sono attribuiti a lui
  // (con nome "API · <nome chiave>"). Se l'admin viene disattivato, la chiave smette
  // di funzionare: nessuna integrazione sopravvive a chi l'ha autorizzata.
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

apiKeySchema.methods.isUsable = function() {
  if (this.revokedAt) return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  return true;
};

apiKeySchema.methods.toPublic = function() {
  return {
    id:         this._id,
    name:       this.name,
    prefix:     this.prefix,
    scopes:     this.scopes,
    allowedIps: this.allowedIps,
    expiresAt:  this.expiresAt,
    revokedAt:  this.revokedAt,
    lastUsedAt: this.lastUsedAt,
    lastUsedIp: this.lastUsedIp,
    createdAt:  this.createdAt,
    createdBy:  this.createdBy,
    active:     this.isUsable(),
  };
};

module.exports = mongoose.model("ApiKey", apiKeySchema);
module.exports.SCOPES = SCOPES;
