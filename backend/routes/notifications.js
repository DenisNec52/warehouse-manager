/**
 * routes/notifications.js
 */
const express      = require("express");
const Notification = require("../models/Notification");
const { protect }  = require("../middleware/auth");
const router       = express.Router();

router.use(protect);

router.get("/", async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const filter = { $or: [{ userId: req.user._id }, { userId: null }] };
  const skip   = (parseInt(page) - 1) * parseInt(limit);
  const [notifications, total] = await Promise.all([
    Notification.find(filter).sort("-createdAt").skip(skip).limit(parseInt(limit)).lean(),
    Notification.countDocuments(filter),
  ]);
  res.json({ notifications, total, unread: notifications.filter(n => !n.read).length });
});

router.patch("/:id/read", async (req, res) => {
  await Notification.findByIdAndUpdate(req.params.id, { read: true });
  res.json({ ok: true });
});

router.patch("/read-all", async (req, res) => {
  await Notification.updateMany(
    { $or: [{ userId: req.user._id }, { userId: null }], read: false },
    { read: true }
  );
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  await Notification.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
