const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true, trim: true },
  createdBy: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model("Category", categorySchema);
