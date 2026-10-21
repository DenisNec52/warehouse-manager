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
};

function hasSignature(buffer, signature) {
  if (!buffer || buffer.length < signature.length) return false;
  return signature.every((byte, i) => buffer[i] === byte);
}

/**
 * Crea un middleware express che accetta UN file dal campo `field`.
 * @param {object} opts
 * @param {string}   opts.field        nome del campo multipart (es. "file")
 * @param {number}   opts.maxBytes     dimensione massima consentita
 * @param {string[]} opts.allowedExt   estensioni ammesse, minuscole con punto (es. [".xlsx"])
 * @param {string[]} opts.allowedMime  MIME ammessi
 * @param {keyof SIGNATURES} opts.signature  firma magic-bytes da verificare
 */
function secureUpload({ field, maxBytes, allowedExt, allowedMime, signature }) {
  const sig = SIGNATURES[signature];
  if (!sig) throw new Error(`secureUpload: firma sconosciuta "${signature}"`);

  const upload = multer({
    storage: multer.memoryStorage(),
    // files:1 → un solo file; fields/parts bassi → niente multipart gonfiato.
    limits: { fileSize: maxBytes, files: 1, fields: 10, parts: 15 },
    fileFilter: (_req, file, cb) => {
      const ext = (file.originalname.match(/\.[^.\s]+$/)?.[0] || "").toLowerCase();
      if (!allowedExt.includes(ext))
        return cb(Object.assign(new Error(`Tipo di file non ammesso. Carica solo: ${allowedExt.join(", ")}.`), { status: 400 }));
      if (allowedMime.length && !allowedMime.includes(file.mimetype))
        return cb(Object.assign(new Error("Il formato del file non corrisponde a un Excel valido."), { status: 400 }));
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

      // Magic bytes: il CONTENUTO deve davvero essere un file del tipo atteso.
      if (!hasSignature(req.file.buffer, sig))
        return res.status(400).json({ message: "Il file non è un vero file Excel (.xlsx): contenuto non riconosciuto." });

      next();
    });
  };
}

module.exports = { secureUpload, hasSignature, SIGNATURES };
