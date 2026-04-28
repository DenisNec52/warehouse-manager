const jwt  = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
      return res.status(401).json({ message: "Token mancante. Effettua il login." });

    const token   = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id).select("-password");

    if (!user || !user.isActive)
      return res.status(401).json({ message: "Utente non trovato o disabilitato." });

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError")
      return res.status(401).json({ message: "Sessione scaduta. Effettua nuovamente il login." });
    return res.status(401).json({ message: "Token non valido." });
  }
};
