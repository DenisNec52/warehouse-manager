/**
 * utils/xlsxImport.js
 *
 * Legge (in SOLA LETTURA) un file di Tempi Standard già validato da
 * middleware/secureUpload — .xlsx oppure .csv — e ne estrae le righe.
 *
 * Due forme di foglio, riconosciute dalle intestazioni:
 *  - FOGLIO DI LAVORAZIONE (es. Prima Saldatura): una riga = un pezzo, con
 *    Comm., Pos., Cliente, Q.tà, Tipologia, DN, Ø Elem., Dimensione, Temp standard.
 *    Le colonne Firma si ignorano (le firme le mette chi lavora, dall'app).
 *  - TABELLA GENERICA: Tipologia (+ Dimensione, Nome breve) e Minuti, senza commessa.
 *
 * Catena sicura:
 *  - tetti su righe/colonne/lunghezza testo e timeout di parsing;
 *  - mapping a WHITELIST FISSA di campi: i nomi di colonna non diventano mai chiavi
 *    di oggetto (niente prototype pollution tipo __proto__/constructor);
 *  - formula/CSV injection: una cella di testo che inizia con = + - @ (o TAB/CR) fa
 *    SCARTARE la riga, così il dato non può diventare una formula se riesportato;
 *  - lo stesso pezzo due volte nel file con dati diversi è un CONFLITTO segnalato,
 *    mai risolto in silenzio scegliendo una delle due righe.
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

const FORMULA_LEAD = /^[=+\-@\t\r]/;

// Intestazioni esatte riconosciute (case/spazi-insensibile) per i fogli "generici".
const HEADER_ALIASES = {
  tipologia:  ["tipologia", "tipo", "custodia", "tipologia custodia", "descrizione"],
  dimensione: ["dimensione", "misura", "dim", "taglia", "formato", "grandezza"],
  label:      ["label", "nome breve", "nome", "sigla", "codice", "abbr"],
  minuti:     ["minuti", "minuto", "tempo", "tempo std", "tempo standard", "min", "durata", "tempo (min)", "tempo min", "std"],
};

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Campo di un'intestazione: prima l'alias esatto, poi parole chiave per i nomi "reali"
 * dei fogli di reparto (es. "Temp standard (a pezzo)", "Ø Elem. (mm)", "Q.tà (n°)").
 * Le note tra parentesi e la punteggiatura finale non contano. "Firma ..." → nessun campo.
 */
function headerField(h) {
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) if (aliases.includes(h)) return field;
  const k = h.replace(/\(.*?\)/g, "").replace(/[.:]+$/, "").trim();
  if (k.startsWith("firma")) return null;
  if (k.startsWith("comm")) return "commessa";
  if (k.startsWith("pos")) return "posizione";
  if (k.includes("client")) return "cliente";
  if (/^(q\.?\s?t[àa]|quantit)/.test(k)) return "quantita";
  if (k.startsWith("tipolog")) return "tipologia";
  if (k === "dn") return "dn";
  if (k.includes("elem") || k.includes("ø") || k.startsWith("diam")) return "diametro";
  if (k.startsWith("dimens") || k.startsWith("grandezz")) return "dimensione";
  if (/^(temp|minut|durata)/.test(k)) return "minuti";
  return null;
}

/** Testo "pulito" di un valore di cella (rich text / hyperlink / formula di exceljs, o stringa CSV). */
function cellText(v) {
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

/** Minuti da un valore: orario Excel (Date / frazione di giorno), "h:mm", "h:mm:ss" o numero di minuti. */
function parseMinutes(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.getUTCHours() * 60 + v.getUTCMinutes() + Math.round(v.getUTCSeconds() / 60);
  if (typeof v === "object") v = cellText(v);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const hms = s.match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/);    // "1:30" / "01:00:00"
    if (hms) return Number(hms[1]) * 60 + Number(hms[2]) + Math.round(Number(hms[3] || 0) / 60);
    if (!/^\d+([.,]\d+)?$/.test(s)) return NaN;
    v = Number(s.replace(",", "."));                                // "90" / "0,0416" (CSV da Excel)
  }
  if (typeof v === "number") {
    if (v > 0 && v < 1) return Math.round(v * 24 * 60);             // frazione di giorno (formato "ora")
    return Math.round(v);
  }
  return NaN;
}

