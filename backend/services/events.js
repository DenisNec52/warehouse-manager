/**
 * services/events.js — bus di eventi interno.
 *
 * Le route emettono eventi di dominio ("movement.created", "stock.low",
 * "reservation.created", ...); chi è interessato si iscrive. Oggi l'unico
 * iscritto è il dispatcher dei webhook (services/webhooks.js), ma lo stesso
 * bus può alimentare in futuro code, log o sincronizzazioni senza toccare le route.
 *
 * emit() non lancia mai e non aspetta gli iscritti: un webhook lento o rotto
 * non deve rallentare né far fallire l'operazione che ha generato l'evento.
 */
const { EventEmitter } = require("events");

const bus = new EventEmitter();
bus.setMaxListeners(20);

const EVENT_TYPES = [
  "movement.created",
  "stock.low",
  "product.created",
  "product.updated",
  "reservation.created",
  "reservation.released",
  "reservation.consumed",
];

function emit(type, data) {
  if (!EVENT_TYPES.includes(type)) {
    console.error(`[events] tipo evento sconosciuto: ${type}`);
    return;
  }
  setImmediate(() => {
    try { bus.emit("event", { type, data, occurredAt: new Date().toISOString() }); }
    catch (err) { console.error("[events]", type, err.message); }
  });
}

function subscribe(listener) {
  bus.on("event", listener);
  return () => bus.off("event", listener);
}

module.exports = { emit, subscribe, EVENT_TYPES };
