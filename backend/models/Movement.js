const mongoose = require("mongoose");

const movementSchema = new mongoose.Schema({
  code:        { type: String, required: true, trim: true, uppercase: true },
  description: { type: String, trim: true, default: "" },
  qty:         { type: Number, required: true, min: 1 },
  type:        { type: String, required: true, enum: ["IN","OUT"] },
  category:    { type: String, trim: true, default: "" },
  note:        { type: String, trim: true, default: "" },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  userName:    { type: String, required: true },
  userRole:    { type: String, required: true },
}, { timestamps: true });

movementSchema.index({ code: 1 });
movementSchema.index({ createdAt: -1 });
movementSchema.index({ category: 1 });
movementSchema.index({ type: 1 });

module.exports = mongoose.model("Movement", movementSchema);
