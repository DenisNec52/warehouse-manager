/**
 * models/Department.js
 *
 * Reparti / postazioni di lavoro, condivisi da Pulizia 5S, Tempi standard e Andon Board
 * e usati per i gruppi utenti. Gestiti dall'admin: si disattivano, non si eliminano,
 * perché lo storico continua a riferirli.
 */
const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true, unique: true },
  order:     { type: Number, default: 0 },
  isActive:  { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.model("Department", departmentSchema);
