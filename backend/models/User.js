const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true, minlength: 3 },
  password: { type: String, required: true, minlength: 6, select: false },
  name:     { type: String, required: true, trim: true },
  role:     { type: String, enum: ["Amministratore","Magazziniere","Operatore"], default: "Operatore" },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Hash automatico password prima del salvataggio
userSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Confronto password in chiaro con hash
userSchema.methods.comparePassword = async function(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Risposta pubblica senza campi sensibili
userSchema.methods.toPublic = function() {
  return { id: this._id, username: this.username, name: this.name, role: this.role };
};

module.exports = mongoose.model("User", userSchema);
