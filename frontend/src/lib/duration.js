/**
 * lib/duration.js
 *
 * Il reparto ragiona in ore:minuti (come sul foglio Andon Board), il backend salva minuti interi.
 */

/** 330 -> "5:30" */
export function fmtMinutes(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return "—";
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * "5:30" | "5.30" | "5,5" | "330" -> minuti, oppure null se non valido.
 * Un numero senza separatore è inteso come ore se <= 24 (es. "5" = 5 ore), altrimenti minuti.
 */
export function parseDuration(input) {
  const s = String(input ?? "").trim();
  if (!s) return null;
  const hm = s.match(/^(\d{1,3})[:.](\d{1,2})$/);
  if (hm) {
    const minutes = Number(hm[2]);
    return minutes < 60 ? Number(hm[1]) * 60 + minutes : null;
  }
  const decimal = s.match(/^(\d{1,3}),(\d{1,2})$/);
  if (decimal) return Math.round(Number(`${decimal[1]}.${decimal[2]}`) * 60);
  if (/^\d{1,5}$/.test(s)) {
    const n = Number(s);
    return n <= 24 ? n * 60 : n;
  }
  return null;
}

/** Efficienza (atteso/impiegato) -> etichetta e classe badge. */
export function efficiencyBadge(eff) {
  if (eff == null) return { text: "—", cls: "badge-gray" };
  const text = `${Math.round(eff * 100)}%`;
  if (eff >= 1) return { text, cls: "badge-green" };
  if (eff >= 0.85) return { text, cls: "badge-yellow" };
  return { text, cls: "badge-red" };
}

/** Date -> "YYYY-MM-DD" in ora locale. */
export function toIsoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
