/**
 * utils/migrations.js — migrazioni dati eseguite all'avvio del server (server.js).
 *
 * Sul piano free di Render non c'è una shell per lanciare script a mano: ogni migrazione
 * gira una sola volta ed è registrata nella collezione "migrations". I passi sono
 * idempotenti, così un riavvio a metà migrazione non fa danni: il record viene scritto
 * solo alla fine.
 */
const Migration       = require("../models/Migration");
const Department      = require("../models/Department");
const StandardTime    = require("../models/StandardTime");
const ProductionEntry = require("../models/ProductionEntry");
const User            = require("../models/User");
const Notification    = require("../models/Notification");

const DEFAULT_DEPARTMENTS = ["Prima Saldatura", "Seconda Saldatura", "Finitura", "Prova Idraulica", "Riempimento"];

// Foglio "TEMPI STANDARD" della seconda saldatura (minuti per custodia).
const DEFAULT_STANDARD_TIMES = [
  { tipologia: "Custodia quadra saldata al flangiato",  dimensione: "",                     label: "Quadra saldata",  minuti: 210 },
  { tipologia: "Custodia quadra avvitata al flangiato", dimensione: "",                     label: "Quadra avvitata", minuti: 60 },
  { tipologia: "Custodia ATEX (sp.>10mm)",              dimensione: "Piccola (DN80-DN150)", label: "ATEX Piccola",    minuti: 30 },
  { tipologia: "Custodia ATEX (sp.>10mm)",              dimensione: "Media (DN200-DN300)",  label: "ATEX Media",      minuti: 45 },
  { tipologia: "Custodia ATEX (sp.>10mm)",              dimensione: "Grande (>DN400)",      label: "ATEX Grande",     minuti: 90 },
  { tipologia: "Custodia IP65 (calandrata)",            dimensione: "Piccola (DN80-DN150)", label: "IP65 Piccola",    minuti: 90 },
  { tipologia: "Custodia IP65 (calandrata)",            dimensione: "Media (DN200-DN300)",  label: "IP65 Media",      minuti: 120 },
  { tipologia: "Custodia IP65 (calandrata)",            dimensione: "Grande (>DN400)",      label: "IP65 Grande",     minuti: 150 },
  { tipologia: "Custodia NEMA",                         dimensione: "",                     label: "NEMA",            minuti: 30 },
];

const MIGRATIONS = [
  {
    name: "2026-09-30-departments",
    async run() {
      // 1. Reparti iniziali (solo quelli mancanti)
      for (const [order, name] of DEFAULT_DEPARTMENTS.entries()) {
        await Department.updateOne({ name }, { $setOnInsert: { name, order } }, { upsert: true });
      }
      const seconda = await Department.findOne({ name: "Seconda Saldatura" });

      // 2. Vecchio indice unico tipologia+dimensione: impedirebbe la stessa tipologia in reparti diversi
      try {
        await StandardTime.collection.dropIndex("tipologia_1_dimensione_1");
      } catch (err) {
        if (!["IndexNotFound", "NamespaceNotFound"].includes(err.codeName)) throw err;
      }
      await StandardTime.syncIndexes();

      // 3. Tempi standard e righe Andon esistenti -> Seconda Saldatura
      const noDept = { $or: [{ department: { $exists: false } }, { department: null }] };
      const times = await StandardTime.collection.updateMany(noDept, { $set: { department: seconda._id } });
      if (await StandardTime.countDocuments({ department: seconda._id }) === 0) {
        await StandardTime.insertMany(DEFAULT_STANDARD_TIMES.map(t => ({ ...t, department: seconda._id })));
      }
      const entries = await ProductionEntry.collection.updateMany(noDept, {
        $set: { department: seconda._id, departmentName: seconda.name },
      });

      // 4. Super-admin: l'account indicato (default "admin"), se non ce n'è già uno
      const username = (process.env.SUPER_ADMIN_USERNAME || "admin").toLowerCase();
      let superAdmin = await User.findOne({ isSuperAdmin: true }).select("username");
      if (!superAdmin) {
        superAdmin = await User.findOneAndUpdate({ username, role: "admin" }, { isSuperAdmin: true }, { new: true }).select("username");
      }
      await User.syncIndexes();

      return {
        departments: DEFAULT_DEPARTMENTS.length,
        standardTimesAssigned: times.modifiedCount,
        entriesAssigned: entries.modifiedCount,
        superAdmin: superAdmin?.username || null,
      };
    },
  },
  {
    // Gli operai vedono solo i colleghi della propria mansione: le notifiche generali dei
    // movimenti riportano il nome di chi li ha fatti, quindi passano ai soli responsabili
    name: "2026-10-01-notification-audience",
    async run() {
      const r = await Notification.updateMany({ type: "movement", userId: null }, { $set: { audience: "managers" } });
      return { notificationsForManagers: r.modifiedCount };
    },
  },
];

async function runMigrations({ log = console.log } = {}) {
  for (const m of MIGRATIONS) {
    if (await Migration.exists({ name: m.name })) continue;
    const details = await m.run();
    await Migration.create({ name: m.name, details });
    log(`[migrazione] ${m.name} completata`, details);
  }
}

module.exports = { runMigrations, DEFAULT_DEPARTMENTS, DEFAULT_STANDARD_TIMES };
