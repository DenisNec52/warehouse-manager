/**
 * utils/standardTimeImporter.js
 *
 * Import dei tempi standard da un file Excel (.xlsx), per esempio il foglio di saldatura
 * del reparto: ogni riga ha Tipologia, Dimensione e "Temp standard (a pezzo)".
 *
 * Il file può contenere più fogli e più righe con la stessa tipologia+dimensione
 * (stessa custodia su commesse diverse): le righe vengono raggruppate per
 * tipologia+dimensione. Se lo stesso gruppo compare con tempi diversi è un conflitto
 * e non viene importato finché il foglio non viene corretto.
 *
 * Le colonne vengono cercate per intestazione, non per posizione:
 *   - Tipologia            (obbligatoria)  "Tipologia", "Tipologia custodia"
 *   - Tempo standard       (obbligatoria)  "Temp standard (a pezzo)", "Tempo STD", "Minuti"
 *   - Dimensione           (facoltativa)   "Dimensione"
 *   - Nome breve           (facoltativa)   "Nome breve", "Label", "Sigla"
 * Le altre colonne (commessa, cliente, DN, firme...) vengono ignorate.
 */
const ExcelJS = require("exceljs");
const StandardTime = require("../models/StandardTime");

const MAX_MINUTI = 24 * 60;
const HEADER_SCAN_ROWS = 30;
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);   // giorno 0 del sistema date di Excel

class ImportError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

/** Testo normalizzato per confronti: minuscolo, senza accenti, spazi singoli. */
const norm = (s) => String(s ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

/** Testo "pulito" da salvare: spazi singoli, "/" o "-" da soli = vuoto. */
const clean = (s) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return /^[-/–—]*$/.test(t) ? "" : t;
};

/** Chiave di raggruppamento tipologia+dimensione, indipendente da maiuscole e spazi. */
const keyOf = (tipologia, dimensione) => `${norm(tipologia)}|${norm(dimensione)}`;

/** "PICCOLA" -> "Piccola", "media (dn200)" -> "Media (dn200)". */
const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

/** Valore "grezzo" di una cella exceljs: risolve formule, rich text e link. */
function rawValue(cell) {
  const v = cell?.value;
  if (v == null) return null;
  if (v instanceof Date || typeof v !== "object") return v;
  if ("result" in v) return v.result ?? null;              // formula / shared formula
  if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join("");
  if ("text" in v) return v.text;                          // hyperlink
  return null;                                             // errori (#N/D ecc.)
}

const cellText = (cell) => {
  const v = rawValue(cell);
  if (v instanceof Date) return "";
  return v == null ? "" : String(v);
};

/**
 * Stringa durata -> minuti, stesse regole del campo h:mm della pagina (lib/duration.js):
 * "1:30" / "1.30" / "1h30" -> 90, "1,5" -> 90, "45'" / "45 min" -> 45,
 * numero intero senza unità -> ore se <= 24, altrimenti minuti.
 */
