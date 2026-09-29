// ══════════════════════════════════════════════════════════════
// routes/production.js — Tempi standard + Andon Board saldatura
// ══════════════════════════════════════════════════════════════
const express  = require("express");
const mongoose = require("mongoose");
const { body, query } = require("express-validator");
const StandardTime    = require("../models/StandardTime");
const ProductionEntry = require("../models/ProductionEntry");
const User            = require("../models/User");
const { protect, requireSupervisor } = require("../middleware/auth");
const validate = require("../middleware/validate");
const router   = express.Router();

// Express 4 does not forward rejected promises: without this, a DB error in an async
// handler becomes an unhandled rejection and takes the whole process down.
for (const method of ["get", "post", "put", "delete"]) {
  const register = router[method].bind(router);
  router[method] = (path, ...handlers) => register(path, ...handlers.map((h) =>
    typeof h === "function" && h.constructor.name === "AsyncFunction"
      ? (req, res, next) => h(req, res, next).catch(next)
      : h));
}

router.use(protect);

const isSupervisor = (user) => ["admin", "supervisore"].includes(user?.role);

// Valori del foglio "TEMPI STANDARD" di reparto, usati solo se la collezione è vuota.
const DEFAULT_STANDARD_TIMES = [
  { tipologia: "Custodia quadra saldata al flangiato",  dimensione: "",                    label: "Quadra saldata",   minuti: 210 },
  { tipologia: "Custodia quadra avvitata al flangiato", dimensione: "",                    label: "Quadra avvitata",  minuti: 60 },
  { tipologia: "Custodia ATEX (sp.>10mm)",              dimensione: "Piccola (DN80-DN150)", label: "ATEX Piccola",     minuti: 30 },
  { tipologia: "Custodia ATEX (sp.>10mm)",              dimensione: "Media (DN200-DN300)",  label: "ATEX Media",       minuti: 45 },
  { tipologia: "Custodia ATEX (sp.>10mm)",              dimensione: "Grande (>DN400)",      label: "ATEX Grande",      minuti: 90 },
  { tipologia: "Custodia IP65 (calandrata)",            dimensione: "Piccola (DN80-DN150)", label: "IP65 Piccola",     minuti: 90 },
  { tipologia: "Custodia IP65 (calandrata)",            dimensione: "Media (DN200-DN300)",  label: "IP65 Media",       minuti: 120 },
  { tipologia: "Custodia IP65 (calandrata)",            dimensione: "Grande (>DN400)",      label: "IP65 Grande",      minuti: 150 },
  { tipologia: "Custodia NEMA",                         dimensione: "",                    label: "NEMA",             minuti: 30 },
];

async function ensureDefaultStandardTimes() {
  if (await StandardTime.estimatedDocumentCount() > 0) return;
  try {
    await StandardTime.insertMany(DEFAULT_STANDARD_TIMES, { ordered: false });
  } catch (err) {
    if (err.code !== 11000) throw err;  // richieste concorrenti: l'altra ha già inserito
  }
}

/** "YYYY-MM-DD" -> Date a mezzanotte UTC, così il giorno non slitta col fuso. */
const dayStart = (iso) => new Date(`${iso}T00:00:00.000Z`);
const isoDate  = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(dayStart(v).getTime());

// ── Tempi standard ────────────────────────────────────────────

router.get("/standard-times", async (_req, res) => {
  await ensureDefaultStandardTimes();
  const items = await StandardTime.find({ isActive: true }).sort({ tipologia: 1, minuti: 1 }).lean();
  res.json({ standardTimes: items });
});

const standardTimeRules = [
  body("tipologia").trim().notEmpty().withMessage("Tipologia obbligatoria"),
  body("dimensione").optional().trim(),
  body("label").trim().notEmpty().withMessage("Nome breve obbligatorio"),
  body("minuti").isInt({ min: 1, max: 24 * 60 }).withMessage("Minuti tra 1 e 1440").toInt(),
];

router.post("/standard-times", requireSupervisor, standardTimeRules, validate, async (req, res) => {
  const { tipologia, dimensione = "", label, minuti } = req.body;
  try {
    const item = await StandardTime.create({ tipologia, dimensione, label, minuti, updatedBy: req.user._id });
    res.status(201).json({ standardTime: item });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Esiste già un tempo per questa tipologia e dimensione." });
    res.status(500).json({ message: "Errore." });
  }
});