function sanitizeField(raw) {
  // Rimuove i caratteri di controllo (0x00–0x1F): testo da file esterni.
  // eslint-disable-next-line no-control-regex
  let s = String(raw ?? "").replace(/[\u0000-\u001f]+/g, " ").trim();
  if (s.length > LIMITS.textMax) s = s.slice(0, LIMITS.textMax);
  return s;
}
// "/" o "-" da soli nel foglio significano "nessun valore"
const optional = (raw) => { const s = sanitizeField(raw); return s === "/" || s === "-" ? "" : s; };

// ── Lettura dei due formati in una griglia: righe 1-based, ciascuna un array 1-based di valori ──

async function xlsxGrid(buffer) {
  const workbook = new ExcelJS.Workbook();
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(Object.assign(new Error("Lettura del file troppo lunga: file non valido o troppo complesso."), { status: 400 })), LIMITS.parseTimeoutMs);
  });
  try {
    await Promise.race([workbook.xlsx.read(Readable.from(buffer)), timeout]);
  } finally {
    clearTimeout(timer);   // sempre: un timer appeso terrebbe vivo l'event loop
  }
  const ws = workbook.worksheets[0];
  if (!ws) return null;
  const grid = [];
  const last = Math.min(ws.rowCount || 0, LIMITS.maxRows + 20);
  for (let r = 1; r <= last; r++) {
    const row = ws.getRow(r);
    const cells = [];
    for (let c = 1; c <= LIMITS.maxCols; c++) cells[c] = row.getCell(c).value;
    grid[r] = cells;
  }
  return { grid, rowCount: ws.rowCount || 0 };
}

// BOM UTF-8 scritto come codice: un carattere invisibile nel sorgente sparirebbe senza avvisi.
const BOM = String.fromCharCode(0xfeff);

/** Testo del CSV: UTF-8 (con o senza BOM), altrimenti la codifica di Excel italiano (Windows-1252). */
function decodeCsv(buffer) {
  try {
    // TextDecoder toglie già il BOM iniziale; il controllo resta come seconda sicurezza.
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return text.startsWith(BOM) ? text.slice(1) : text;
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** Separatore più frequente (fuori dalle virgolette) nelle prime righe: ; , oppure TAB. */
function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 15).join("\n");
  let best = ";", bestCount = -1;
  for (const d of [";", ",", "\t"]) {
    let count = 0, quoted = false;
    for (const ch of sample) {
      if (ch === '"') quoted = !quoted;
      else if (ch === d && !quoted) count++;
    }
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

/** CSV RFC 4180 (virgolette, "" come virgoletta, a capo dentro le virgolette) → griglia 1-based. */
function csvGrid(buffer) {
  const text = decodeCsv(buffer);
  const delim = detectDelimiter(text);
  const grid = [];
  let row = [undefined], field = "", quoted = false, r = 1;
  const pushField = () => { if (row.length <= LIMITS.maxCols) row.push(field); field = ""; };
  const pushRow = () => { grid[r++] = row; row = [undefined]; };
  for (let i = 0; i < text.length && r <= LIMITS.maxRows + 20; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) pushField();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushField(); pushRow();
    } else field += ch;
  }
  if (field !== "" || row.length > 1) { pushField(); pushRow(); }
  return { grid, rowCount: r - 1 };
}

/** Riga di intestazione (entro le prime 10) e mappa campo→colonna. */
function detectColumns(grid) {
  for (let r = 1; r <= Math.min(10, grid.length - 1); r++) {
    const cells = grid[r] || [];
    const map = {};
    for (let c = 1; c < Math.min(cells.length, LIMITS.maxCols + 1); c++) {
      const h = norm(cellText(cells[c]));
      if (!h) continue;
      const field = headerField(h);
      if (field && map[field] == null) map[field] = c;
    }
    if (map.tipologia != null && map.minuti != null) return { headerRow: r, map };
  }
  return null;
}

