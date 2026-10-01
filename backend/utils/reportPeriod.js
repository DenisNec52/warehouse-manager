/**
 * utils/reportPeriod.js — periodi del report Andon (giorno / settimana / mese) e trend.
 *
 * Le date delle righe di produzione sono salvate a mezzanotte UTC: tutti i calcoli qui
 * lavorano in UTC su stringhe "YYYY-MM-DD", così un giorno non slitta mai per il fuso.
 */
const PERIODS = ["giorno", "settimana", "mese"];

const toIso = (d) => d.toISOString().slice(0, 10);
const fromIso = (iso) => new Date(`${iso}T00:00:00.000Z`);
const addDays = (iso, n) => { const d = fromIso(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d); };

/**
 * Intervallo del periodo che contiene `date` (tutti gli estremi inclusi):
 * giorno = quel giorno; settimana = da lunedì a domenica; mese = dal primo all'ultimo giorno.
 * `trend` è l'intervallo del grafico ad andamento: per il giorno gli ultimi 7 giorni
 * fino a quella data (un solo punto non dice niente), per settimana e mese il periodo stesso.
 */
function resolvePeriod(period, date) {
  const d = fromIso(date);
  let from, to;
  if (period === "giorno") {
    from = to = date;
  } else if (period === "settimana") {
    const monday = (d.getUTCDay() + 6) % 7;          // 0 = lunedì
    from = addDays(date, -monday);
    to   = addDays(from, 6);
  } else {
    from = toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
    to   = toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  }
  const trend = period === "giorno" ? { from: addDays(date, -6), to: date } : { from, to };
  return { period, from, to, trend };
}

/** Filtro Mongo sul campo `data` per un intervallo { from, to } incluso. */
const dateRangeFilter = ({ from, to }) => ({ data: { $gte: fromIso(from), $lt: fromIso(addDays(to, 1)) } });

/**
 * Direzione del trend: pendenza della retta di regressione sui punti (x = indice del giorno).
 * Sotto 0,5 punti percentuali al giorno il trend è considerato stabile.
 */
function trendDirection(values) {
  const pts = values.map((y, x) => [x, y]).filter(([, y]) => y != null);
  if (pts.length < 2) return { direction: "stabile", slope: 0 };
  const n = pts.length;
  const mx = pts.reduce((s, [x]) => s + x, 0) / n;
  const my = pts.reduce((s, [, y]) => s + y, 0) / n;
  const den = pts.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  const slope = den ? pts.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / den : 0;
  const direction = Math.abs(slope) < 0.5 ? "stabile" : slope > 0 ? "rialzo" : "ribasso";
  return { direction, slope: Math.round(slope * 100) / 100 };
}

/** Tutti i giorni tra from e to inclusi: il grafico mostra anche i giorni senza produzione. */
function eachDay({ from, to }) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

module.exports = { PERIODS, resolvePeriod, dateRangeFilter, trendDirection, eachDay };