router.put("/standard-times/:id", requireSupervisor, standardTimeRules, validate, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Tempo standard non trovato." });
  const { tipologia, dimensione = "", label, minuti } = req.body;
  try {
    const item = await StandardTime.findByIdAndUpdate(
      req.params.id,
      { tipologia, dimensione, label, minuti, updatedBy: req.user._id },
      { new: true, runValidators: true },
    );
    if (!item) return res.status(404).json({ message: "Tempo standard non trovato." });
    res.json({ standardTime: item });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Esiste già un tempo per questa tipologia e dimensione." });
    res.status(500).json({ message: "Errore." });
  }
});

// Disattivazione, non cancellazione: le righe storiche continuano a referenziarlo.
router.delete("/standard-times/:id", requireSupervisor, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Tempo standard non trovato." });
  await StandardTime.findByIdAndUpdate(req.params.id, { isActive: false, updatedBy: req.user._id });
  res.json({ message: "Tempo standard rimosso." });
});

// ── Andon Board ───────────────────────────────────────────────

const periodRules = [
  query("from").optional().custom(isoDate).withMessage("Data 'from' non valida (YYYY-MM-DD)"),
  query("to").optional().custom(isoDate).withMessage("Data 'to' non valida (YYYY-MM-DD)"),
];

function periodFilter(q) {
  const filter = {};
  if (q.from || q.to) {
    filter.data = {};
    if (q.from) filter.data.$gte = dayStart(q.from);
    if (q.to) {
      const end = dayStart(q.to);
      end.setUTCDate(end.getUTCDate() + 1);   // 'to' incluso
      filter.data.$lt = end;
    }
  }
  if (q.operatore && mongoose.isValidObjectId(q.operatore)) filter.operatore = new mongoose.Types.ObjectId(q.operatore);
  if (q.commessa) filter.commessa = String(q.commessa).trim();
  return filter;
}

router.get("/entries", periodRules, validate, async (req, res) => {
  const entries = await ProductionEntry.find(periodFilter(req.query))
    .sort({ data: -1, createdAt: -1 })
    .limit(500);
  res.json({ entries });
});

const entryRules = [
  body("data").custom(isoDate).withMessage("Data non valida (YYYY-MM-DD)"),
  body("commessa").trim().notEmpty().withMessage("Numero commessa obbligatorio"),
  body("posizione").optional().trim(),
  body("quantita").isInt({ min: 1, max: 10000 }).withMessage("Quantità non valida").toInt(),
  body("standardTime").isMongoId().withMessage("Tipologia custodia obbligatoria"),
  body("tempoImpiegatoMinuti").isInt({ min: 1, max: 100000 }).withMessage("Tempo impiegato non valido").toInt(),
  body("dataFine").optional({ values: "falsy" }).custom(isoDate).withMessage("Data fine non valida (YYYY-MM-DD)"),
  body("sospesa").optional().isBoolean().toBoolean(),
  body("bindello").optional().isBoolean().toBoolean(),
  body("note").optional().trim().isLength({ max: 500 }),
  body("operatore").optional({ values: "falsy" }).isMongoId().withMessage("Operatore non valido"),
];

/**
 * Campi comuni a creazione e modifica, con snapshot del tempo standard.
 * In modifica, se la tipologia non cambia, la riga tiene il suo snapshot originale:
 * correggere i pezzi di una riga vecchia non deve applicarle il tempo attuale della tabella.
 */
async function buildEntryFields(req, existing = null) {
  let snapshot;
  if (existing && String(existing.standardTime) === String(req.body.standardTime)) {
    snapshot = { standardTime: existing.standardTime, custodiaLabel: existing.custodiaLabel, tempoStdMinuti: existing.tempoStdMinuti };
  } else {
    const std = await StandardTime.findOne({ _id: req.body.standardTime, isActive: true });
    if (!std) return { error: "Tipologia custodia non trovata." };
    snapshot = { standardTime: std._id, custodiaLabel: std.label, tempoStdMinuti: std.minuti };
  }
  const b = req.body;
  return {
    fields: {
      data: dayStart(b.data),
      commessa: b.commessa,
      posizione: b.posizione || "",
      quantita: b.quantita,
      ...snapshot,
      tempoImpiegatoMinuti: b.tempoImpiegatoMinuti,
      dataFine: b.dataFine ? dayStart(b.dataFine) : null,
      sospesa: Boolean(b.sospesa),
      bindello: Boolean(b.bindello),
      note: b.note || "",
    },
  };
}

