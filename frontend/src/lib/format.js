/**
 * lib/format.js — helper di formattazione condivisi tra le pagine
 */

export function scoreColor(score) {
  return score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
}

export function scoreColorSoft(score) {
  return score >= 80
    ? { bg: "#dcfce7", text: "#16a34a" }
    : score >= 50
    ? { bg: "#fef9c3", text: "#ca8a04" }
    : { bg: "#fee2e2", text: "#dc2626" };
}

export function fmtTime(date) {
  return new Date(date).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(date) {
  return new Date(date).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Estrae nome/codice/unità da un movimento, con fallback sullo snapshot
// (il prodotto potrebbe essere stato eliminato dopo la registrazione).
export function movementInfo(m) {
  return {
    name:      m.product?.name || m.productSnapshot?.name,
    code:      m.product?.code || m.productSnapshot?.code,
    unit:      m.product?.unit || m.productSnapshot?.unit,
    performer: m.performedBy?.name || m.performedByName,
  };
}
