/**
 * routes/integrations.js — gestione dell'integrazione dalla UI (solo admin).
 *
 * Chiavi API
 *   GET    /api/integrations/keys            elenco (mai la chiave in chiaro)
 *   POST   /api/integrations/keys            crea → la chiave è nella risposta UNA volta
 *   DELETE /api/integrations/keys/:id        revoca (irreversibile)
 * Webhook
 *   GET    /api/integrations/webhooks        elenco
 *   POST   /api/integrations/webhooks        crea → il segreto di firma è nella risposta UNA volta
 *   PUT    /api/integrations/webhooks/:id    modifica nome/url/eventi/attivo
 *   DELETE /api/integrations/webhooks/:id    elimina
 *   POST   /api/integrations/webhooks/:id/test        invia un evento "ping"
 *   GET    /api/integrations/webhooks/:id/deliveries  ultimi invii
 * Meta
 *   GET    /api/integrations/meta            scope ed eventi disponibili (per la UI)
 */
const express  = require("express");
const mongoose = require("mongoose");
const net      = require("net");
const { body } = require("express-validator");
const ApiKey   = require("../models/ApiKey");
const WebhookSubscription = require("../models/WebhookSubscription");
const WebhookDelivery     = require("../models/WebhookDelivery");
const { protect, requireAdmin } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { audit, diff } = require("../utils/audit");
const { generateKey } = require("../services/apiKeys");
const webhooks = require("../services/webhooks");
const { EVENT_TYPES } = require("../services/events");

const router = express.Router();
router.use(protect, requireAdmin);

const MAX_ACTIVE_KEYS = 20;
const MAX_WEBHOOKS    = 20;

router.get("/meta", (_req, res) => {
  res.json({ scopes: ApiKey.SCOPES, events: EVENT_TYPES });
});

// ── Chiavi API ────────────────────────────────────────────────
router.get("/keys", async (_req, res) => {
  const keys = await ApiKey.find().sort({ createdAt: -1 }).populate("createdBy", "name username");
  res.json({ keys: keys.map((k) => ({ ...k.toPublic(), createdBy: k.createdBy ? { name: k.createdBy.name, username: k.createdBy.username } : null })) });
});

router.post("/keys",
  [
    body("name").isString().trim().isLength({ min: 2, max: 80 }).withMessage("Nome 2–80 caratteri"),
    body("scopes").isArray({ min: 1 }).withMessage("Scegli almeno un permesso"),
    body("scopes.*").isIn(ApiKey.SCOPES).withMessage("Permesso non valido"),
    body("expiresAt").optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage("Scadenza non valida"),
    body("allowedIps").optional().isArray({ max: 20 }),
    body("allowedIps.*").custom((v) => net.isIP(String(v)) !== 0).withMessage("IP non valido"),
  ],
  validate,
  async (req, res) => {
    const active = await ApiKey.countDocuments({ revokedAt: null });
    if (active >= MAX_ACTIVE_KEYS) return res.status(400).json({ message: `Massimo ${MAX_ACTIVE_KEYS} chiavi attive: revocane una prima.` });
    const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) return res.status(400).json({ message: "La scadenza deve essere nel futuro." });

    const { key, prefix, keyHash } = generateKey();
    const apiKey = await ApiKey.create({
      name: req.body.name, prefix, keyHash,
      scopes: [...new Set(req.body.scopes)],
      allowedIps: [...new Set((req.body.allowedIps || []).map(String))],
      expiresAt,
      createdBy: req.user._id,
    });
    await audit(req, {
      action: "apiKey.create", entityType: "apiKey", entityId: apiKey._id, entityLabel: `${apiKey.name} (${prefix})`,
      meta: { scopes: apiKey.scopes, allowedIps: apiKey.allowedIps, expiresAt },
    });
    res.status(201).json({ key, apiKey: apiKey.toPublic() });
  });

