/**
 * middleware/apiKeyAuth.js — autenticazione dell'API di integrazione (/api/v1).
 *
 * Niente cookie: il chiamante è un server (il gestionale offerte, un ERP...),
 * che manda la chiave in "Authorization: Bearer whk_..." (o "X-API-Key").
 * Dopo l'autenticazione req.apiKey è la chiave e req.user l'admin che l'ha
 * creata, con il nome sostituito da "API · <nome chiave>" (così movimenti,
 * notifiche e registro modifiche mostrano da dove arriva l'operazione).
 */
const rateLimit = require("express-rate-limit");
const ApiKey = require("../models/ApiKey");
const User   = require("../models/User");
const { parseKey, matches, keyFromRequest } = require("../services/apiKeys");
const { clientIp } = require("../utils/clientIp");

const problem = (res, status, code, message, extra = {}) =>
  res.status(status).json({ error: { code, message, ...extra } });

async function authenticateApiKey(req, res, next) {
  try {
    const parsed = parseKey(keyFromRequest(req));
    if (!parsed) return problem(res, 401, "unauthorized", "Chiave API mancante o non valida.");

    const apiKey = await ApiKey.findOne({ prefix: parsed.prefix }).select("+keyHash");
    if (!apiKey || !matches(parsed.key, apiKey.keyHash))
      return problem(res, 401, "unauthorized", "Chiave API mancante o non valida.");
    if (!apiKey.isUsable())
      return problem(res, 401, "key_revoked", "Chiave API revocata o scaduta.");

    // Per l'allowlist si usa req.ip (con "trust proxy" = 1 è l'IP che si è collegato
    // al proxy di Render), NON il primo valore di X-Forwarded-For: quello lo può
    // scrivere chiunque chiami il backend direttamente (vedi utils/clientIp.js).
    // Per questo il gestionale deve chiamare l'URL di Render, non passare da Vercel.
    const ip = req.ip || clientIp(req);
    if (apiKey.allowedIps.length && !apiKey.allowedIps.includes(ip))
      return problem(res, 403, "ip_not_allowed", "Questa chiave non è autorizzata da questo indirizzo IP.");

    const owner = await User.findById(apiKey.createdBy);
    if (!owner || !owner.isActive || owner.role !== "admin")
      return problem(res, 401, "key_owner_inactive", "L'amministratore che ha creato questa chiave non è più attivo.");

    // Aggiorna l'ultimo utilizzo al massimo una volta al minuto (evita una scrittura per richiesta).
    if (!apiKey.lastUsedAt || Date.now() - apiKey.lastUsedAt > 60 * 1000 || apiKey.lastUsedIp !== ip) {
      ApiKey.updateOne({ _id: apiKey._id }, { lastUsedAt: new Date(), lastUsedIp: ip }).catch(() => {});
    }

    owner.name = `API · ${apiKey.name}`;
    req.apiKey = apiKey;
    req.user   = owner;
    next();
  } catch (err) {
    next(err);
  }
}

/** Richiede uno o più scope sulla chiave. */
function requireScope(...scopes) {
  return (req, res, next) => {
    const missing = scopes.filter((s) => !req.apiKey?.scopes.includes(s));
    if (missing.length) return problem(res, 403, "insufficient_scope", `Permesso mancante: ${missing.join(", ")}.`, { required: scopes });
    next();
  };
}

/** Limite per chiave (dal prefisso, senza DB); senza chiave valida, per IP. */
const apiKeyLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_API_KEY_MAX) || 1200,
  keyGenerator: (req) => {
    const parsed = parseKey(keyFromRequest(req));
    return parsed ? `key:${parsed.prefix}` : `ip:${clientIp(req)}`;
  },
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (req, res) => problem(res, 429, "rate_limited", "Troppe richieste. Riprova tra qualche minuto."),
});

module.exports = { authenticateApiKey, requireScope, apiKeyLimiter, problem };
