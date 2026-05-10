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

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id).select("-password");

    if (!user || !user.isActive)
      return res.status(401).json({ message: "Utente non trovato o disabilitato." });

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

/**
 * requireAdmin — da usare dopo protect.
 * Blocca l'accesso agli utenti non admin.
 */
exports.requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin")
    return res.status(403).json({ message: "Accesso negato. Richiesto ruolo admin." });
  next();
};
