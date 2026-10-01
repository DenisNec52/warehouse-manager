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
// NOTA: il pacchetto "cloudinary" è volutamente fissato alla v1.x in
// package.json (non l'ultima v2 dell'SDK): multer-storage-cloudinary
// richiede come peer dependency cloudinary "^1.21.0" per usarne l'export
// .v2 (l'API a promise, non quella a callback). Aggiornare "cloudinary"
// alla v2 rompe l'installazione (ERESOLVE) finché quel pacchetto non
// verrà aggiornato a sua volta.
// AVVISO SICUREZZA: cloudinary 1.x ha una CVE di argument injection (GHSA-g4mf-96x5-5m2c,
// risolta in 2.7.0). Non possiamo aggiornare finché usiamo multer-storage-cloudinary@4
// (richiede cloudinary ^1.21). Mitigazione: Cloudinary è disattivato di default
// (ENABLE_CLOUDINARY=false) e l'upload è riservato ad admin. Migrazione futura: passare
// a cloudinary 2.x con un motore di storage per multer mantenuto.
const cloudinary = require("cloudinary").v2;
// multer è fissato alla v2.x in package.json (non la v1 usata nei test di
// multer-storage-cloudinary) per via di alcune CVE note sulla v1: è comunque
// compatibile perché multer-storage-cloudinary non dipende da multer a
// runtime, implementa solo l'interfaccia StorageEngine (_handleFile/
// _removeFile), stabile identica tra le due major.
const multer      = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

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
  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder:          "warehouse-pro/products",
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      // Ridimensiona/ottimizza in upload: evita di salvare foto da 12MB
      // scattate con lo smartphone e riduce il consumo di crediti/banda.
      transformation:  [{ width: 1600, height: 1600, crop: "limit", quality: "auto", fetch_format: "auto" }],
    },
  });
  return multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } }).single("image");
}

module.exports = { cloudinary, makeUploader, ENABLED };
