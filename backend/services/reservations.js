/**
 * services/reservations.js — disponibilità per codice e ciclo di vita delle
 * prenotazioni (vedi models/Reservation.js).
 *
 *   fisico      = somma delle quantità dei prodotti ATTIVI con quel codice
 *   prenotato   = somma delle righe delle prenotazioni attive e non scadute
 *   disponibile = fisico − prenotato (mai sotto zero nella risposta; se il fisico
 *                 è sceso sotto il prenotato, es. per un'uscita fatta dalla UI,
 *                 "overcommitted" lo segnala)
 */
const Product         = require("../models/Product");
const Reservation     = require("../models/Reservation");
const ReservationLock = require("../models/ReservationLock");
const { recordMovement, StockError } = require("./stock");

const normCode = (c) => String(c || "").trim().toUpperCase();

/** Somma le righe con lo stesso codice: [{code, quantity}] senza duplicati. */
function mergeItems(items) {
  const map = new Map();
  for (const it of items) {
    const code = normCode(it.code);
    map.set(code, (map.get(code) || 0) + it.quantity);
  }
  return [...map].map(([code, quantity]) => ({ code, quantity }));
}

/** Blocca i codici per la durata della transazione (vedi models/ReservationLock.js). */
async function lockCodes(codes, session) {
  for (const code of [...new Set(codes)].sort()) {
    await ReservationLock.updateOne({ code }, { $inc: { v: 1 } }, { upsert: true, session });
  }
}

/**
 * Disponibilità per codice.
 * @returns {Map<string, {code, unit, quantity, reserved, available, overcommitted, products}>}
 */
async function availability(codes, { session = null, excludeReservation = null } = {}) {
  const list = [...new Set(codes.map(normCode))];
  const products = await Product.find({ code: { $in: list }, isActive: true })
    .sort({ arrivalDate: 1, createdAt: 1 })
    .session(session)
    .lean();

  const holding = Reservation.holdingFilter();
  const resFilter = { ...holding, "items.code": { $in: list } };
  if (excludeReservation) resFilter._id = { $ne: excludeReservation };
  const reservations = await Reservation.find(resFilter).session(session).lean();

  const out = new Map(list.map((code) => [code, { code, unit: null, quantity: 0, reserved: 0, available: 0, overcommitted: false, products: [] }]));
  for (const p of products) {
    const a = out.get(p.code);
    a.quantity += p.quantity;
    a.unit = a.unit || p.unit;
    a.products.push({ id: String(p._id), quantity: p.quantity, floor: p.floor ?? null, pallet: p.pallet ?? null, arrivalDate: p.arrivalDate || null });
  }
  for (const r of reservations) {
    for (const it of r.items) if (out.has(it.code)) out.get(it.code).reserved += it.quantity;
  }
  for (const a of out.values()) {
    a.available = Math.max(0, a.quantity - a.reserved);
    a.overcommitted = a.reserved > a.quantity;
  }
  return out;
}

/** Righe che non si possono coprire: [{code, requested, available}]. */
function shortages(items, avail) {
  return items
    .map((it) => ({ code: it.code, requested: it.quantity, available: avail.get(it.code)?.available ?? 0, exists: (avail.get(it.code)?.products.length ?? 0) > 0 }))
    .filter((x) => x.requested > x.available);
}

/**
 * Crea una prenotazione se TUTTE le righe sono disponibili (tutto o niente).
 * Da chiamare dentro inTransaction().
 */
async function createReservation({ externalRef, items, note, expiresAt, apiKey, actorName }, session) {
  const merged = mergeItems(items);
  await lockCodes(merged.map((i) => i.code), session);
  const avail = await availability(merged.map((i) => i.code), { session });

  const missing = shortages(merged, avail);
  if (missing.length) {
    return { abort: true, status: 409, code: "insufficient_stock", message: "Disponibilità insufficiente per una o più righe.", details: missing };
  }
  const [reservation] = await Reservation.create([{
    externalRef, note, items: merged, expiresAt: expiresAt || null, apiKey, createdByName: actorName,
  }], { session });
  return { reservation };
}

async function releaseReservation(id, session) {
  const r = await Reservation.findById(id).session(session);
  if (!r) return { abort: true, status: 404, code: "not_found", message: "Prenotazione non trovata." };
  if (r.status !== "active")
    return { abort: true, status: 409, code: "invalid_state", message: `Prenotazione non attiva (stato: ${r.effectiveStatus()}).` };
  await lockCodes(r.items.map((i) => i.code), session);
  r.status = "released";
  r.releasedAt = new Date();
  await r.save({ session });
  return { reservation: r };
}

/**
 * Trasforma la prenotazione in uscite di magazzino: per ogni codice scarica i
 * prodotti in ordine di arrivo (FIFO), creando un movimento per pedana.
 */
async function consumeReservation(id, { actor, apiKey }, session) {
  const r = await Reservation.findById(id).session(session);
  if (!r) return { abort: true, status: 404, code: "not_found", message: "Prenotazione non trovata." };
  if (r.effectiveStatus() !== "active")
    return { abort: true, status: 409, code: "invalid_state", message: `Prenotazione non consumabile (stato: ${r.effectiveStatus()}).` };

  await lockCodes(r.items.map((i) => i.code), session);
  const results = [];
  for (const item of r.items) {
    const products = await Product.find({ code: item.code, isActive: true, quantity: { $gt: 0 } })
      .sort({ arrivalDate: 1, createdAt: 1 })
      .session(session);
    const physical = products.reduce((s, p) => s + p.quantity, 0);
    if (physical < item.quantity) {
      return { abort: true, status: 409, code: "insufficient_stock", message: `Giacenza fisica insufficiente per ${item.code}.`, details: [{ code: item.code, requested: item.quantity, available: physical }] };
    }
    let left = item.quantity;
    for (const product of products) {
      if (left === 0) break;
      const take = Math.min(left, product.quantity);
      const res = await recordMovement({
        product, type: "OUT", quantity: take, actor,
        extra: {
          reason: "Prenotazione consumata", reference: r.externalRef, externalRef: r.externalRef,
          source: "api", apiKey, reservation: r._id,
        },
      }, session);
      results.push(res);
      left -= take;
    }
  }
  r.status = "consumed";
  r.consumedAt = new Date();
  r.consumedMovements = results.map((x) => x.movement._id);
  await r.save({ session });
  return { reservation: r, results };
}

module.exports = { availability, createReservation, releaseReservation, consumeReservation, mergeItems, normCode, StockError };
