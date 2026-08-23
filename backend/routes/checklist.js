/**
 * routes/checklist.js — API checklist 5S completa
 */
const express  = require("express");
const { body } = require("express-validator");
const Checklist           = require("../models/Checklist");
const ChecklistSubmission = require("../models/ChecklistSubmission");
const { protect, requireAdmin, requireSupervisor } = require("../middleware/auth");
const validate = require("../middleware/validate");

const router = express.Router();
router.use(protect);

// ── Dati 5S di default (dal modulo nell'immagine) ─────────────
const DEFAULT_5S = {
  title:       "Autovalutazione Area 5S",
  description: "Compilare a fine turno. In caso di risposta negativa inserire commento.",
  workArea:    "Postazione Saldatura 1",
  sections: [
    {
      title: "1S — Selezione", icon: "🔴", order: 1,
      items: [
        { label: "Tutto ciò che era inutile è stato eliminato?", required: true, order: 1 },
        { label: "Dal(i) posto(i) di lavoro?", required: true, order: 2 },
        { label: "Nei corridoi e aree di passaggio?", required: true, order: 3 },
        { label: "Sopra/sotto i banchi?", required: true, order: 4 },
        { label: "Nella scaffalatura?", required: true, order: 5 },
        { label: "Nelle aree di prelievo e nell'area documentazione?", required: true, order: 6 },
      ],
    },
    {
      title: "2S — Ordine", icon: "🟡", order: 2,
      items: [
        { label: "I seguenti oggetti sono al loro posto? (posti ben definiti, un solo oggetto)", required: true, order: 1 },
        { label: "Strumenti, utensili di lavoro?", required: true, order: 2 },
        { label: "Attrezzature/dime?", required: true, order: 3 },
        { label: "Materiali consumabili?", required: true, order: 4 },
        { label: "Rifiuti (contenitori adatti, identificati, non traboccanti)?", required: true, order: 5 },
        { label: "Il kit pulizia è disponibile e al suo posto?", required: true, order: 6 },
      ],
    },
    {
      title: "3S — Pulizia", icon: "🟢", order: 3,
      items: [
        { label: "I punti seguenti sono puliti?", required: true, order: 1 },
        { label: "Il posto di lavoro?", required: true, order: 2 },
        { label: "Le attrezzature/dime/utensili?", required: true, order: 3 },
        { label: "I ripiani/banchi?", required: true, order: 4 },
        { label: "Il pavimento e i corridoi?", required: true, order: 5 },
        { label: "Tutte le zone sono facilmente accessibili (no cartoni, cavi al suolo)?", required: true, order: 6 },
      ],
    },
    {
      title: "4S — Standardizzazione", icon: "🔵", order: 4,
      items: [
        { label: "Gli standard seguenti esistono e risultano essere in buono stato?", required: true, order: 1 },
        { label: "Marcatura pavimento delle macchine (se presenti)?", required: false, order: 2 },
        { label: "Marcatura pavimento materiali (input/output)?", required: true, order: 3 },
        { label: "Attrezzature al loro posto con sagome ad indicarne la presenza?", required: false, order: 4 },
        { label: "Standard di pulizia?", required: true, order: 5 },
        { label: "Calendario di pulizia?", required: true, order: 6 },
      ],
    },
    {
      title: "5S — Sostenere", icon: "🟣", order: 5,
      items: [
        { label: "Sono rispettati i punti seguenti? (tendenza)", required: true, order: 1 },
        { label: "La scorsa settimana l'autovalutazione è stata effettuata?", required: true, order: 2 },
        { label: "La scorsa settimana il calendario delle pulizie è stato sempre firmato?", required: true, order: 3 },
        { label: "Almeno un miglioramento apportato dopo l'ultima autovalutazione?", required: false, order: 4 },
        { label: "La curva tendenziale è in aumento o ha raggiunto il massimo?", required: false, order: 5 },
      ],
    },
  ],
  shifts: [
    { name: "Turno 1 — Mattina",    startTime: "06:00", endTime: "14:00", active: true },
    { name: "Turno 2 — Pomeriggio", startTime: "14:00", endTime: "22:00", active: true },
  ],
  cleaningTypes: [
    { label: "Pulizia leggera / generica giornaliera", default: true },
    { label: "Pulizia completa (saldatrice + muri + teli rossi)", default: false },
    { label: "Solo saldatrice", default: false },
    { label: "Solo teli", default: false },
  ],
};

// ── GET /api/checklist ────────────────────────────────────────
router.get("/", async (_req, res) => {
  try {
    let cl = await Checklist.findOne({ active: true });
    if (!cl) cl = await Checklist.create(DEFAULT_5S);
    res.json({ checklist: cl });
  } catch (err) {
    res.status(500).json({ message: "Errore." });
  }
});

// ── PUT /api/checklist — aggiorna (admin) ─────────────────────
router.put("/", requireAdmin, async (req, res) => {
  try {
    let cl = await Checklist.findOne({ active: true });
    if (!cl) {
      cl = await Checklist.create(req.body);
    } else {
      Object.assign(cl, req.body);
      await cl.save();
    }
    res.json({ checklist: cl });
  } catch (err) {
    res.status(500).json({ message: "Errore aggiornamento." });
  }
});

// ── GET /api/checklist/my-today ───────────────────────────────
router.get("/my-today", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const subs  = await ChecklistSubmission.find({ submittedBy: req.user._id, date: today }).sort("-createdAt");
    res.json({ submissions: subs });
  } catch (err) { res.status(500).json({ message: "Errore." }); }
});

