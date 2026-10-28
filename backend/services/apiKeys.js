/**
 * services/apiKeys.js — generazione e verifica delle chiavi API (vedi models/ApiKey.js).
 */
const crypto = require("crypto");

const KEY_RE = /^whk_([A-Za-z0-9]{10})_([A-Za-z0-9_-]{43})$/;

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** Nuova chiave: { key (da mostrare una volta), prefix, keyHash }. */
function generateKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(10);
  const prefix = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  const secret = crypto.randomBytes(32).toString("base64url");   // 43 caratteri
  const key = `whk_${prefix}_${secret}`;
  return { key, prefix, keyHash: sha256(key) };
}

/** Prefisso della chiave se il formato è valido, altrimenti null (nessun accesso al DB). */
function parseKey(raw) {
  const m = typeof raw === "string" ? raw.trim().match(KEY_RE) : null;
  return m ? { prefix: m[1], key: m[0] } : null;
}

function matches(key, keyHash) {
  const a = Buffer.from(sha256(key), "hex");
  const b = Buffer.from(String(keyHash || ""), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Chiave dalla richiesta: "Authorization: Bearer whk_..." oppure "X-API-Key: whk_...". */
function keyFromRequest(req) {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const x = req.headers["x-api-key"];
  return typeof x === "string" ? x.trim() : "";
}

module.exports = { generateKey, parseKey, matches, keyFromRequest };
