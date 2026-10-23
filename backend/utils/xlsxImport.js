/**
 * utils/xlsxImport.js
 *
 * Legge (in SOLA LETTURA) un buffer .xlsx già validato da middleware/secureUpload
 * e ne estrae le righe dei Tempi Standard. Pensato come anello sicuro della catena:
 *
 *  - tetti su fogli/righe/colonne: una tabella enorme (anche da zip-bomb) viene
 *    troncata invece di esaurire CPU/memoria;
 *  - timeout di parsing: un file costruito per bloccare il parser non appende
 *    il processo oltre qualche secondo;
 *  - mapping a WHITELIST FISSA di campi: i nomi di colonna del file non diventano
 *    mai chiavi di oggetto (niente prototype pollution tipo __proto__/constructor);
 *  - formula/CSV injection: una cella di testo che inizia con = + - @ viene
 *    RIFIUTATA (una tipologia/label legittima non inizia mai così), così il dato
 *    non può diventare una formula quando il foglio viene riesportato/aperto;
 *  - validazione per-campo severa: tipologia/label non vuoti e limitati in
 *    lunghezza, minuti interi 1..1440.
 *
 * Non esegue nulla, non tocca il disco, non apre risorse esterne.
 */
const { Readable } = require("stream");
const ExcelJS = require("exceljs");

const LIMITS = {
  maxRows: 1000,     // righe dati massime processate
  maxCols: 30,       // colonne massime lette per riga
  textMax: 200,      // lunghezza massima di una cella di testo
  parseTimeoutMs: 8000,
};

// Una cella di testo che inizia con uno di questi caratteri è un rischio di
// formula injection (Excel/Sheets la interpreterebbe come formula). Anche il
// TAB e il CR iniziali rientrano nel trucco classico.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

// Intestazioni riconosciute per ciascun campo (case/spazi-insensibile). L'ordine
// delle colonne nel file NON conta: si cerca l'intestazione per nome.
const HEADER_ALIASES = {
  tipologia:  ["tipologia", "tipo", "custodia", "tipologia custodia", "descrizione"],
  dimensione: ["dimensione", "misura", "dim", "taglia", "formato"],
  label:      ["label", "nome breve", "nome", "sigla", "codice", "abbr"],
  minuti:     ["minuti", "minuto", "tempo", "tempo std", "tempo standard", "min", "durata", "tempo (min)", "tempo min", "std"],
};

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Campo di un'intestazione: prima l'alias esatto, poi una regola per parole chiave
 * per i nomi "reali" dei fogli di reparto (es. "Temp standard (a pezzo)" del foglio
 * saldatura). Le note tra parentesi e la punteggiatura finale non contano.
 */
function headerField(h) {
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) if (aliases.includes(h)) return field;
  const k = h.replace(/\(.*?\)/g, "").replace(/[.:]+$/, "").trim();
  if (k.startsWith("tipolog")) return "tipologia";
  if (k.startsWith("dimens")) return "dimensione";
  if (/^(temp|minut|durata)/.test(k)) return "minuti";
  return null;
}

/** Testo "pulito" di una cella (gestisce rich text / hyperlink di exceljs). */
function cellText(cell) {
  const v = cell?.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (v.text != null) return String(v.text);          // hyperlink { text, hyperlink }
    if (v.result != null) return String(v.result);      // formula: usa il risultato, mai la formula
    if (v instanceof Date) return v.toISOString();
    return "";
  }
  return String(v);
}

/** minuti da cella: accetta numero (minuti), "h:mm", o un orario Excel (Date/frazione). */
function parseMinutes(cell) {
  const v = cell?.value;
  if (v == null || v === "") return null;

  // Orario Excel salvato come Date → ore*60 + minuti
  if (v instanceof Date) return v.getUTCHours() * 60 + v.getUTCMinutes();

  if (typeof v === "number") {
    // Frazione di giorno (formato "ora") < 1 → convertila; altrimenti è già in minuti
    if (v > 0 && v < 1) return Math.round(v * 24 * 60);
    return Math.round(v);
  }

  const s = String(typeof v === "object" ? cellText(cell) : v).trim();
  if (/^\d{1,3}:\d{1,2}$/.test(s)) {                    // "1:30" → 90
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  }
  if (/^\d+$/.test(s)) return parseInt(s, 10);          // "90" → 90
  return NaN;                                           // non interpretabile
}

