/**
 * utils/asyncErrors.js
 *
 * Express 4 non intercetta le Promise rifiutate: un errore in un handler `async`
 * senza try/catch diventa una "unhandled rejection" che spegne l'intero processo
 * Node (Node >= 15). Basta una richiesta malformata per mettere giù il server.
 *
 * Qui si estende UNA volta il punto in cui Express chiama ogni handler, così
 * qualunque Promise rifiutata finisce nell'error handler globale (app.js), che
 * risponde 500 senza dettagli in produzione. Copre tutte le rotte, anche future,
 * senza wrapper da ricordare file per file. Express 5 lo fa già da sé: questo
 * modulo andrà tolto in caso di aggiornamento.
 */
const Layer = require("express/lib/router/layer");

if (!Layer.prototype.handle_request.asyncSafe) {
  const handleRequest = function handle(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return next(); // error handler: non è un handler di richiesta
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === "function") result.catch(next);
    } catch (err) {
      next(err);
    }
  };
  handleRequest.asyncSafe = true;
  Layer.prototype.handle_request = handleRequest;
}