router.delete("/keys/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Chiave non trovata." });
  const apiKey = await ApiKey.findOneAndUpdate(
    { _id: req.params.id, revokedAt: null },
    { revokedAt: new Date(), revokedBy: req.user._id },
    { new: true },
  );
  if (!apiKey) return res.status(404).json({ message: "Chiave non trovata o già revocata." });
  await audit(req, { action: "apiKey.revoke", entityType: "apiKey", entityId: apiKey._id, entityLabel: `${apiKey.name} (${apiKey.prefix})` });
  res.json({ apiKey: apiKey.toPublic() });
});

// ── Webhook ───────────────────────────────────────────────────
const webhookRules = (partial) => [
  body("name")[partial ? "optional" : "exists"]().isString().trim().isLength({ min: 2, max: 80 }).withMessage("Nome 2–80 caratteri"),
  body("url")[partial ? "optional" : "exists"]().isString().trim().isLength({ max: 500 }).custom((v) => {
    const p = webhooks.urlProblem(v);
    if (p) throw new Error(p);
    return true;
  }),
  body("events")[partial ? "optional" : "exists"]().isArray({ min: 1 }).withMessage("Scegli almeno un evento"),
  body("events.*").isIn(EVENT_TYPES).withMessage("Evento non valido"),
  body("active").optional().isBoolean(),
];

router.get("/webhooks", async (_req, res) => {
  const subs = await WebhookSubscription.find().sort({ createdAt: -1 });
  res.json({ webhooks: subs.map((s) => s.toPublic()) });
});

router.post("/webhooks", webhookRules(false), validate, async (req, res) => {
  if (await WebhookSubscription.countDocuments() >= MAX_WEBHOOKS)
    return res.status(400).json({ message: `Massimo ${MAX_WEBHOOKS} webhook.` });
  const secret = webhooks.newSecret();
  const sub = await WebhookSubscription.create({
    name: req.body.name, url: req.body.url, events: [...new Set(req.body.events)],
    secretEnc: webhooks.encryptSecret(secret), createdBy: req.user._id,
  });
  await audit(req, { action: "webhook.create", entityType: "webhook", entityId: sub._id, entityLabel: sub.name, meta: { url: sub.url, events: sub.events } });
  res.status(201).json({ secret, webhook: sub.toPublic() });
});

router.put("/webhooks/:id", webhookRules(true), validate, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Webhook non trovato." });
  const sub = await WebhookSubscription.findById(req.params.id);
  if (!sub) return res.status(404).json({ message: "Webhook non trovato." });
  const before = sub.toPublic();
  for (const k of ["name", "url", "events", "active"]) if (req.body[k] !== undefined) sub[k] = req.body[k];
  if (req.body.active === true) { sub.consecutiveFailures = 0; sub.disabledReason = ""; }
  await sub.save();
  await audit(req, { action: "webhook.update", entityType: "webhook", entityId: sub._id, entityLabel: sub.name, changes: diff(before, sub.toPublic(), ["name", "url", "events", "active"]) });
  res.json({ webhook: sub.toPublic() });
});

router.delete("/webhooks/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Webhook non trovato." });
  const sub = await WebhookSubscription.findByIdAndDelete(req.params.id);
  if (!sub) return res.status(404).json({ message: "Webhook non trovato." });
  await WebhookDelivery.deleteMany({ subscription: sub._id });
  await audit(req, { action: "webhook.delete", entityType: "webhook", entityId: sub._id, entityLabel: sub.name });
  res.json({ message: "Webhook eliminato." });
});

router.post("/webhooks/:id/test", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Webhook non trovato." });
  const sub = await WebhookSubscription.findById(req.params.id).select("+secretEnc");
  if (!sub) return res.status(404).json({ message: "Webhook non trovato." });
  const result = await webhooks.deliver(sub, {
    type: "ping", occurredAt: new Date().toISOString(), data: { message: "Test dal pannello Integrazioni" },
  }, { retries: false });
  res.json({ result });
});

router.get("/webhooks/:id/deliveries", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Webhook non trovato." });
  const deliveries = await WebhookDelivery.find({ subscription: req.params.id }).sort({ at: -1 }).limit(50).lean();
  res.json({ deliveries });
});

module.exports = router;
