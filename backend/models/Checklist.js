/**
 * models/Checklist.js
 * Template 5S con sezioni, voci, turni e tipologie di pulizia.
 */
const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema({
  label:    { type: String, required: true, trim: true },
  required: { type: Boolean, default: true },
  order:    { type: Number, default: 0 },
}, { _id: true });

const sectionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  icon:  { type: String, default: "📋" },
  order: { type: Number, default: 0 },
  items: [itemSchema],
}, { _id: true });

const shiftSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  startTime: { type: String, default: "06:00" },
  endTime:   { type: String, default: "14:00" },
  active:    { type: Boolean, default: true },
}, { _id: true });

const cleaningTypeSchema = new mongoose.Schema({
  label:   { type: String, required: true },
  default: { type: Boolean, default: false },
}, { _id: true });

const checklistSchema = new mongoose.Schema({
  title:        { type: String, default: "Autovalutazione Area 5S" },
  description:  { type: String, default: "Compilare a fine turno prima di lasciare la postazione di lavoro." },
  workArea:     { type: String, default: "Postazione Saldatura" },
  sections:     [sectionSchema],
  shifts:       [shiftSchema],
  cleaningTypes:[cleaningTypeSchema],
  active:       { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("Checklist", checklistSchema);
