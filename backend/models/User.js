/**
 * models/User.js
 *
 * Schema utente con:
 * - hashing automatico password via bcrypt (pre-save hook)
 * - ruoli: admin | supervisore | operatore
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
  // Opzionale: serve solo per il recupero password ("password dimenticata").
  // Un utente senza email configurata può comunque accedere normalmente,
  // ma per resettare la password dovrà rivolgersi a un admin/supervisore.
  email: {
    type:      String,
    trim:      true,
    lowercase: true,
    // NIENTE "default: null": un indice sparse esclude solo i documenti dove
    // il campo è del tutto ASSENTE, non quelli con valore null — con un
    // default a null ogni utente senza email avrebbe comunque il campo
    // valorizzato a null, e il secondo utente creato senza email fallirebbe
    // con un errore di chiave duplicata sull'indice unique. Lasciando il
    // campo assente quando non specificato, l'indice sparse funziona come
    // previsto: unico se presente, nessun vincolo se assente.
    //
    // Il setter converte anche "" in undefined: il form di creazione utente
    // invia sempre email: "" quando il campo è lasciato vuoto, e senza
    // questa conversione fallirebbe la validazione "match" (stringa vuota
    // non è un'email valida) invece di essere trattata come "nessuna email".
    set:       v => (v === "" || v == null ? undefined : v),
    sparse:    true,
    unique:    true,
    match:     [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email non valida"],
  },
  role: {
    type:    String,
    enum:    ["admin", "supervisore", "operatore"],
    default: "operatore",
  },
  isActive:   { type: Boolean, default: true },
  theme:      { type: themeSchema, default: () => ({}) },
  lastLogin:  Date,
  lastSeen:   Date,
  lastLoginIP:       String,
  lastLoginLocation: String,

  // ── Badge QR / NFC (login automatico) ─────────────────────────
  // In DB resta solo l'HMAC del segreto, mai il valore in chiaro:
  // vedi utils/badge.js. badgeIssuedAt è pubblico (serve solo a
  // mostrare in UI "badge generato il ..."), badgeSecretHash no.
  badgeSecretHash: { type: String, select: false, default: null },
  badgeIssuedAt:   { type: Date, default: null },
  badgeEnabled:    { type: Boolean, default: true },

  // ── Recupero password ("password dimenticata") ────────────────
  // Stesso principio del badge: nel DB resta solo l'hash del token,
  // mai il valore in chiaro, e scade dopo 1 ora.
  resetPasswordTokenHash: { type: String, select: false, default: null },
  resetPasswordExpires:   { type: Date, select: false, default: null },
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
    email:    this.email,
    role:     this.role,
    theme:    this.theme,
    lastLogin:this.lastLogin,
    badgeEnabled:  this.badgeEnabled,
    badgeIssuedAt: this.badgeIssuedAt,
  };
};

module.exports = mongoose.model("User", userSchema);
