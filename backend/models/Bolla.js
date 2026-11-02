/**
 * models/Bolla.js — PDF della bolla di una POSIZIONE di commessa.
 *
 * Una commessa può avere moltissime posizioni (2961/1, 2961/2, ... 2961/9): ognuna ha la sua
 * bolla. La chiave è quindi commessa + posizione (posizione "" per le righe senza posizione).
 * Il file sta in MongoDB GridFS (bucket "bolle"), non sul disco: Render cancella il
 * filesystem a ogni deploy e Cloudinary è facoltativo. Qui restano solo i metadati.
 * La funzione è accesa/spenta dal super-admin (AppSettings.features.bollaPdf).
 */
const mongoose = require("mongoose");

const bollaSchema = new mongoose.Schema({
  commessa:       { type: String, required: true, trim: true, maxlength: 50 },
  posizione:      { type: String, trim: true, default: "", maxlength: 20 },
  fileId:         { type: mongoose.Schema.Types.ObjectId, required: true },
  filename:       { type: String, trim: true, maxlength: 120, default: "bolla.pdf" },
  size:           { type: Number, required: true, min: 1 },
  uploadedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  uploadedByName: { type: String, trim: true, default: "" },
}, { timestamps: true });

bollaSchema.index({ commessa: 1, posizione: 1 }, { unique: true, name: "commessa_posizione" });

module.exports = mongoose.model("Bolla", bollaSchema);
