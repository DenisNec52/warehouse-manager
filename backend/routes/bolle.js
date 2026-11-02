/**
 * routes/bolle.js — PDF della bolla per POSIZIONE di commessa (funzione facoltativa).
 *
 * Una commessa può avere moltissime posizioni: ogni posizione ha la sua bolla.
 * Commessa e posizione viaggiano nella query (la posizione può essere vuota):
 *
 * GET    /api/bolle                                      — bolle presenti (per le icone nell'Andon)
 * GET    /api/bolle/file?commessa=2961&posizione=9       — il PDF, da aprire nel browser
 * PUT    /api/bolle?commessa=2961&posizione=9            — carica o sostituisce (supervisore/admin)
 * DELETE /api/bolle?commessa=2961&posizione=9            — elimina (supervisore/admin)
 *
 * Tutte rispondono 404 se il super-admin non ha acceso AppSettings.features.bollaPdf:
 * la funzione spenta non è raggiungibile, non solo nascosta nell'interfaccia.
 * Upload: secureUpload (memoria, un file, 10 MB, magic bytes "%PDF-") + importLimiter.
 */
const express     = require("express");
const mongoose    = require("mongoose");
const { Readable } = require("stream");
const Bolla       = require("../models/Bolla");
const AppSettings = require("../models/AppSettings");
const { protect, requireSupervisor } = require("../middleware/auth");
const { importLimiter } = require("../middleware/rateLimiter");
const { secureUpload }  = require("../middleware/secureUpload");

const router = express.Router();
const MAX_BYTES = 10 * 1024 * 1024;
// Niente caratteri speciali: finiscono in query, filtri e nome del file scaricato.
const COMMESSA  = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,49}$/;
const POSIZIONE = /^[A-Za-z0-9._-]{0,20}$/;

const uploadPdf = secureUpload({
  field: "file", maxBytes: MAX_BYTES, allowedExt: [".pdf"],
  allowedMime: ["application/pdf", "application/x-pdf", "application/octet-stream"], signature: "pdf",
});

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "bolle" });
// Cancellazione in background: un errore non blocca la risposta, ma resta nei log
// (altrimenti i file orfani in GridFS crescerebbero senza che nessuno se ne accorga).
const removeFile = (id) => bucket().delete(id).catch((err) => console.error("[bolle] file non eliminato", String(id), err?.message));

router.use(protect);

// Funzione spenta → 404: come se la route non esistesse.
router.use(async (_req, res, next) => {
  const s = await AppSettings.getSettings();
  if (!s.features?.bollaPdf) return res.status(404).json({ message: "Funzione bolle PDF non attiva." });
  next();
});

/** { commessa, posizione } validati dalla query, oppure null dopo aver risposto 400. */
function target(req, res) {
  // typeof: ?commessa[]=x o ?commessa[$ne]= arrivano come array/oggetto e vanno rifiutati
  const c = typeof req.query.commessa === "string" ? req.query.commessa.trim() : "";
  const p = typeof req.query.posizione === "string" ? req.query.posizione.trim() : (req.query.posizione == null ? "" : null);
  if (!COMMESSA.test(c)) { res.status(400).json({ message: "Numero di commessa non valido." }); return null; }
  if (p === null || !POSIZIONE.test(p)) { res.status(400).json({ message: "Posizione non valida." }); return null; }
  return { commessa: c, posizione: p };
}
const where = (t) => (t.posizione ? `commessa ${t.commessa} pos. ${t.posizione}` : `commessa ${t.commessa}`);

const publicBolla = (b) => ({
  commessa: b.commessa, posizione: b.posizione || "", filename: b.filename, size: b.size,
  uploadedByName: b.uploadedByName, updatedAt: b.updatedAt,
});

router.get("/", async (_req, res) => {
  const bolle = await Bolla.find().select("commessa posizione filename size uploadedByName updatedAt")
    .sort({ commessa: 1, posizione: 1 }).lean();
  res.json({ bolle: bolle.map(publicBolla) });
});

router.get("/file", async (req, res) => {
  const t = target(req, res);
  if (!t) return;
  const b = await Bolla.findOne(t).lean();
  if (!b) return res.status(404).json({ message: `Nessuna bolla per ${where(t)}.` });

  // PDF servito come tale: nosniff impedisce al browser di interpretarlo come HTML,
  // niente cache condivise (documenti aziendali). La CSP di helmet è pensata per le
  // pagine dell'app e bloccherebbe il visualizzatore PDF integrato del browser.
  const name = `bolla-${t.commessa}${t.posizione ? "-" + t.posizione : ""}`.replace(/[^\w.-]/g, "_");
  res.removeHeader("Content-Security-Policy");
  res.set({
    "Content-Type": "application/pdf",
    "Content-Length": String(b.size),
    "Content-Disposition": `inline; filename="${name}.pdf"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  bucket().openDownloadStream(b.fileId)
    .on("error", () => { if (!res.headersSent) res.status(404).end(); else res.destroy(); })
    .pipe(res);
});

router.put("/", requireSupervisor, importLimiter, uploadPdf, async (req, res) => {
  const t = target(req, res);
  if (!t) return;

  const filename = String(req.file.originalname || "bolla.pdf").replace(/[^\w .()-]/g, "_").slice(0, 120);
  const upload = bucket().openUploadStream(`${t.commessa}-${t.posizione || "0"}.pdf`, { metadata: { ...t, uploadedBy: req.user._id } });
  try {
    await new Promise((resolve, reject) => {
      Readable.from(req.file.buffer).pipe(upload).on("finish", resolve).on("error", reject);
    });
  } catch (err) {
    console.error("[bolle/upload]", err?.message);
    return res.status(500).json({ message: "Salvataggio della bolla non riuscito." });
  }

  // Prima si aggiorna il riferimento, poi si cancella il vecchio file: se qualcosa va
  // storto resta al massimo un file orfano, mai una bolla che punta al nulla.
  let previous;
  try {
    previous = await Bolla.findOneAndUpdate(
      t,
      { $set: { fileId: upload.id, filename, size: req.file.size, uploadedBy: req.user._id, uploadedByName: req.user.name || req.user.username } },
      { upsert: true, new: false },
    ).lean();
  } catch (err) {
    removeFile(upload.id); // il riferimento non è stato salvato: il file appena caricato non serve
    throw err;
  }
  if (previous?.fileId) removeFile(previous.fileId);

  const saved = await Bolla.findOne(t).lean();
  res.status(previous ? 200 : 201).json({ bolla: publicBolla(saved) });
});

router.delete("/", requireSupervisor, async (req, res) => {
  const t = target(req, res);
  if (!t) return;
  const b = await Bolla.findOneAndDelete(t).lean();
  if (!b) return res.status(404).json({ message: `Nessuna bolla per ${where(t)}.` });
  removeFile(b.fileId);
  res.json({ message: "Bolla eliminata." });
});

module.exports = router;
