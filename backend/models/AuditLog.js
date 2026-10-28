/**
 * models/AuditLog.js
 *
 * Registro delle modifiche: chi ha fatto cosa, su quale dato, quando e da dove.
 * Le voci si scrivono e si leggono, non si modificano: nessuna route le aggiorna
 * o le cancella. Una volta all'anno (o quando serve) si possono archiviare
 * esportandole; la scadenza automatica è opzionale (AUDIT_RETENTION_DAYS).
 */
const mongoose = require("mongoose");

const changeSchema = new mongoose.Schema({
  field: String,
  from:  mongoose.Schema.Types.Mixed,
  to:    mongoose.Schema.Types.Mixed,
}, { _id: false });

const auditLogSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },

  // Chi: un utente della UI, una chiave API dell'integrazione o il sistema stesso.
  actorType: { type: String, enum: ["user", "apiKey", "system"], required: true },
  actorId:   { type: mongoose.Schema.Types.ObjectId, default: null },
  actorName: { type: String, default: "" },

  // Cosa: azione nel formato "entità.verbo" (es. "product.update", "user.password_reset").
  action:     { type: String, required: true },
  entityType: { type: String, required: true },
  entityId:   { type: mongoose.Schema.Types.ObjectId, default: null },
  entityLabel:{ type: String, default: "" },

  changes: [changeSchema],
  meta:    { type: mongoose.Schema.Types.Mixed, default: undefined },
  ip:      { type: String, default: "" },
}, { versionKey: false });

auditLogSchema.index({ at: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, at: -1 });
auditLogSchema.index({ actorId: 1, at: -1 });
auditLogSchema.index({ action: 1, at: -1 });

const retentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS, 10);
if (retentionDays > 0) {
  auditLogSchema.index({ at: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });
}

module.exports = mongoose.model("AuditLog", auditLogSchema);
