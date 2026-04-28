const express = require("express");
const jwt     = require("jsonwebtoken");
const User    = require("../models/User");
const auth    = require("../middleware/auth");
const router  = express.Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: "Username e password obbligatori." });

    const user = await User.findOne({ username: username.toLowerCase().trim() }).select("+password");
    if (!user || !user.isActive)
      return res.status(401).json({ message: "Credenziali non valide." });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: "Credenziali non valide." });

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    res.json({ token, user: user.toPublic() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Errore del server." });
  }
});

// GET /api/auth/me — verifica token e restituisce utente corrente
router.get("/me", auth, (req, res) => res.json({ user: req.user.toPublic() }));

module.exports = router;
