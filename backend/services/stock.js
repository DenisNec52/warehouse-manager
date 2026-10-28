/**
 * services/stock.js
 *
 * Unico punto in cui la giacenza di un prodotto cambia: ogni variazione
 * crea un movimento (registro immutabile con quantità prima/dopo), dentro la
 * stessa transazione dell'aggiornamento della quantità. Lo usano:
 *  - POST /api/movements (UI)
 *  - PUT /api/products/:id quando un responsabile rettifica la quantità
 *  - l'API di integrazione (/api/v1), anche per consumare le prenotazioni
 *
 * Gli effetti "dopo il commit" (notifiche, email, webhook) sono separati in
 * afterMovement(), da chiamare solo a transazione confermata.
 */
const Movement     = require("../models/Movement");
const Product      = require("../models/Product");
const Category     = require("../models/Category");
const Notification = require("../models/Notification");
const email        = require("../utils/email");
const events       = require("./events");

class StockError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra  = extra;
  }
}

/**
 * Registra un movimento e aggiorna la giacenza. Da chiamare dentro una transazione.
 * @param {object} p
 * @param {object} p.product   documento Product già letto CON la stessa session
 * @param {"IN"|"OUT"} p.type
 * @param {number} p.quantity  intero >= 1
 * @param {{_id, name}} p.actor  utente a cui attribuire il movimento
 * @param {object} [p.extra]   reason, note, reference, source, apiKey, externalRef, reservation
 * @param {ClientSession} session
 */
async function recordMovement({ product, type, quantity, actor, extra = {} }, session) {
  if (!product || !product.isActive) throw new StockError(404, "Prodotto non trovato.");
  if (!["IN", "OUT"].includes(type)) throw new StockError(400, "Tipo deve essere IN o OUT.");
  if (!Number.isInteger(quantity) || quantity < 1) throw new StockError(400, "Quantità deve essere almeno 1.");

  if (type === "OUT" && product.quantity < quantity) {
    throw new StockError(400, `Scorte insufficienti. Disponibili: ${product.quantity} ${product.unit}.`, { available: product.quantity });
  }

  const qBefore = product.quantity;
  const qAfter  = type === "IN" ? qBefore + quantity : qBefore - quantity;

  const catName = product.category
    ? (await Category.findById(product.category).session(session).lean())?.name || ""
    : "";

  // updateOne: niente validazione completa del prodotto (gli articoli importati
  // dall'inventario legacy possono avere campi incompleti).
  await Product.updateOne({ _id: product._id }, { quantity: qAfter, updatedBy: actor._id }, { session });

  const [movement] = await Movement.create([{
    product: product._id,
    productSnapshot: { name: product.name, code: product.code, unit: product.unit, category: catName },
    type,
    quantity,
    quantityBefore: qBefore,
    quantityAfter:  qAfter,
    reason:      extra.reason || "",
    note:        extra.note || "",
    reference:   extra.reference || "",
    source:      extra.source || "ui",
    apiKey:      extra.apiKey || null,
    externalRef: extra.externalRef || "",
    reservation: extra.reservation || null,
    performedBy:     actor._id,
    performedByName: actor.name,
  }], { session });

  product.quantity = qAfter;   // il chiamante può continuare a usare il documento aggiornato
  return { movement, product, qBefore, qAfter };
}

/**
 * Effetti a transazione confermata: notifica scorta bassa (+ email), notifica
 * ai responsabili, evento per i webhook. Non lancia mai: un errore qui non deve
 * far sembrare fallito un movimento già salvato.
 */
async function afterMovement({ movement, product, qBefore, qAfter }, { actorName } = {}) {
  try {
    const wasOk = qBefore > product.minQuantity;
    const isNow = qAfter <= product.minQuantity;
    if (movement.type === "OUT" && wasOk && isNow) {
      await Notification.create({
        type:    "low_stock",
        title:   `Scorta bassa — ${product.name}`,
        message: `Dopo l'uscita di ${movement.quantity} pz, la quantità è ${qAfter} ${product.unit} (soglia: ${product.minQuantity}).`,
        link:    `/products/${product._id}`,
      });
      email.sendLowStockAlert({ ...(product.toObject ? product.toObject() : product), quantity: qAfter }).catch(() => {});
      events.emit("stock.low", {
        productId: String(product._id), code: product.code, name: product.name,
        quantity: qAfter, minQuantity: product.minQuantity, unit: product.unit,
      });
    }

    const verb = movement.type === "IN" ? "aggiunti" : "rimossi";
    await Notification.create({
      type:     "movement",
      audience: "managers",
      title:    `${movement.type === "IN" ? "Entrata" : "Uscita"} — ${product.name}`,
      message:  `${movement.quantity} ${product.unit} ${verb} da ${actorName || movement.performedByName}.`,
      link:     "/movements",
      meta:     { movementId: movement._id },
    });

    events.emit("movement.created", serializeMovement(movement));
  } catch (err) {
    console.error("[stock/afterMovement]", err.message);
  }
}

/** Forma pubblica di un movimento per l'API e i webhook (niente dati interni degli utenti). */
function serializeMovement(m) {
  return {
    id:             String(m._id),
    productId:      String(m.product?._id || m.product),
    code:           m.productSnapshot?.code,
    name:           m.productSnapshot?.name,
    unit:           m.productSnapshot?.unit,
    type:           m.type,
    quantity:       m.quantity,
    quantityBefore: m.quantityBefore,
    quantityAfter:  m.quantityAfter,
    reason:         m.reason || "",
    reference:      m.reference || "",
    externalRef:    m.externalRef || "",
    source:         m.source || "ui",
    reservationId:  m.reservation ? String(m.reservation) : null,
    corrected:      Boolean(m.correctedAt),
    createdAt:      m.createdAt,
    updatedAt:      m.updatedAt,
  };
}

module.exports = { recordMovement, afterMovement, serializeMovement, StockError };
