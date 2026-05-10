/**
 * models/Category.js
 *
 * Categorie prodotto con colore e icona emoji.
 * Indicizzate per nome per lookup veloci.
 */
const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true, unique: true },
  description: { type: String, trim: true, default: "" },
  color:       { type: String, default: "#3b82f6" },  // hex color
  icon:        { type: String, default: "📦" },         // emoji
  isActive:    { type: Boolean, default: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

categorySchema.index({ name: 1 });

module.exports = mongoose.model("Category", categorySchema);
