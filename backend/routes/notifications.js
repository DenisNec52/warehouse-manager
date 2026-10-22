/**
 * routes/notifications.js
 */
const express      = require("express");
const mongoose     = require("mongoose");
const Notification = require("../models/Notification");
const { protect }  = require("../middleware/auth");
const { notificationScope } = require("../utils/colleagues");
const router       = express.Router();

router.use(protect);

router.get("/", async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const filter = notificationScope(req.user);
  const skip   = (parseInt(page) - 1) * parseInt(limit);
  const [notifications, total] = await Promise.all([
    Notification.find(filter).sort("-createdAt").skip(skip).limit(parseInt(limit)).lean(),
    Notification.countDocuments(filter),
  ]);
  res.json({ notifications, total, unread: notifications.filter(n => !n.read).length });
});

router.patch("/read-all", async (req, res) => {
  await Notification.updateMany(
    { ...notificationScope(req.user), read: false },
    { read: true }
  );
  res.json({ ok: true });
});

const TYPES = ["low_stock", "movement", "login", "system", "warning"];

// ── Cancellazione selettiva (bulk) ─────────────────────────────
// DELETE /api/notifications?type=<tipo>|all&onlyRead=true
//   • type=login  → cancella le notifiche di ACCESSO ("tutte le notifiche degli accessi")
//   • type=all    → cancella tutte le notifiche visibili ("notifiche in generale")
//   • onlyRead=true → limita a quelle già lette
// Sempre ristretto allo scope dell'utente: si cancella solo ciò che si può vedere.
router.delete("/", async (req, res) => {
  const filter = { ...notificationScope(req.user) };
  const type = typeof req.query.type === "string" ? req.query.type : "all";
  if (type !== "all") {
    if (!TYPES.includes(type)) return res.status(400).json({ message: "Tipo di notifica non valido." });
    filter.type = type;
  }
  if (req.query.onlyRead === "true") filter.read = true;
  const { deletedCount } = await Notification.deleteMany(filter);
  res.json({ ok: true, deleted: deletedCount });
});

// Segna letta UNA notifica — solo se è nello scope dell'utente (no IDOR su id altrui).
router.patch("/:id/read", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Notifica non trovata." });
  const n = await Notification.findOneAndUpdate(
    { _id: req.params.id, ...notificationScope(req.user) },
    { read: true },
  );
  if (!n) return res.status(404).json({ message: "Notifica non trovata." });
  res.json({ ok: true });
});

// Elimina UNA notifica — solo se è nello scope dell'utente (no IDOR su id altrui).
router.delete("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Notifica non trovata." });
  const n = await Notification.findOneAndDelete({ _id: req.params.id, ...notificationScope(req.user) });
  if (!n) return res.status(404).json({ message: "Notifica non trovata." });
  res.json({ ok: true });
});

module.exports = router;
