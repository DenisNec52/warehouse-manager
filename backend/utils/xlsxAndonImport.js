/**
 * utils/xlsxAndonImport.js
 *
 * Legge (in SOLA LETTURA) un foglio di lavorazione saldatura .xlsx — già
 * validato da middleware/secureUpload — ed estrae TUTTE le colonne utili per
 * creare righe dell'Andon Board:
 *   Comm. | Pos. | Cliente | Q.tà | Tipologia | DN | Ø Elem. (mm) | Dimensione | Temp standard
 *
 * Robustezza: intestazioni riconosciute per nome (ordine colonne libero, header
 * non per forza in riga 1), righe vuote intermedie saltate, tempo letto sia come
 * orario Excel (es. 1:00 → 60 min) sia come numero/stringa. Tetti anti abuso e
 * rifiuto delle celle con formula-injection. Non esegue nulla, non tocca il disco.
 */
const { Readable } = require("stream");
const ExcelJS = require("exceljs");

const LIMITS = { maxRows: 2000, textMax: 200, parseTimeoutMs: 8000 };
const FORMULA_LEAD = /^[=+\-@\t\r]/;

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Associa un'intestazione (normalizzata) a un campo, per token robusti. */
function headerField(h) {
  if (!h) return null;
  if (h.includes("comm")) return "commessa";
  if (h.startsWith("pos")) return "posizione";
  if (h.includes("client")) return "cliente";
  if (h.includes("q.tà") || h.includes("qtà") || h.includes("qta") || h.includes("quant") || /^q\.?t/.test(h)) return "quantita";
  if (h.includes("tipolog") || h === "tipo") return "tipologia";
  if (h === "dn") return "dn";
  if (h.includes("elem") || h.includes("ø") || h.includes("diam")) return "diametro";
  if (h.includes("dimens")) return "dimensione";
  if (h.includes("temp") && (h.includes("stand") || h.includes("std"))) return "tempoStd";
  return null;
}

function cellText(cell) {
  const v = cell?.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join("");
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v instanceof Date) return v.toISOString();
    return "";
  }
  return String(v);
}

/** Minuti da una cella "tempo": orario Excel (Date/frazione di giorno), "h:mm" o numero. */
function parseMinutes(cell) {
  const v = cell?.value;
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.getUTCHours() * 60 + v.getUTCMinutes();
  if (typeof v === "number") return v > 0 && v < 1 ? Math.round(v * 24 * 60) : Math.round(v);
  const s = String(v).trim();
  if (/^\d{1,3}:\d{1,2}$/.test(s)) { const [h, m] = s.split(":").map(Number); return h * 60 + m; }
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const d = new Date(s);                                  // ISO da rich/formula
  return Number.isNaN(d.getTime()) ? NaN : d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Trova la riga intestazione (entro le prime 8) e la mappa colonna→campo. */
function detectColumns(ws) {
  const maxScan = Math.min(8, ws.rowCount || 8);
  for (let r = 1; r <= maxScan; r++) {
    const row = ws.getRow(r);
    const map = {};
    for (let c = 1; c <= (ws.columnCount || 30); c++) {
      const f = headerField(norm(cellText(row.getCell(c))));
      if (f && map[f] == null) map[f] = c;
    }
    if (map.commessa != null && map.tempoStd != null) return { headerRow: r, map };
  }
  return null;
}

function clean(raw) {
  // eslint-disable-next-line no-control-regex
  let s = String(raw ?? "").replace(/[\u0000-\u001f]+/g, " ").trim();
  if (s.length > LIMITS.textMax) s = s.slice(0, LIMITS.textMax);
  return s;
}
// "/" o "-" nel foglio significano "nessun valore"
const cleanOpt = (raw) => { const s = clean(raw); return (s === "/" || s === "-") ? "" : s; };

async function parseAndonXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  let timer;
  try {
    await Promise.race([
      workbook.xlsx.read(Readable.from(buffer)),
      new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error("Lettura del file troppo lunga: file non valido o troppo complesso."), { status: 400 })), LIMITS.parseTimeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }

  const ws = workbook.worksheets[0];
  if (!ws) return { rows: [], errors: [{ row: 0, message: "Il file non contiene alcun foglio." }], truncated: false };

  const detected = detectColumns(ws);
  if (!detected)
    return { rows: [], errors: [{ row: 0, message: "Intestazioni non trovate. Servono almeno 'Comm.' e 'Temp standard'." }], truncated: false };

  const { headerRow, map } = detected;
  const col = (name, r) => (map[name] != null ? r.getCell(map[name]) : null);
  const rows = [], errors = [];
  let processed = 0, truncated = false;
  const lastRow = ws.rowCount || 0;

  for (let r = headerRow + 1; r <= lastRow; r++) {
    if (processed >= LIMITS.maxRows) { truncated = true; break; }
    const row = ws.getRow(r);

    const commessa   = clean(cellText(col("commessa", row)));
    const posizione  = cleanOpt(cellText(col("posizione", row)));
    const cliente    = clean(cellText(col("cliente", row)));
    const tipologia  = clean(cellText(col("tipologia", row)));
    const dn         = cleanOpt(cellText(col("dn", row)));
    const diametro   = cleanOpt(cellText(col("diametro", row)));
    const dimensione = clean(cellText(col("dimensione", row)));
    const qRaw       = clean(cellText(col("quantita", row)));
    const tempoStdMinuti = map.tempoStd != null ? parseMinutes(row.getCell(map.tempoStd)) : null;

    // Riga del tutto vuota → salta senza errore
    if (!commessa && !cliente && !tipologia && !dimensione && !qRaw && (tempoStdMinuti == null || Number.isNaN(tempoStdMinuti))) continue;
    processed++;

    const err = (message) => errors.push({ row: r, message, data: { commessa, cliente, tipologia } });

    if (!commessa) { err("Commessa mancante."); continue; }
    if ([commessa, posizione, cliente, tipologia, dn, diametro, dimensione].some(v => FORMULA_LEAD.test(v))) {
      err("Cella con carattere non ammesso all'inizio (= + - @). Riga ignorata per sicurezza."); continue;
    }
    let quantita = parseInt(qRaw, 10);
    if (!Number.isInteger(quantita) || quantita < 1) quantita = 1;         // default prudente
    if (quantita > 100000) { err("Quantità fuori range."); continue; }
    if (tempoStdMinuti == null || Number.isNaN(tempoStdMinuti) || tempoStdMinuti < 1 || tempoStdMinuti > 24 * 60) {
      err("Temp standard mancante o non valido."); continue;
    }

    const custodiaLabel = [tipologia, dimensione].filter(Boolean).join(" ").trim() || tipologia || "Custodia";
    rows.push({ commessa, posizione, cliente, quantita, tipologia, dn, diametro, dimensione, custodiaLabel, tempoStdMinuti });
  }

  return { rows, errors, truncated };
}

module.exports = { parseAndonXlsx, LIMITS };
