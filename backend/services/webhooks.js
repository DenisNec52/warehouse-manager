/**
 * services/webhooks.js — invio degli eventi (services/events.js) agli URL
 * registrati dagli admin (models/WebhookSubscription.js).
 *
 * Ogni invio è una POST JSON firmata:
 *   X-Warehouse-Event:     tipo evento (es. movement.created)
 *   X-Warehouse-Delivery:  id univoco dell'invio (uguale nei retry: usalo per scartare duplicati)
 *   X-Warehouse-Signature: t=<unix sec>,v1=<hex HMAC-SHA256 di "<t>.<body>" con il segreto>
 * Il ricevente ricalcola l'HMAC, lo confronta a tempo costante e rifiuta firme
 * più vecchie di 5 minuti (protezione da replay). Esempio in docs/INTEGRAZIONE.md.
 *
 * Sicurezza (SSRF): un admin che inserisce "http://169.254.169.254/..." o un
 * indirizzo della rete interna non deve poter usare il server come ponte.
 * Solo https, nessun redirect seguito, e l'IP viene verificato al momento della
 * connessione (lookup personalizzato), non solo alla registrazione: così non
 * passa nemmeno un DNS che cambia risposta tra un controllo e l'altro.
 *
 * Consegna: 3 tentativi (subito, dopo 5 s, dopo 30 s), timeout 5 s ciascuno.
 * Dopo 20 fallimenti consecutivi la sottoscrizione viene disattivata.
 * È una consegna "best effort" in memoria: se il server si riavvia durante i
 * retry, quell'evento si perde. Per la riconciliazione il gestionale può sempre
 * rileggere i feed /api/v1/movements e /api/v1/products con updatedSince.
 */
const crypto = require("crypto");
const dns    = require("dns");
const net    = require("net");
const http   = require("http");
const https  = require("https");
const WebhookSubscription = require("../models/WebhookSubscription");
const WebhookDelivery     = require("../models/WebhookDelivery");
const events = require("./events");

const TIMEOUT_MS = 5000;
const RETRY_DELAYS_MS = [0, 5000, 30000];
const MAX_CONSECUTIVE_FAILURES = 20;

// ── Cifratura del segreto ─────────────────────────────────────
function encKey() {
  const base = process.env.DATA_ENCRYPTION_KEY || `webhook:${process.env.JWT_SECRET}`;
  return crypto.createHash("sha256").update(base).digest();
}
function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}
function decryptSecret(enc) {
  const [iv, tag, data] = enc.split(".").map((s) => Buffer.from(s, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}
const newSecret = () => `whsec_${crypto.randomBytes(32).toString("base64url")}`;

function sign(secret, body, t = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

// ── Protezione SSRF ───────────────────────────────────────────
const allowPrivate = () => process.env.WEBHOOK_ALLOW_PRIVATE === "true" && process.env.NODE_ENV !== "production";

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("ff");
}

/** Errore leggibile se l'URL non è ammesso, altrimenti null (controllo statico, alla registrazione). */
function urlProblem(raw) {
  let u;
  try { u = new URL(raw); } catch { return "URL non valido."; }
  if (u.protocol !== "https:" && !(allowPrivate() && u.protocol === "http:")) return "Sono ammessi solo URL https.";
  if (u.username || u.password) return "L'URL non può contenere credenziali.";
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!allowPrivate() && (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || (net.isIP(host) && isPrivateIp(host))))
    return "Indirizzi interni o privati non ammessi.";
  return null;
}

/** lookup per http(s).request che rifiuta gli IP privati al momento della connessione. */
// Node può chiedere un solo indirizzo o tutti (all: true, con autoSelectFamily):
// si rispetta la forma richiesta e si rifiuta se ANCHE UNO degli indirizzi è privato.
function safeLookup(hostname, options, cb) {
  const opts = typeof options === "object" && options ? options : {};
  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err);
    if (!allowPrivate() && addresses.some((a) => isPrivateIp(a.address)))
      return cb(Object.assign(new Error("ip privato"), { code: "EPRIVATE" }));
    if (opts.all) return cb(null, addresses);
    cb(null, addresses[0].address, addresses[0].family);
  });
}

function post(url, body, headers) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const started = Date.now();
    const req = lib.request(u, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "User-Agent": "WarehousePro-Webhooks/1", ...headers },
      lookup: safeLookup,
      timeout: TIMEOUT_MS,
    }, (res) => {
      res.resume();   // il corpo della risposta non interessa
      res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: String(res.statusCode), durationMs: Date.now() - started }));
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })));
    req.on("error", (err) => resolve({
      ok: false,
      status: err.code === "EPRIVATE" ? "rifiutato: ip privato" : err.code === "ETIMEOUT" ? "timeout" : `errore: ${err.code || err.message}`,
      durationMs: Date.now() - started,
    }));
    req.end(body);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Consegna un evento a UNA sottoscrizione, con retry. Restituisce l'ultimo esito. */
async function deliver(sub, evt, { retries = true } = {}) {
  const secret = decryptSecret(sub.secretEnc);
  const deliveryId = crypto.randomUUID();
  const body = JSON.stringify({ id: deliveryId, type: evt.type, occurredAt: evt.occurredAt, data: evt.data });
  let last = null;
  const attempts = retries ? RETRY_DELAYS_MS.length : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (RETRY_DELAYS_MS[attempt - 1]) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    const problem = urlProblem(sub.url);
    last = problem
      ? { ok: false, status: `rifiutato: ${problem}`, durationMs: 0 }
      : await post(sub.url, body, {
          "X-Warehouse-Event": evt.type,
          "X-Warehouse-Delivery": deliveryId,
          "X-Warehouse-Signature": sign(secret, body),
        });
    await WebhookDelivery.create({ subscription: sub._id, deliveryId, event: evt.type, attempt, ...last }).catch(() => {});
    if (last.ok || problem) break;
  }

  const update = last.ok
    ? { lastDeliveryAt: new Date(), lastStatus: last.status, consecutiveFailures: 0 }
    : { lastDeliveryAt: new Date(), lastStatus: last.status, $inc: { consecutiveFailures: 1 } };
  const updated = await WebhookSubscription.findByIdAndUpdate(sub._id, update, { new: true }).catch(() => null);
  if (updated && !last.ok && updated.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && updated.active) {
    await WebhookSubscription.updateOne({ _id: sub._id }, { active: false, disabledReason: `Disattivato dopo ${MAX_CONSECUTIVE_FAILURES} invii falliti consecutivi.` }).catch(() => {});
  }
  return { deliveryId, ...last };
}

async function dispatch(evt) {
  try {
    const subs = await WebhookSubscription.find({ active: true, events: evt.type }).select("+secretEnc");
    await Promise.all(subs.map((s) => deliver(s, evt).catch((e) => console.error("[webhooks]", e.message))));
  } catch (err) {
    console.error("[webhooks] dispatch", err.message);
  }
}

let started = false;
function start() {
  if (started) return;
  started = true;
  events.subscribe((evt) => { dispatch(evt); });
}

module.exports = { start, deliver, dispatch, sign, urlProblem, isPrivateIp, encryptSecret, decryptSecret, newSecret };