/** Solo supervisori/admin possono registrare per un altro operatore. */
async function resolveOperatore(req, fallbackUser) {
  const requested = req.body.operatore;
  if (!requested || String(requested) === String(fallbackUser._id)) return { user: fallbackUser };
  if (!isSupervisor(req.user)) return { error: "Puoi registrare solo a tuo nome.", status: 403 };
  const user = await User.findById(requested);
  if (!user) return { error: "Operatore non trovato.", status: 404 };
  return { user };
}

router.post("/entries", entryRules, validate, async (req, res) => {
  const { fields, error } = await buildEntryFields(req);
  if (error) return res.status(400).json({ message: error });
  const op = await resolveOperatore(req, req.user);
  if (op.error) return res.status(op.status).json({ message: op.error });

  const entry = await ProductionEntry.create({
    ...fields,
    operatore: op.user._id,
    operatoreNome: op.user.name || op.user.username,
    createdBy: req.user._id,
  });
  res.status(201).json({ entry });
});

async function loadEditableEntry(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(404).json({ message: "Riga non trovata." }); return null; }
  const entry = await ProductionEntry.findById(req.params.id);
  if (!entry) { res.status(404).json({ message: "Riga non trovata." }); return null; }
  if (!isSupervisor(req.user) && String(entry.operatore) !== String(req.user._id)) {
    res.status(403).json({ message: "Puoi modificare solo le tue righe." });
    return null;
  }
  return entry;
}

router.put("/entries/:id", entryRules, validate, async (req, res) => {
  const entry = await loadEditableEntry(req, res);
  if (!entry) return;
  const { fields, error } = await buildEntryFields(req, entry);
  if (error) return res.status(400).json({ message: error });

  // L'operatore della riga cambia solo se un supervisore lo chiede esplicitamente.
  if (req.body.operatore && String(req.body.operatore) !== String(entry.operatore)) {
    const op = await resolveOperatore(req, { _id: entry.operatore });
    if (op.error) return res.status(op.status).json({ message: op.error });
    fields.operatore = op.user._id;
    fields.operatoreNome = op.user.name || op.user.username;
  }
  entry.set(fields);
  await entry.save();
  res.json({ entry });
});

router.delete("/entries/:id", async (req, res) => {
  const entry = await loadEditableEntry(req, res);
  if (!entry) return;
  await entry.deleteOne();
  res.json({ message: "Riga eliminata." });
});

// ── Confronto tempo standard vs impiegato ─────────────────────

router.get("/stats", periodRules, validate, async (req, res) => {
  const match = periodFilter(req.query);
  const sums = {
    righe:          { $sum: 1 },
    pezzi:          { $sum: "$quantita" },
    attesoMinuti:   { $sum: { $multiply: ["$tempoStdMinuti", "$quantita"] } },
    impiegatoMinuti:{ $sum: "$tempoImpiegatoMinuti" },
  };
  const [result] = await ProductionEntry.aggregate([
    { $match: match },
    { $facet: {
      totale:      [{ $group: { _id: null, ...sums } }],
      perOperatore:[{ $group: { _id: "$operatore", nome: { $last: "$operatoreNome" }, ...sums } }, { $sort: { nome: 1 } }],
      perCommessa: [{ $group: { _id: "$commessa", ...sums } }, { $sort: { _id: 1 } }],
      perGiorno:   [{ $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$data" } }, ...sums } }, { $sort: { _id: 1 } }],
    } },
  ]);

  // efficienza > 1 = più veloce dello standard
  const withEfficiency = (row) => ({
    ...row,
    efficienza: row.impiegatoMinuti > 0 ? Math.round((row.attesoMinuti / row.impiegatoMinuti) * 100) / 100 : null,
  });
  const empty = { righe: 0, pezzi: 0, attesoMinuti: 0, impiegatoMinuti: 0 };

  res.json({
    totale:       withEfficiency(result.totale[0] ? { ...result.totale[0], _id: undefined } : empty),
    perOperatore: result.perOperatore.map(withEfficiency),
    perCommessa:  result.perCommessa.map(withEfficiency),
    perGiorno:    result.perGiorno.map(withEfficiency),
  });
});

module.exports = router;
