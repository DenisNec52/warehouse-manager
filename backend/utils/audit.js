/**
 * utils/audit.js — scrittura del registro modifiche (vedi models/AuditLog.js).
 *
 * audit() non blocca mai l'operazione principale: se la scrittura del registro
 * fallisce, l'errore finisce nei log del server e la richiesta prosegue. Quando
 * l'operazione è dentro una transazione si può passare `session`, così la voce
 * di registro viene salvata (o annullata) insieme al dato.
 */
const AuditLog = require("../models/AuditLog");
const { clientIp } = require("./clientIp");

// Campi che non devono mai finire nel registro, nemmeno come "prima/dopo".
const SECRET_FIELDS = new Set([
  "password", "badgeSecretHash", "resetPasswordTokenHash", "resetPasswordExpires",
  "keyHash", "secret", "secretEnc", "tokenVersion",
]);

const norm = (v) => {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === "object" && typeof v.toHexString === "function") return v.toHexString();
  if (Array.isArray(v)) return v.map(norm);
  return v;
};

/** Differenze campo per campo tra due oggetti (solo i campi elencati in `fields`). */
function diff(before, after, fields) {
  const out = [];
  for (const f of fields) {
    if (SECRET_FIELDS.has(f)) continue;
    const a = norm(before?.[f]);
    const b = norm(after?.[f]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: f, from: a, to: b });
  }
  return out;
}

/** Chi sta agendo, dalla richiesta: utente della UI oppure chiave API. */
function actorOf(req) {
  if (req?.apiKey) return { actorType: "apiKey", actorId: req.apiKey._id, actorName: `API · ${req.apiKey.name}` };
  if (req?.user)   return { actorType: "user", actorId: req.user._id, actorName: req.user.name || req.user.username || "" };
  return { actorType: "system", actorId: null, actorName: "Sistema" };
}

/**
 * @param {object} req       richiesta Express (per attore e IP); può essere null per il sistema
 * @param {object} entry     { action, entityType, entityId, entityLabel, changes, meta }
 * @param {object} [opts]    { session }
 */
async function audit(req, entry, opts = {}) {
  try {
    const doc = {
      ...actorOf(req),
      action:      entry.action,
      entityType:  entry.entityType,
      entityId:    entry.entityId || null,
      entityLabel: entry.entityLabel || "",
      changes:     (entry.changes || []).filter((c) => !SECRET_FIELDS.has(c.field)),
      meta:        entry.meta,
      ip:          req ? clientIp(req) : "",
    };
    if (opts.session) await AuditLog.create([doc], { session: opts.session });
    else await AuditLog.create(doc);
  } catch (err) {
    // Dentro una transazione l'errore deve risalire, altrimenti dato e registro divergono.
    if (opts.session) throw err;
    console.error("[audit]", entry?.action, err.message);
  }
}

module.exports = { audit, diff, actorOf, SECRET_FIELDS };
