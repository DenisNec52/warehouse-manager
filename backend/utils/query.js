/**
 * utils/query.js — lettura sicura dei parametri di query.
 *
 * Express trasforma ?a[b]=1 in un oggetto e ?a=1&a=2 in un array: usati così come
 * arrivano finiscono nei filtri Mongo come operatori o fanno esplodere un .trim().
 * express-mongo-sanitize toglie solo le chiavi con "$", quindi qui si accettano
 * esclusivamente stringhe, e i numeri di pagina restano dentro un tetto fisso.
 */

/** La stringa ripulita, oppure undefined se il parametro manca o non è una stringa. */
const str = (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

/** Mese "YYYY-MM": unico formato accettato dove il valore finisce in una regex. */
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const month = (value) => (typeof value === "string" && MONTH.test(value) ? value : undefined);

/**
 * page/limit/skip da req.query. limit è sempre tra 1 e maxLimit: senza tetto,
 * ?limit=1000000000 farebbe caricare e serializzare un'intera collezione.
 */
function pagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page  = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return {
    page, limit, skip: (page - 1) * limit,
    meta: (total) => ({ page, limit, total, pages: Math.ceil(total / limit) }),
  };
}

module.exports = { str, month, MONTH, pagination };
