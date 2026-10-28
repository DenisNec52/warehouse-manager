/**
 * services/serializers.js — forma pubblica dei dati verso l'API di integrazione
 * e i webhook. Un contratto stabile e separato dagli schemi Mongoose: si possono
 * rinominare campi interni senza rompere i sistemi esterni collegati.
 */
const id = (v) => (v ? String(v._id || v) : null);

function serializeProduct(p, { reserved = 0 } = {}) {
  const quantity = p.quantity ?? 0;
  return {
    id:          id(p),
    code:        p.code,
    commessa:    p.commessa || null,
    posizione:   p.posizione ?? null,
    name:        p.name,
    description: p.description || "",
    unit:        p.unit || "pz",
    quantity,
    reserved,
    available:   Math.max(0, quantity - reserved),
    minQuantity: p.minQuantity ?? 0,
    isLowStock:  quantity <= (p.minQuantity ?? 0),
    unitPrice:   p.unitPrice ?? 0,
    supplier:    p.supplier || "",
    category:    p.category && p.category.name ? { id: id(p.category), name: p.category.name } : (p.category ? { id: id(p.category) } : null),
    location:    { floor: p.floor ?? null, pallet: p.pallet ?? null, shelf: p.location || "" },
    arrivalDate: p.arrivalDate || null,
    active:      p.isActive !== false,
    createdAt:   p.createdAt,
    updatedAt:   p.updatedAt,
  };
}

function serializeReservation(r) {
  return {
    id:          id(r),
    externalRef: r.externalRef,
    status:      r.effectiveStatus ? r.effectiveStatus() : r.status,
    note:        r.note || "",
    expiresAt:   r.expiresAt || null,
    items: (r.items || []).map((it) => ({ code: it.code, quantity: it.quantity })),
    consumedMovements: (r.consumedMovements || []).map(id),
    createdAt:   r.createdAt,
    updatedAt:   r.updatedAt,
  };
}

module.exports = { serializeProduct, serializeReservation };
