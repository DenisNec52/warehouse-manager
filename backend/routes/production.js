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
const { checkDepartment, visibleScope } = require("../utils/departmentAccess");
const { colleagueFilter, hiddenSuperAdminId } = require("../utils/colleagues");
const Department = require("../models/Department");
const { PERIODS, resolvePeriod } = require("../utils/reportPeriod");
const { exportLimiter } = require("../middleware/rateLimiter");
const { buildReport } = require("../utils/andonReport");
const { buildAndonWorkbook } = require("../utils/andonExcel");
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

/** "YYYY-MM-DD" -> Date a mezzanotte UTC, così il giorno non slitta col fuso. */
const dayStart = (iso) => new Date(`${iso}T00:00:00.000Z`);
const isoDate  = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(dayStart(v).getTime());

// ── Tempi standard ────────────────────────────────────────────

/**
 * Filtro reparto per le letture: ?department=<id> (verificato) oppure, se assente,
 * tutti i reparti visibili all'utente. Risponde lui con l'errore e restituisce null.
 */
async function departmentFilter(req, res) {
  if (!req.query.department) return visibleScope(req.user);
  const check = await checkDepartment(req.user, req.query.department);
  if (check.status) { res.status(check.status).json({ message: check.message }); return null; }
  return { department: check.department._id };
}

/**
 * Filtro delle righe di produzione per le letture: reparti visibili (departmentFilter)
 * e, per gli operai, solo le righe dei colleghi della propria mansione (utils/colleagues).
 */
async function productionScope(req, res) {
  const scope = await departmentFilter(req, res);
  if (!scope) return null;
  return { ...scope, ...(await colleagueFilter(req, "operatore")) };
}

router.get("/standard-times", async (req, res) => {
  const scope = await departmentFilter(req, res);
  if (!scope) return;
  const items = await StandardTime.find({ ...scope, isActive: true }).sort({ tipologia: 1, minuti: 1 }).lean();
  res.json({ standardTimes: items });
});

const standardTimeRules = [
  body("department").optional().isMongoId().withMessage("Reparto non valido"),
  body("tipologia").trim().notEmpty().withMessage("Tipologia obbligatoria"),
  body("dimensione").optional().trim(),
  body("label").trim().notEmpty().withMessage("Nome breve obbligatorio"),
  body("minuti").isInt({ min: 1, max: 24 * 60 }).withMessage("Minuti tra 1 e 1440").toInt(),
];

router.post("/standard-times", requireSupervisor, standardTimeRules, validate, async (req, res) => {
  const check = await checkDepartment(req.user, req.body.department, { forWrite: true });
  if (check.status) return res.status(check.status).json({ message: check.message });
  const { tipologia, dimensione = "", label, minuti } = req.body;
  try {
    const item = await StandardTime.create({
      department: check.department._id, tipologia, dimensione, label, minuti, updatedBy: req.user._id,
    });
    res.status(201).json({ standardTime: item });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "In questo reparto esiste già un tempo per questa tipologia e dimensione." });
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
    if (err.code === 11000) return res.status(409).json({ message: "In questo reparto esiste già un tempo per questa tipologia e dimensione." });
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
  const scope = await productionScope(req, res);
  if (!scope) return;
  const entries = await ProductionEntry.find({ ...periodFilter(req.query), ...scope })
    .sort({ data: -1, createdAt: -1 })
    .limit(500)
    .lean();
  const hideId = await hiddenSuperAdminId(req);
  if (hideId) entries.forEach(e => { if (String(e.operatore) === hideId) e.operatoreNome = "Altro operatore"; });
  res.json({ entries });
});

