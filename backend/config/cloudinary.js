/**
 * config/cloudinary.js
 *
 * Upload immagini prodotto su Cloudinary (piano gratuito: 25 crediti/mese,
 * ampiamente sufficiente per foto di magazzino — ogni upload/trasformazione
 * consuma una piccola frazione di credito).
 *
 * Attivo solo con ENABLE_CLOUDINARY=true e le CLOUDINARY_* configurate:
 * se manca qualcosa, makeUploader() restituisce un middleware che risponde
 * con un errore chiaro invece di far fallire l'avvio del server (stessa
 * filosofia "non bloccante" di utils/email.js).
 *
 * ════════════════════════════════════════════
 * CONFIGURAZIONE .env
 * ════════════════════════════════════════════
 *  ENABLE_CLOUDINARY=true
 *  CLOUDINARY_CLOUD_NAME=...
 *  CLOUDINARY_API_KEY=...
 *  CLOUDINARY_API_SECRET=...
 *  (tutti e tre si trovano nella Dashboard di Cloudinary dopo la registrazione,
 *   gratuita, su https://cloudinary.com)
 */
// cloudinary 2.x (la 1.x aveva la CVE di argument injection GHSA-g4mf-96x5-5m2c).
// Il vecchio multer-storage-cloudinary (fermo a cloudinary ^1) è sostituito da un
// piccolo StorageEngine multer qui sotto: stessa interfaccia (_handleFile/_removeFile),
// il file va in streaming a Cloudinary senza passare dal disco del server.
const cloudinary = require("cloudinary").v2;
const multer     = require("multer");

const UPLOAD_PARAMS = {
  folder:          "warehouse-pro/products",
  allowed_formats: ["jpg", "jpeg", "png", "webp"],
  // Ridimensiona/ottimizza in upload: evita di salvare foto da 12MB
  // scattate con lo smartphone e riduce il consumo di crediti/banda.
  transformation:  [{ width: 1600, height: 1600, crop: "limit", quality: "auto", fetch_format: "auto" }],
};

/** req.file.path = URL https, req.file.filename = public_id (come col pacchetto precedente). */
const cloudinaryStorage = {
  _handleFile(_req, file, cb) {
    const upload = cloudinary.uploader.upload_stream(UPLOAD_PARAMS, (err, result) => {
      if (err) return cb(err);
      cb(null, { path: result.secure_url, filename: result.public_id, size: result.bytes });
    });
    file.stream.on("error", cb);
    file.stream.pipe(upload);
  },
  _removeFile(_req, file, cb) {
    cloudinary.uploader.destroy(file.filename).then(() => cb(null), cb);
  },
};

const ENABLED = process.env.ENABLE_CLOUDINARY === "true";

if (ENABLED) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// Middleware express: gestisce l'upload multipart di un singolo file
// nel campo "image" e lo carica direttamente su Cloudinary (nessun file
// temporaneo scritto su disco sul server).
function makeUploader() {
  if (!ENABLED) {
    return (_req, res) => res.status(503).json({
      message: "Upload immagini non configurato: imposta ENABLE_CLOUDINARY=true e le variabili CLOUDINARY_* nel .env del backend.",
    });
  }
  return multer({ storage: cloudinaryStorage, limits: { fileSize: 8 * 1024 * 1024 } }).single("image");
}

module.exports = { cloudinary, makeUploader, ENABLED };