function parseDurationText(input, { minutesColumn = false } = {}) {
  const s = norm(input).replace(/\s/g, "");
  if (!s) return null;
  const hm = s.match(/^(\d{1,3})[:.h](\d{1,2})(m|min)?$/);
  if (hm) return Number(hm[2]) < 60 ? Number(hm[1]) * 60 + Number(hm[2]) : null;
  const hOnly = s.match(/^(\d{1,2})(h|ore|ora)$/);
  if (hOnly) return Number(hOnly[1]) * 60;
  const mins = s.match(/^(\d{1,4})('|m|min|minuti)$/);
  if (mins) return Number(mins[1]);
  const decimal = s.match(/^(\d{1,3}),(\d{1,2})$/);
  if (decimal) return Math.round(Number(`${decimal[1]}.${decimal[2]}`) * 60);
  if (/^\d{1,5}$/.test(s)) return parseDurationNumber(Number(s), { minutesColumn });
  return null;
}

function parseDurationNumber(n, { minutesColumn = false, timeFormat = false } = {}) {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (timeFormat || n < 1) return Math.round(n * 24 * 60);   // frazione di giorno (formato h:mm)
  if (minutesColumn) return Math.round(n);
  return n <= 24 ? Math.round(n * 60) : Math.round(n);       // come parseDuration della pagina
}

/** Cella del tempo standard -> minuti interi, oppure null se non leggibile. */
function cellMinutes(cell, { minutesColumn = false } = {}) {
  const v = rawValue(cell);
  if (v == null || v === "") return null;
  // Celle in formato ora (h:mm): exceljs le restituisce come Date a partire dal 30/12/1899.
  if (v instanceof Date) {
    const m = Math.round((v.getTime() - EXCEL_EPOCH_MS) / 60000);
    return m > 0 ? m : null;
  }
  if (typeof v === "number") {
    const timeFormat = /h|\[m/i.test(cell.numFmt || "");
    return parseDurationNumber(v, { minutesColumn, timeFormat });
  }
  return parseDurationText(v, { minutesColumn });
}

/** Individua la riga di intestazione e le colonne utili di un foglio, o null. */
function findHeader(ws) {
  const last = Math.min(ws.rowCount, HEADER_SCAN_ROWS);
  for (let r = 1; r <= last; r++) {
    const cols = {};
    ws.getRow(r).eachCell((cell, c) => {
      const h = norm(cellText(cell));
      if (!h) return;
      if (!cols.tipologia && h.startsWith("tipolog")) cols.tipologia = c;
      else if (!cols.dimensione && h.startsWith("dimension")) cols.dimensione = c;
      else if (!cols.label && /^(nome breve|label|sigla)/.test(h)) cols.label = c;
      else if (!cols.tempo && /^(temp|minut|std)/.test(h)) {
        cols.tempo = c;
        cols.minutesColumn = h.startsWith("minut");
      }
    });
    if (cols.tipologia && cols.tempo) return { row: r, ...cols };
  }
  return null;
}

/**
 * Legge il file e restituisce i tempi raggruppati, i conflitti e le righe scartate.
 * Non tocca il database.
 */
async function parseStandardTimesWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new ImportError("File non leggibile: carica un file Excel .xlsx (non .xls).");
  }

  const groups = new Map();   // key -> { tipologia, dimensione, label, byMinutes: Map<minuti, righe[]> }
  const errors = [];
  let sheetsRead = 0;

  for (const ws of wb.worksheets) {
    const header = findHeader(ws);
    if (!header) continue;
    sheetsRead++;
    const headerTipologia = norm(cellText(ws.getRow(header.row).getCell(header.tipologia)));

    for (let r = header.row + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const tipologia  = clean(cellText(row.getCell(header.tipologia)));
      const dimensione = header.dimensione ? clean(cellText(row.getCell(header.dimensione))) : "";
      const label      = header.label ? clean(cellText(row.getCell(header.label))) : "";
      const tempoCell  = row.getCell(header.tempo);
      const hasTempo   = rawValue(tempoCell) != null && String(rawValue(tempoCell)).trim() !== "";
      const where      = { foglio: ws.name, riga: r };

      if (!tipologia && !hasTempo) continue;                         // riga vuota o di sola firma
      if (norm(tipologia) === headerTipologia) continue;             // intestazione ripetuta
      if (!tipologia) { errors.push({ ...where, message: "Tempo senza tipologia" }); continue; }
      if (!hasTempo)  { errors.push({ ...where, message: `"${tipologia}": tempo standard mancante` }); continue; }

      const minuti = cellMinutes(tempoCell, header);
      if (!minuti || minuti > MAX_MINUTI) {
        errors.push({ ...where, message: `"${tipologia}": tempo non valido (${cellText(tempoCell) || "?"})` });
        continue;
      }

      const key = keyOf(tipologia, dimensione);
      if (!groups.has(key)) groups.set(key, { tipologia, dimensione, label: "", byMinutes: new Map() });
      const g = groups.get(key);
      if (label && !g.label) g.label = label;
      if (!g.byMinutes.has(minuti)) g.byMinutes.set(minuti, []);
      g.byMinutes.get(minuti).push(where);
    }
  }

  if (!sheetsRead) {
    throw new ImportError('Nel file non trovo le colonne "Tipologia" e "Temp standard": controlla le intestazioni.');
  }

  const items = [];
  const conflicts = [];
  for (const g of groups.values()) {
    if (g.byMinutes.size > 1) {
      conflicts.push({
        tipologia: g.tipologia,
        dimensione: g.dimensione,
        valori: [...g.byMinutes].map(([minuti, righe]) => ({ minuti, righe })),
      });
      continue;
    }
    const [[minuti, righe]] = [...g.byMinutes];
    items.push({ tipologia: g.tipologia, dimensione: g.dimensione, label: g.label, minuti, righe: righe.length });
  }
  items.sort((a, b) => a.tipologia.localeCompare(b.tipologia, "it") || a.minuti - b.minuti);

  return { items, conflicts, errors, sheetsRead };
}

/**
 * Confronta i tempi letti con quelli del reparto. Le corrispondenze ignorano maiuscole
 * e spazi ("PICCOLA" = "Piccola") e includono i tempi rimossi, che vengono riattivati.
 */
async function planStandardTimesImport(items, departmentId) {
  const existing = await StandardTime.find({ department: departmentId }).lean();
  const byKey = new Map(existing.map(t => [keyOf(t.tipologia, t.dimensione), t]));

  return items.map((item) => {
    const current = byKey.get(keyOf(item.tipologia, item.dimensione));
    if (!current) {
      const label = item.label || [item.tipologia, capitalize(item.dimensione)].filter(Boolean).join(" ");
      return { ...item, label, action: "create" };
    }
    // Su una voce esistente il nome breve cambia solo se il file ne ha una colonna.
    const label = item.label || current.label;
    const unchanged = current.isActive && current.minuti === item.minuti && current.label === label;
    return {
      ...item,
      // si tiene la scrittura già salvata, così l'indice univoco non vede un "nuovo" valore
      tipologia: current.tipologia,
      dimensione: current.dimensione,
      label,
      id: current._id,
      minutiPrecedenti: current.minuti,
      riattivato: !current.isActive,
      action: unchanged ? "unchanged" : "update",
    };
  });
}

/** Applica il piano: crea i nuovi, aggiorna (e riattiva) gli esistenti. */
async function applyStandardTimesImport(plan, departmentId, userId) {
  const result = { creati: 0, aggiornati: 0, invariati: 0, errori: [] };
  for (const p of plan) {
    if (p.action === "unchanged") { result.invariati++; continue; }
    try {
      if (p.action === "create") {
        await StandardTime.create({
          department: departmentId, tipologia: p.tipologia, dimensione: p.dimensione,
          label: p.label, minuti: p.minuti, updatedBy: userId,
        });
        result.creati++;
      } else {
        await StandardTime.updateOne(
          { _id: p.id },
          { minuti: p.minuti, label: p.label, isActive: true, updatedBy: userId },
          { runValidators: true },
        );
        result.aggiornati++;
      }
    } catch (err) {
      result.errori.push({
        tipologia: p.tipologia, dimensione: p.dimensione,
        message: err.code === 11000 ? "esiste già nel reparto" : "salvataggio non riuscito",
      });
    }
  }
  return result;
}

module.exports = {
  ImportError,
  parseStandardTimesWorkbook,
  planStandardTimesImport,
  applyStandardTimesImport,
  // esportate per i test unitari
  cellMinutes,
  parseDurationText,
};
