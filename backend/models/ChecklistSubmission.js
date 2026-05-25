/**
 * models/ChecklistSubmission.js
 * Compilazione 5S con sezioni, risposte, tipologia pulizia e turno.
 */
const mongoose = require("mongoose");

const responseSchema = new mongoose.Schema({
  itemId:    { type: mongoose.Schema.Types.ObjectId },
  sectionId: { type: mongoose.Schema.Types.ObjectId },
  label:     { type: String, required: true },
  checked:   { type: Boolean, default: false },
  note:      { type: String, default: "" },
}, { _id: false });

const submissionSchema = new mongoose.Schema({
  checklist:    { type: mongoose.Schema.Types.ObjectId, ref: "Checklist", required: true },
  shift:        { type: String, required: true },
  cleaningType: { type: String, required: true },
  date:         { type: String, required: true },  // YYYY-MM-DD
  responses:    [responseSchema],
  generalNote:  { type: String, default: "" },
  totalItems:   { type: Number, default: 0 },
  checkedItems: { type: Number, default: 0 },
  allChecked:   { type: Boolean, default: false },
  score:        { type: Number, default: 0 },  // percentuale 0-100

  submittedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  submittedByName:{ type: String, required: true },
}, { timestamps: true });

submissionSchema.index({ date: -1 });
submissionSchema.index({ submittedBy: 1, date: -1 });
submissionSchema.index({ shift: 1, date: -1 });

module.exports = mongoose.model("ChecklistSubmission", submissionSchema);