/** Estrae le righe valide (e gli errori) da una griglia, comune a .xlsx e .csv. */
function extractRows({ grid, rowCount }) {
  const detected = detectColumns(grid);
  if (!detected) {
    return { rows: [], errors: [{ row: 0, message: "Intestazioni non trovate. Servono almeno 'Tipologia' e un tempo ('Minuti', 'Tempo' o 'Temp standard')." }], truncated: false, perPiece: false };
  }
  const { headerRow, map } = detected;
  const perPiece = map.commessa != null;
  const get = (cells, f) => (map[f] != null ? cells[map[f]] : undefined);
  const rows = [], errors = [];
  const seen = new Map();          // chiave pezzo → riga già accettata (per duplicati/conflitti)
  let processed = 0, truncated = false, duplicates = 0;

  for (let r = headerRow + 1; r <= Math.min(rowCount, grid.length - 1); r++) {
    if (processed >= LIMITS.maxRows) { truncated = true; break; }
    const cells = grid[r] || [];

    const commessa   = sanitizeField(cellText(get(cells, "commessa")));
    const posizione  = optional(cellText(get(cells, "posizione")));
    const cliente    = sanitizeField(cellText(get(cells, "cliente")));
    const tipologia  = sanitizeField(cellText(get(cells, "tipologia")));
    const dimensione = optional(cellText(get(cells, "dimensione")));
    const dn         = optional(cellText(get(cells, "dn")));
    const diametro   = optional(cellText(get(cells, "diametro")));
    const labelRaw   = sanitizeField(cellText(get(cells, "label")));
    const qRaw       = sanitizeField(cellText(get(cells, "quantita")));
    const minuti     = parseMinutes(get(cells, "minuti"));

    // Riga del tutto vuota (es. righe di separazione del foglio) → salta senza errore
    if (!commessa && !tipologia && !dimensione && !cliente && !qRaw && (minuti == null || Number.isNaN(minuti))) continue;
    processed++;

    const data = { commessa, posizione, tipologia, dimensione };
    const rowErr = (message) => errors.push({ row: r, message, data });

    if ([commessa, posizione, cliente, tipologia, dimensione, dn, diametro, labelRaw, qRaw].some((v) => FORMULA_LEAD.test(v))) {
      rowErr("Contiene caratteri non ammessi all'inizio di una cella (= + - @). Riga ignorata per sicurezza.");
      continue;
    }
    if (perPiece && !commessa) { rowErr("Commessa mancante."); continue; }
    if (!tipologia) { rowErr("Tipologia mancante."); continue; }
    if (minuti == null || Number.isNaN(minuti)) { rowErr("Tempo standard mancante o non leggibile."); continue; }
    if (!Number.isInteger(minuti) || minuti < 1 || minuti > 24 * 60) { rowErr(`Tempo fuori intervallo (1–1440 min): ${minuti}.`); continue; }
    let quantita = null;
    if (qRaw) {
      quantita = Number(qRaw.replace(",", "."));
      if (!Number.isInteger(quantita) || quantita < 1 || quantita > 100000) { rowErr(`Quantità non valida: ${qRaw}.`); continue; }
    }

    const label = (labelRaw || (perPiece
      ? `${commessa}${posizione ? "/" + posizione : ""} ${tipologia} ${dimensione}`
      : `${tipologia} ${dimensione}`).replace(/\s+/g, " ").trim()).slice(0, 80);
    const item = { row: r, commessa, posizione, cliente, quantita, tipologia, dimensione, dn, diametro, label, minuti };

    // Stesso pezzo (commessa+posizione) o stesso tempo generico (tipologia+dimensione) già nel file
    const key = perPiece ? `${commessa}\u0000${posizione}` : `\u0000${tipologia}\u0000${dimensione}`;
    const prev = seen.get(key);
    if (prev) {
      const same = ["cliente", "quantita", "tipologia", "dimensione", "dn", "diametro", "minuti"].every((f) => prev[f] === item[f]);
      if (same) { duplicates++; continue; }
      rowErr(perPiece
        ? `Conflitto: la commessa ${commessa}${posizione ? " pos. " + posizione : ""} è già alla riga ${prev.row} con dati diversi.`
        : `Conflitto: ${tipologia} ${dimensione} è già alla riga ${prev.row} con un tempo diverso.`);
      continue;
    }
    seen.set(key, item);
    rows.push(item);
  }
  return { rows, errors, truncated, perPiece, duplicates };
}

/**
 * Parsa il file e restituisce { rows, errors, truncated, perPiece, duplicates }.
 * `kind` = "xlsx" | "csv" (deciso dal middleware di upload in base al contenuto reale).
 */
async function parseStandardTimesFile(buffer, kind = "xlsx") {
  const sheet = kind === "csv" ? csvGrid(buffer) : await xlsxGrid(buffer);
  if (!sheet) return { rows: [], errors: [{ row: 0, message: "Il file non contiene alcun foglio." }], truncated: false, perPiece: false, duplicates: 0 };
  return extractRows(sheet);
}

/** Compatibilità: solo .xlsx. */
const parseStandardTimesXlsx = (buffer) => parseStandardTimesFile(buffer, "xlsx");

module.exports = { parseStandardTimesFile, parseStandardTimesXlsx, parseMinutes, LIMITS };