const entryRules = [
  body("department").optional().isMongoId().withMessage("Reparto non valido"),
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
async function buildEntryFields(req, department, existing = null) {
  let snapshot;
  const sameStd = existing && String(existing.standardTime) === String(req.body.standardTime)
    && String(existing.department) === String(department._id);
  if (sameStd) {
    snapshot = { standardTime: existing.standardTime, custodiaLabel: existing.custodiaLabel, tempoStdMinuti: existing.tempoStdMinuti };
  } else {
    // La tipologia deve essere un tempo standard attivo dello stesso reparto della riga.
    const std = await StandardTime.findOne({ _id: req.body.standardTime, isActive: true, department: department._id });
    if (!std) return { error: "Tipologia custodia non trovata in questo reparto." };
    snapshot = { standardTime: std._id, custodiaLabel: std.label, tempoStdMinuti: std.minuti };
  }
  const b = req.body;
  return {
    fields: {
      department: department._id,
      departmentName: department.name,
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
  const check = await checkDepartment(req.user, req.body.department, { forWrite: true });
  if (check.status) return res.status(check.status).json({ message: check.message });
  const { fields, error } = await buildEntryFields(req, check.department);
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
  const visible = req.user.visibleDepartmentIds();
  if (visible && !visible.includes(String(entry.department))) {
    res.status(403).json({ message: "Non hai accesso a questo reparto." });
    return null;
  }
  if (!isSupervisor(req.user) && String(entry.operatore) !== String(req.user._id)) {
    res.status(403).json({ message: "Puoi modificare solo le tue righe." });
    return null;
  }
  return entry;
}

router.put("/entries/:id", entryRules, validate, async (req, res) => {
  const entry = await loadEditableEntry(req, res);
  if (!entry) return;
  // La riga resta nel suo reparto (anche se nel frattempo disattivato); spostarla richiede
  // accesso al nuovo reparto, che deve essere attivo.
  const target = req.body.department || String(entry.department);
  const moving = target !== String(entry.department);
  const check = await checkDepartment(req.user, target, { forWrite: moving });
  if (check.status) return res.status(check.status).json({ message: check.message });
  const { fields, error } = await buildEntryFields(req, check.department, entry);
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
  const scope = await productionScope(req, res);
  if (!scope) return;
  const match = { ...periodFilter(req.query), ...scope };
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

  const hideStatsId = await hiddenSuperAdminId(req);
  const maskName = (row) => (hideStatsId && String(row._id) === hideStatsId ? { ...row, nome: "Altro operatore" } : row);
  res.json({
    totale:       withEfficiency(result.totale[0] ? { ...result.totale[0], _id: undefined } : empty),
    perOperatore: result.perOperatore.map(maskName).map(withEfficiency),
    perCommessa:  result.perCommessa.map(withEfficiency),
    perGiorno:    result.perGiorno.map(withEfficiency),
  });
});

// ── Report per periodo (grafici della dashboard) ed export Excel ──
// Stesso filtro nei due casi: periodo (giorno/settimana/mese che contiene "date") + reparti visibili.

const reportRules = [
  query("period").isIn(PERIODS).withMessage("Periodo non valido (giorno, settimana, mese)"),
  query("date").custom(isoDate).withMessage("Data non valida (YYYY-MM-DD)"),
  query("department").optional().isMongoId().withMessage("Reparto non valido"),
];

router.get("/report", reportRules, validate, async (req, res) => {
  const scope = await productionScope(req, res);
  if (!scope) return;
  res.json(await buildReport(scope, resolvePeriod(req.query.period, req.query.date), { hideUserId: await hiddenSuperAdminId(req) }));
});

router.get("/export", exportLimiter, [...reportRules, query("charts").optional().isIn(["0", "1"])], validate, async (req, res) => {
  const scope = await productionScope(req, res);
  if (!scope) return;
  const range = resolvePeriod(req.query.period, req.query.date);
  const report = await buildReport(scope, range, { withRows: true, hideUserId: await hiddenSuperAdminId(req) });
  const dept = scope.department ? await Department.findById(scope.department).select("name").lean() : null;
  const buffer = await buildAndonWorkbook(report, dept?.name || "Tutti i reparti visibili", req.query.charts === "1");

  const slug = (dept?.name || "reparti").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="andon_${slug}_${range.period}_${range.from}.xlsx"`,
    "Cache-Control": "no-store",
  });
  res.send(buffer);
});

module.exports = router;
