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
  {
    // Turni: nuovo campo User.shift (default null = "non assegnato"). Nessun backfill:
    // gli utenti esistenti restano senza turno e compaiono nella sezione dedicata.
    // Voce registrata solo per tracciare l'introduzione del campo.
    name: "2026-10-02-user-shift",
    async run() {
      const senzaTurno = await User.countDocuments({ shift: { $in: [null, undefined] } });
      return { senzaTurno };
    },
  },
  {
    // Firme Inizia/Finisci (iniziataAt/finitaAt): le righe già esistenti non devono
    // mostrare "Inizia" se il lavoro era già registrato.
    // - Righe inserite a mano (hanno standardTime): firmate dall'operatore, finite se hanno dataFine.
    // - Righe importate con la firma scritta nel foglio: considerate iniziate/finite.
    // Idempotente: tocca solo righe con iniziataAt/finitaAt ancora vuoti.
    name: "2026-10-24-andon-firme",
    async run() {
      const notStarted = { $or: [{ iniziataAt: null }, { iniziataAt: { $exists: false } }] };
      const notFinished = { $or: [{ finitaAt: null }, { finitaAt: { $exists: false } }] };
      const filled = (f) => ({ [f]: { $exists: true, $nin: [null, ""] } });

      const manualStart = await ProductionEntry.collection.updateMany(
        { $and: [notStarted, { standardTime: { $ne: null } }, { operatore: { $ne: null } }] },
        [{ $set: {
          iniziataDa: "$operatore", iniziataAt: "$createdAt",
          firmaInizio: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$firmaInizio", ""] } }, 0] }, "$firmaInizio", "$operatoreNome"] },
        } }],
      );
      const manualFinish = await ProductionEntry.collection.updateMany(
        { $and: [notFinished, { standardTime: { $ne: null } }, { operatore: { $ne: null } }, { dataFine: { $ne: null } }] },
        [{ $set: {
          finitaDa: "$operatore", finitaAt: "$dataFine",
          firmaFine: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$firmaFine", ""] } }, 0] }, "$firmaFine", "$operatoreNome"] },
        } }],
      );
      const sheetStart = await ProductionEntry.collection.updateMany(
        { $and: [notStarted, filled("firmaInizio")] }, [{ $set: { iniziataAt: "$createdAt" } }]);
      const sheetFinish = await ProductionEntry.collection.updateMany(
        { $and: [notFinished, filled("firmaFine")] },
        [{ $set: { finitaAt: "$createdAt", iniziataAt: { $ifNull: ["$iniziataAt", "$createdAt"] }, dataFine: { $ifNull: ["$dataFine", "$data"] } } }]);

      return {
        manualiIniziate: manualStart.modifiedCount, manualiFinite: manualFinish.modifiedCount,
        fogliIniziate: sheetStart.modifiedCount, fogliFinite: sheetFinish.modifiedCount,
      };
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
