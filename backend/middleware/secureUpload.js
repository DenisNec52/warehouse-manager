/**
 * middleware/secureUpload.js
 *
 * Upload di file "a prova di malware/trojan". Difesa in profondità:
 *
 *  1. storage IN MEMORIA (multer.memoryStorage): il file NON viene mai scritto
 *     sul disco del server, quindi non c'è nulla da eseguire né da lasciare lì.
 *     Il buffer vive il tempo della richiesta e poi viene scartato dal GC.
 *  2. limiti rigidi: dimensione massima, UN solo file, pochi campi/parti —
 *     taglia zip-bomb enormi e abusi del multipart.
 *  3. allowlist di estensione + MIME: si accetta solo ciò che ci aspettiamo,
 *     tutto il resto (foto, pdf, exe, doc, .xlsm con macro, ...) è respinto.
 *  4. controllo dei "magic bytes": il contenuto REALE del file deve iniziare
 *     con la firma attesa, non ci fidiamo di estensione/MIME (falsificabili).
 *     Un .exe rinominato in .xlsx non ha la firma ZIP e viene bloccato.
 *
 * Non salva, non esegue, non restituisce mai il binario al client: si limita a
 * consegnare un buffer validato all'handler, che lo parserà in sola lettura.
 */
const multer = require("multer");

// Firme (magic bytes) iniziali per tipo. .xlsx è un contenitore ZIP OOXML,
// quindi inizia con "PK\x03\x04" come ogni archivio ZIP.
const SIGNATURES = {
  xlsx: [0x50, 0x4b, 0x03, 0x04], // 'P','K',0x03,0x04
  pdf:  [0x25, 0x50, 0x44, 0x46, 0x2d], // '%PDF-'
};
// Nome leggibile del tipo, per i messaggi d'errore.
const TYPE_LABEL = { xlsx: "file Excel (.xlsx)", pdf: "PDF", csv: "file CSV" };
// Estensione → tipo, quando un endpoint accetta più formati.
const EXT_KIND = { ".xlsx": "xlsx", ".pdf": "pdf", ".csv": "csv" };
// Il CSV non ha magic bytes: si verifica che sia testo e NON un binario travestito.
const BINARY_HEADS = [[0x50, 0x4b], [0x4d, 0x5a], [0x25, 0x50, 0x44, 0x46], [0x7f, 0x45, 0x4c, 0x46], [0xd0, 0xcf, 0x11, 0xe0]];

function hasSignature(buffer, signature) {
  if (!buffer || buffer.length < signature.length) return false;
  return signature.every((byte, i) => buffer[i] === byte);
}

/** Testo semplice: nessun byte NUL nelle prime 64 KB e nessuna firma di archivio/eseguibile/PDF/OLE. */
function looksLikeText(buffer) {
  if (BINARY_HEADS.some((h) => hasSignature(buffer, h))) return false;
  return !buffer.subarray(0, 65536).includes(0x00);
}

function contentMatches(buffer, kind) {
  return kind === "csv" ? looksLikeText(buffer) : hasSignature(buffer, SIGNATURES[kind]);
}

/**
 * Crea un middleware express che accetta UN file dal campo `field`.
 * @param {object} opts
 * @param {string}   opts.field        nome del campo multipart (es. "file")
 * @param {number}   opts.maxBytes     dimensione massima consentita
 * @param {string[]} opts.allowedExt   estensioni ammesse, minuscole con punto (es. [".xlsx"])
 * @param {string[]} opts.allowedMime  MIME ammessi
 * @param {string|string[]} opts.signature  tipo da verificare ("xlsx" | "pdf" | "csv"),
 *   oppure più tipi: si sceglie dall'estensione e il tipo reale finisce in req.fileKind.
 */
function secureUpload({ field, maxBytes, allowedExt, allowedMime, signature }) {
  const kinds = Array.isArray(signature) ? signature : [signature];
  for (const k of kinds) {
    if (k !== "csv" && !SIGNATURES[k]) throw new Error(`secureUpload: firma sconosciuta "${k}"`);
  }
  const label = kinds.map((k) => TYPE_LABEL[k]).join(" o ");
  const kindOf = (name) => {
    const ext = (String(name).match(/\.[^.\s]+$/)?.[0] || "").toLowerCase();
    return kinds.length === 1 ? kinds[0] : EXT_KIND[ext];
  };

  const upload = multer({
    storage: multer.memoryStorage(),
    // files:1 → un solo file; fields/parts bassi → niente multipart gonfiato.
    limits: { fileSize: maxBytes, files: 1, fields: 10, parts: 15 },
    fileFilter: (_req, file, cb) => {
      const ext = (file.originalname.match(/\.[^.\s]+$/)?.[0] || "").toLowerCase();
      if (!allowedExt.includes(ext))
        return cb(Object.assign(new Error(`Tipo di file non ammesso. Carica solo: ${allowedExt.join(", ")}.`), { status: 400 }));
      if (allowedMime.length && !allowedMime.includes(file.mimetype))
        return cb(Object.assign(new Error(`Il formato del file non corrisponde a un ${label} valido.`), { status: 400 }));
      cb(null, true);
    },
  }).single(field);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        // Errori di multer (file troppo grande, troppi file, ...) → 400 pulito.
        const msg = err.code === "LIMIT_FILE_SIZE"
          ? `File troppo grande. Dimensione massima: ${Math.round(maxBytes / 1024 / 1024)} MB.`
          : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
            ? "Carica un solo file alla volta."
            : (err.message || "Upload non valido.");
        return res.status(err.status || 400).json({ message: msg });
      }
      if (!req.file || !req.file.buffer || !req.file.buffer.length)
        return res.status(400).json({ message: `Nessun file ricevuto nel campo "${field}".` });

      // Magic bytes (o testo per il CSV): il CONTENUTO deve davvero essere del tipo atteso.
      const kind = kindOf(req.file.originalname);
      if (!kind || !contentMatches(req.file.buffer, kind))
        return res.status(400).json({ message: `Il file non è un vero ${kind ? TYPE_LABEL[kind] : label}: contenuto non riconosciuto.` });

      req.fileKind = kind;
      next();
    });
  };
}

module.exports = { secureUpload, hasSignature, looksLikeText, SIGNATURES };
