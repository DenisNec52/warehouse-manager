/**
 * utils/geoip.js
 *
 * Geolocalizzazione IP best-effort per il log accessi utenti.
 * Usa ip-api.com (nessuna API key richiesta, limite 45 req/min).
 * Fallisce silenziosamente: un login non deve mai bloccarsi per questo.
 */
const PRIVATE_IP_RE = /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

async function lookupLocation(ip) {
  if (!ip) return null;
  const clean = ip.replace("::ffff:", "");
  if (PRIVATE_IP_RE.test(clean)) return null;

  try {
    const res = await fetch(`http://ip-api.com/json/${clean}?fields=status,city,country`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();
    if (data.status !== "success") return null;
    return [data.city, data.country].filter(Boolean).join(", ") || null;
  } catch {
    return null;
  }
}

module.exports = { lookupLocation };
