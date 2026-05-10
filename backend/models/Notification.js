/**
 * models/Notification.js
 *
 * Notifiche di sistema (scorte basse, movimenti importanti, login).
 * TTL automatico: eliminazione dopo 90 giorni.
 */
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["low_stock","movement","login","system","warning"],
    required: true,
  },
  title:   { type: String, required: true },
  message: { type: String, required: true },
  read:    { type: Boolean, default: false },
  link:    { type: String, default: "" },   // URL relativo per navigazione
  meta:    { type: mongoose.Schema.Types.Mixed },  // dati extra flessibili

  // A chi è destinata (null = broadcast a tutti gli admin)
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, {
  timestamps: true,
});

// TTL: elimina automaticamente dopo 90 giorni
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });
notificationSchema.index({ userId: 1, read: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