// ── GET /api/checklist/submissions/today (admin/supervisore) ──
router.get("/submissions/today", requireSupervisor, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const subs  = await ChecklistSubmission.find({ date: today })
      .populate("submittedBy", "name username role").sort("-createdAt");
    res.json({ submissions: subs, date: today });
  } catch (err) { res.status(500).json({ message: "Errore." }); }
});

// ── GET /api/checklist/submissions (admin/supervisore) ─────────
router.get("/submissions", requireSupervisor, async (req, res) => {
  try {
    const { page = 1, limit = 50, date, shift, userId, month } = req.query;
    const filter = {};
    if (date)   filter.date  = date;
    if (shift)  filter.shift = shift;
    if (userId) filter.submittedBy = userId;
    if (month)  filter.date = { $regex: `^${month}` };  // YYYY-MM

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await ChecklistSubmission.countDocuments(filter);
    const subs  = await ChecklistSubmission.find(filter)
      .populate("submittedBy", "name username role")
      .sort("-date -createdAt").skip(skip).limit(parseInt(limit));

    res.json({ submissions: subs, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total/parseInt(limit)) } });
  } catch (err) { res.status(500).json({ message: "Errore." }); }
});

// ── GET /api/checklist/monthly-report (admin/supervisore) ─────
router.get("/monthly-report", requireSupervisor, async (req, res) => {
  try {
    const { month } = req.query;  // YYYY-MM
    if (!month) return res.status(400).json({ message: "Parametro month obbligatorio (YYYY-MM)" });

    const User = require("../models/User");
    const users = await User.find({ isActive: true }).select("name username role").lean();

    // Tutte le compilazioni del mese
    const subs = await ChecklistSubmission.find({ date: { $regex: `^${month}` } })
      .populate("submittedBy", "name username").lean();

    // Calcola giorni del mese
    const [year, mon] = month.split("-").map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const d = String(i + 1).padStart(2, "0");
      return `${month}-${d}`;
    });

    // Mappa compilazioni per utente e giorno
    const byUser = {};
    users.forEach(u => {
      byUser[u._id.toString()] = {
        user: u,
        days: {},
        total: 0,
        avgScore: 0,
        scores: [],
      };
    });

    subs.forEach(s => {
      const uid = s.submittedBy?._id?.toString();
      if (!uid || !byUser[uid]) return;
      if (!byUser[uid].days[s.date]) byUser[uid].days[s.date] = [];
      byUser[uid].days[s.date].push({ shift: s.shift, score: s.score, allChecked: s.allChecked, cleaningType: s.cleaningType });
      byUser[uid].total++;
      byUser[uid].scores.push(s.score);
    });

    // Calcola medie
    Object.values(byUser).forEach(u => {
      u.avgScore = u.scores.length > 0
        ? Math.round(u.scores.reduce((a, b) => a + b, 0) / u.scores.length)
        : 0;
    });

    // Statistiche globali
    const totalExpected  = users.length * daysInMonth;
    const totalCompiled  = subs.length;
    const completionRate = totalExpected > 0 ? Math.round((totalCompiled / totalExpected) * 100) : 0;

    // Distribuzione tipologie
    const cleaningDist = {};
    subs.forEach(s => {
      cleaningDist[s.cleaningType] = (cleaningDist[s.cleaningType] || 0) + 1;
    });

    // Andamento giornaliero
    const dailyTrend = days.map(d => ({
      date:  d,
      count: subs.filter(s => s.date === d).length,
      score: (() => {
        const ds = subs.filter(s => s.date === d);
        return ds.length > 0 ? Math.round(ds.reduce((a, s) => a + s.score, 0) / ds.length) : 0;
      })(),
    }));

    res.json({
      month, days, daysInMonth,
      users:          Object.values(byUser),
      stats:          { totalExpected, totalCompiled, totalMissing: totalExpected - totalCompiled, completionRate },
      cleaningDist,
      dailyTrend,
    });
  } catch (err) {
    console.error("[checklist/monthly-report]", err.message);
    res.status(500).json({ message: "Errore report mensile." });
  }
});

// ── POST /api/checklist/submit ────────────────────────────────
router.post("/submit",
  [
    body("shift").trim().notEmpty().withMessage("Seleziona il turno"),
    body("cleaningType").trim().notEmpty().withMessage("Seleziona la tipologia di pulizia"),
    body("responses").isArray({ min: 1 }).withMessage("Risposte obbligatorie"),
  ],
  validate,
  async (req, res) => {
    try {
      const { shift, cleaningType, responses, generalNote } = req.body;
      const today = new Date().toISOString().slice(0, 10);

      // Controlla duplicato turno
      const existing = await ChecklistSubmission.findOne({ submittedBy: req.user._id, date: today, shift });
      if (existing) return res.status(409).json({ message: `Hai già compilato la checklist per "${shift}" oggi.`, submission: existing });

      const cl = await Checklist.findOne({ active: true });
      if (!cl) return res.status(404).json({ message: "Checklist non trovata." });

      const totalItems   = responses.length;
      const checkedItems = responses.filter(r => r.checked).length;
      const allChecked   = checkedItems === totalItems;
      const score        = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

      const sub = await ChecklistSubmission.create({
        checklist:       cl._id,
        shift, cleaningType,
        date:            today,
        responses,
        generalNote:     generalNote || "",
        totalItems, checkedItems, allChecked, score,
        submittedBy:     req.user._id,
        submittedByName: req.user.name,
      });

      res.status(201).json({ submission: sub, allChecked, score });
    } catch (err) {
      console.error("[checklist/submit]", err.message);
      res.status(500).json({ message: "Errore invio." });
    }
  }
);

module.exports = router;
