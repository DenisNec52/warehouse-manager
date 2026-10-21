/**
 * utils/geoip.js
 *
 * Geolocalizzazione IP best-effort per il log accessi utenti.
 * Usa ip-api.com (nessuna API key richiesta, limite 45 req/min).
 * Fallisce silenziosamente: un login non deve mai bloccarsi per questo.
 */
const PRIVATE_IP_RE = /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

// L'IP arriva da un header potenzialmente falsificabile (X-Forwarded-For) e
// viene inserito nel path della URL di ip-api.com: va accettato SOLO se è un
// IPv4/IPv6 ben formato, altrimenti un valore tipo "1.2.3.4/altro?x=y" o un
// hostname potrebbe alterare la richiesta in uscita. Se non è un IP valido,
// semplicemente non geolocalizziamo (comportamento best-effort invariato).
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;
const isValidIp = (ip) => IPV4_RE.test(ip) || (ip.includes(":") && IPV6_RE.test(ip));

async function lookupLocation(ip) {
  if (!ip) return null;
  const clean = ip.replace("::ffff:", "");
  if (PRIVATE_IP_RE.test(clean)) return null;
  if (!isValidIp(clean)) return null;

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