/** Trova la riga di intestazione (entro le prime 10) e mappa colonna→campo. */
function detectColumns(worksheet) {
  const maxScan = Math.min(10, worksheet.rowCount || 10);
  for (let r = 1; r <= maxScan; r++) {
    const row = worksheet.getRow(r);
    const map = {};
    for (let c = 1; c <= Math.min(LIMITS.maxCols, row.cellCount || LIMITS.maxCols); c++) {
      const h = norm(cellText(row.getCell(c)));
      if (!h) continue;
      const field = headerField(h);
      if (field && map[field] == null) map[field] = c;
    }
    if (map.tipologia != null && map.minuti != null) return { headerRow: r, map };
  }
  return null;
}

function sanitizeField(raw) {
  // Rimuove i caratteri di controllo (0x00–0x1F) da una cella: è voluto, serve a
  // sanificare testo proveniente da file esterni, quindi la regola è disattivata qui.
  // eslint-disable-next-line no-control-regex
  let s = String(raw ?? "").replace(/[\u0000-\u001f]+/g, " ").trim();
  if (s.length > LIMITS.textMax) s = s.slice(0, LIMITS.textMax);
  return s;
}

/**
 * Parsa il buffer e restituisce { rows, errors, truncated }.
 * `rows` sono righe VALIDE e sanificate, pronte per la validazione finale/salvataggio.
 * `errors` elenca le righe scartate con il motivo (per l'anteprima all'utente).
 */
async function parseStandardTimesXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();

  // Timeout: nessun file deve poter bloccare il parser all'infinito. Il timer
  // viene SEMPRE cancellato (anche se la lettura finisce prima) per non lasciare
  // handle appesi che tengono vivo l'event loop.
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(Object.assign(new Error("Lettura del file troppo lunga: file non valido o troppo complesso."), { status: 400 })), LIMITS.parseTimeoutMs);
  });
  try {
    await Promise.race([workbook.xlsx.read(Readable.from(buffer)), timeout]);
  } finally {
    clearTimeout(timer);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { rows: [], errors: [{ row: 0, message: "Il file non contiene alcun foglio." }], truncated: false };

  const detected = detectColumns(worksheet);
  if (!detected)
    return { rows: [], errors: [{ row: 0, message: "Intestazioni non trovate. Servono almeno le colonne 'Tipologia' e 'Minuti' (o 'Tempo' / 'Temp standard')." }], truncated: false };

  const { headerRow, map } = detected;
  const rows = [];
  const errors = [];
  let processed = 0;
  let truncated = false;

  const lastRow = worksheet.rowCount || 0;
  for (let r = headerRow + 1; r <= lastRow; r++) {
    if (processed >= LIMITS.maxRows) { truncated = true; break; }
    const row = worksheet.getRow(r);

    const tipologia  = sanitizeField(cellText(row.getCell(map.tipologia)));
    const dimensione = map.dimensione != null ? sanitizeField(cellText(row.getCell(map.dimensione))) : "";
    const label      = map.label != null ? sanitizeField(cellText(row.getCell(map.label))) : "";
    const minuti     = parseMinutes(row.getCell(map.minuti));

    // Riga del tutto vuota → salta senza errore
    if (!tipologia && !dimensione && !label && (minuti == null || Number.isNaN(minuti))) continue;
    processed++;

    const rowErr = (message) => errors.push({ row: r, message, data: { tipologia, dimensione, label } });

    if (!tipologia) { rowErr("Tipologia mancante."); continue; }
    // Formula/CSV injection: rifiuta celle di testo che iniziano con = + - @ (o TAB/CR)
    if (FORMULA_LEAD.test(tipologia) || FORMULA_LEAD.test(dimensione) || FORMULA_LEAD.test(label)) {
      rowErr("Contiene caratteri non ammessi all'inizio di una cella (= + - @). Riga ignorata per sicurezza.");
      continue;
    }
    if (minuti == null || Number.isNaN(minuti)) { rowErr("Tempo (minuti) mancante o non numerico."); continue; }
    if (!Number.isInteger(minuti) || minuti < 1 || minuti > 24 * 60) { rowErr(`Tempo fuori intervallo (1–1440 min): ${minuti}.`); continue; }

    rows.push({
      tipologia,
      dimensione,
      // Se manca il nome breve nel file, si usa la tipologia come fallback leggibile.
      label: label || tipologia.slice(0, 40),
      minuti,
    });
  }

  return { rows, errors, truncated };
}

module.exports = { parseStandardTimesXlsx, LIMITS };
