/**
 * routes/audit.js — consultazione del registro modifiche (solo admin).
 *
 * GET /api/audit?entityType=&entityId=&action=&actorId=&from=&to=&page=&limit=
 *
 * Il registro è in sola lettura: nessuna route lo modifica o lo cancella.
 * Coerente con il resto dell'app, le azioni del super-admin restano visibili
 * solo a lui (vedi utils/colleagues.js → hiddenSuperAdminId).
 */
const express  = require("express");
const mongoose = require("mongoose");
const AuditLog = require("../models/AuditLog");
const { protect, requireAdmin } = require("../middleware/auth");
const { hiddenSuperAdminId } = require("../utils/colleagues");

const router = express.Router();
router.use(protect, requireAdmin);

const str = (v) => (typeof v === "string" ? v.trim() : "");
const ENTITY_TYPES = ["product", "movement", "user", "settings", "apiKey", "webhook", "reservation"];

router.get("/", async (req, res) => {
  const filter = {};
  const entityType = str(req.query.entityType);
  if (ENTITY_TYPES.includes(entityType)) filter.entityType = entityType;
  const entityId = str(req.query.entityId);
  if (mongoose.isValidObjectId(entityId)) filter.entityId = entityId;
  const actorId = str(req.query.actorId);
  if (mongoose.isValidObjectId(actorId)) filter.actorId = actorId;
  const action = str(req.query.action);
  if (/^[A-Za-z_]+(\.[A-Za-z_]+)?$/.test(action)) filter.action = action.includes(".") ? action : { $regex: `^${action}\\.` };

  const from = new Date(str(req.query.from));
  const to   = new Date(str(req.query.to));
  if (!isNaN(from) || !isNaN(to)) {
    filter.at = {};
    if (!isNaN(from)) filter.at.$gte = from;
    if (!isNaN(to))   filter.at.$lte = to;
  }

  const hidden = await hiddenSuperAdminId(req);
  if (hidden) {
    filter.$and = [
      { actorId: { $ne: new mongoose.Types.ObjectId(hidden) } },
      { entityId: { $ne: new mongoose.Types.ObjectId(hidden) } },
    ];
  }

  const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const [entries, total] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ entries, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

module.exports = router;
