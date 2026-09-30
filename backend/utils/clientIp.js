/**
 * utils/clientIp.js
 *
 * IP reale di chi fa la richiesta.
 *
 * Il frontend chiama l'API tramite la rewrite /api di Vercel: la connessione verso
 * Render arriva da un server Vercel, quindi req.ip (con "trust proxy" = 1) sarebbe
 * l'IP di Vercel, uguale per molti utenti diversi. Vercel sovrascrive X-Forwarded-For
 * con l'IP del client (non accoda valori mandati dal browser), e il proxy di Render
 * aggiunge i suoi dopo: il primo valore è quindi l'IP reale.
 * Chi chiamasse Render direttamente potrebbe falsificare questo header: per questo il
 * limite sui login usa lo username come chiave, non l'IP (vedi middleware/rateLimiter.js).
 */
function clientIp(req) {
  const header = req.headers["x-forwarded-for"];
  const first = typeof header === "string" ? header.split(",")[0].trim() : "";
  return first || req.ip || "unknown";
}

module.exports = { clientIp };
