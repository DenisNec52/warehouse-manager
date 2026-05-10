/**
 * models/User.js
 *
 * Schema utente con:
 * - hashing automatico password via bcrypt (pre-save hook)
 * - ruoli: admin | operatore
 * - tema personalizzato salvato nel profilo
 * - timestamp automatici
 */
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const themeSchema = new mongoose.Schema({
  mode:        { type: String, enum: ["light","dark","steel"], default: "light" },
  accentColor: { type: String, default: "#3b82f6" },
  radius:      { type: String, enum: ["none","sm","md","lg","full"], default: "md" },
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: {
    type:     String,
    required: [true, "Username obbligatorio"],
    unique:   true,
    trim:     true,
    lowercase: true,
    minlength: [3, "Username minimo 3 caratteri"],
  },
  password: {
    type:     String,
    required: [true, "Password obbligatoria"],
    minlength: [6, "Password minimo 6 caratteri"],
    select:   false,  // mai restituita nelle query di default
  },
  name: {
    type:     String,
    required: [true, "Nome obbligatorio"],
    trim:     true,
  },
  role: {
    type:    String,
    enum:    ["admin", "operatore"],
    default: "operatore",
  },
  isActive:   { type: Boolean, default: true },
  theme:      { type: themeSchema, default: () => ({}) },
  lastLogin:  Date,
  lastSeen:   Date,
}, { timestamps: true });

// ── Hash password prima del salvataggio ───────────────────────
userSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Confronta password in chiaro con hash ─────────────────────
userSchema.methods.comparePassword = function(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// ── Risposta pubblica (senza password) ───────────────────────
userSchema.methods.toPublic = function() {
  return {
    id:       this._id,
    username: this.username,
    name:     this.name,
    role:     this.role,
    theme:    this.theme,
    lastLogin:this.lastLogin,
  };
};

module.exports = mongoose.model("User", userSchema);
