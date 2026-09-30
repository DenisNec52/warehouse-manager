/**
 * models/Migration.js — registro delle migrazioni dati già eseguite (vedi utils/migrations.js).
 */
const mongoose = require("mongoose");

const migrationSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true },
  completedAt: { type: Date, default: Date.now },
  details:     { type: mongoose.Schema.Types.Mixed },
});

module.exports = mongoose.model("Migration", migrationSchema);
