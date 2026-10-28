/**
 * middleware/auth.js
 *
 * Verifica il JWT dal cookie httpOnly.
 * Protegge tutte le route che richiedono autenticazione.
 */
const jwt  = require("jsonwebtoken");
const User = require("../models/User");

/**
 * protect — middleware di autenticazione principale.
 * Aggiunge req.user con i dati dell'utente loggato.
 */
exports.protect = async (req, res, next) => {
  try {
    const token = req.cookies?.wh_token;
    if (!token) return res.status(401).json({ message: "Non autenticato. Effettua il login." });

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    const user    = await User.findById(decoded.id).select("-password +tokenVersion");

    if (!user || !user.isActive)
      return res.status(401).json({ message: "Utente non trovato o disabilitato." });

    // Sessione revocata (password cambiata, "esci ovunque", account disattivato e
    // riattivato...): il token è firmato bene ma appartiene a una versione vecchia.
    if ((decoded.tv ?? 0) !== (user.tokenVersion ?? 0))
      return res.status(401).json({ message: "Sessione non più valida. Effettua di nuovo il login." });

    // Aggiorna lastSeen ogni 5 minuti (evita write eccessive)
    const fiveMin = 5 * 60 * 1000;
    if (!user.lastSeen || Date.now() - user.lastSeen > fiveMin) {
      await User.findByIdAndUpdate(user._id, { lastSeen: new Date() });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError")
      return res.status(401).json({ message: "Sessione scaduta. Effettua di nuovo il login." });
    return res.status(401).json({ message: "Token non valido." });
  }
};

/** Invalida tutte le sessioni aperte di un utente (vedi User.tokenVersion). */
exports.revokeSessions = (userId, session) =>
  User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } }, session ? { session } : undefined);

/**
 * requireAdmin — da usare dopo protect.
 * Blocca l'accesso agli utenti non admin.
 */
exports.requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin")
    return res.status(403).json({ message: "Accesso negato. Richiesto ruolo admin." });
  next();
};

/**
 * requireSupervisor — da usare dopo protect.
 * Consente admin e supervisore, blocca gli operatori.
 */
exports.requireSupervisor = (req, res, next) => {
  if (!["admin", "supervisore"].includes(req.user?.role))
    return res.status(403).json({ message: "Accesso negato. Richiesto ruolo supervisore o admin." });
  next();
};

/**
 * requireSuperAdmin — da usare dopo protect.
 * Riservato all'unico super-admin (impostazioni globali dell'app).
 */
exports.requireSuperAdmin = (req, res, next) => {
  if (!req.user?.isSuperAdmin)
    return res.status(403).json({ message: "Accesso riservato al super-admin." });
  next();
};
