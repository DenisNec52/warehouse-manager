/**
 * utils/badge.js
 *
 * Login "badge" (QR code o tag NFC): genera e verifica il segreto
 * associato a ciascun utente e costruisce l'URL/immagine QR da
 * stampare o scrivere su un tag NFC.
 *
 * ── Modello di sicurezza ────────────────────────────────────────
 * Il segreto in chiaro NON viene mai salvato: nel DB resta solo un
 * HMAC-SHA256 (chiave = JWT_SECRET) del segreto — non un hash semplice,
 * così chi rubasse solo il database (senza il JWT_SECRET del server)
 * non potrebbe verificare né forgiare un badge valido.
 *
 * Per questo motivo il segreto in chiaro può essere mostrato SOLO al
 * momento della generazione: non è recuperabile in un secondo momento
 * (esattamente come una API key). "Rigenerare" crea un nuovo segreto
 * e invalida automaticamente quello precedente.
 *
 * Un QR code e un tag NFC scritto con lo stesso link sono equivalenti:
 * chi lo possiede accede come quell'utente, senza altre verifiche.
 * Vanno quindi trattati come una chiave fisica (occhio a chi li vede/copia).
 */
const crypto = require("crypto");
const QRCode = require("qrcode");

// 32 byte casuali → stringa url-safe di circa 43 caratteri.
function generateSecret() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashSecret(secret) {
  return crypto.createHmac("sha256", process.env.JWT_SECRET).update(secret).digest("hex");
}

// Confronto a tempo costante per evitare timing attack sull'uguaglianza.
function verifySecret(secret, storedHash) {
  if (!secret || !storedHash) return false;
  try {
    const candidate = Buffer.from(hashSecret(secret), "hex");
    const stored    = Buffer.from(storedHash, "hex");
    if (candidate.length !== stored.length) return false;
    return crypto.timingSafeEqual(candidate, stored);
  } catch {
    return false;
  }
}

const frontendBase = () => (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

// Il QR/tag NFC punta alla pagina /badge del FRONTEND, che fa il login con una richiesta
// dall'app (stessa strada del login con password). Aprire direttamente un URL del backend
// imposterebbe il cookie in un contesto diverso dal sito, e Safari/app fotocamera lo isolano.
// I dati stanno nel fragment (#): il browser non lo invia mai al server, quindi il segreto
// non finisce nei log di Vercel/Render.
function badgeUrl(userId, secret, source) {
  const params = new URLSearchParams({ u: String(userId), s: secret });
  if (source) params.set("src", source);
  return `${frontendBase()}/badge#${params}`;
}

async function qrImageDataUrl(url) {
  return QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 320 });
}

module.exports = { generateSecret, hashSecret, verifySecret, badgeUrl, qrImageDataUrl };
