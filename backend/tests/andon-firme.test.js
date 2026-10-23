/**
 * tests/andon-firme.test.js
 *
 * Firme di inizio/fine sulle righe Andon, oltre a Inizia/Finisci (vedi andon-import.test.js):
 * righe inserite a mano già firmate, super-admin nascosto anche nelle firme, migrazione
 * delle righe esistenti ed export Excel con tutte le colonne del foglio saldatura.
 */
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const ExcelJS = require("exceljs");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");
const Department = require("../models/Department");
const StandardTime = require("../models/StandardTime");
const ProductionEntry = require("../models/ProductionEntry");
const Migration = require("../models/Migration");
const { runMigrations } = require("../utils/migrations");

jest.setTimeout(60000);
beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

const FILE = path.join(__dirname, "..", "samples", "standard-times", "TEST FOGLIO SALD.xlsx");
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const binary = (res, cb) => { const chunks = []; res.on("data", (c) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks))); };

async function agentFor(username, role, extra = {}) {
  await User.create({ username, password: "Password123!", name: extra.name || username, role, ...extra });
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ username, password: "Password123!" });
  return a;
}

describe("Firme automatiche Andon", () => {
  let dep;
  beforeEach(async () => { dep = await Department.create({ name: "Saldatura", isActive: true }); });

  test("riga inserita a mano: già firmata da chi la registra (e finita se ha la data fine)", async () => {
    const op = await agentFor("mario", "operatore", { name: "Mario Rossi", departments: [dep._id] });
    const std = await StandardTime.create({ department: dep._id, tipologia: "T.F.", dimensione: "PICCOLA", label: "T.F. PICCOLA", minuti: 60 });
    const base = { department: String(dep._id), data: "2026-10-20", commessa: "2630", quantita: 1, standardTime: String(std._id), tempoImpiegatoMinuti: 60 };

    const aperta = await op.post("/api/production/entries").send(base);
    expect(aperta.status).toBe(201);
    expect(aperta.body.entry).toMatchObject({ firmaInizio: "Mario Rossi", firmaFine: "" });
    expect(aperta.body.entry.iniziataAt).toBeTruthy();
    expect(aperta.body.entry.finitaAt).toBeNull();

    const chiusa = await op.post("/api/production/entries").send({ ...base, commessa: "2400", dataFine: "2026-10-21" });
    expect(chiusa.body.entry).toMatchObject({ firmaInizio: "Mario Rossi", firmaFine: "Mario Rossi" });
    expect(chiusa.body.entry.finitaAt).toBeTruthy();
  });

  test("riga inserita a mano: cliente, DN, Ø e tipologia/grandezza separate dalla tabella tempi", async () => {
    const op = await agentFor("mario", "operatore", { departments: [dep._id] });
    const std = await StandardTime.create({ department: dep._id, tipologia: "T.C.", dimensione: "MEDIA", label: "T.C. MEDIA", minuti: 60 });
    const r = await op.post("/api/production/entries").send({
      department: String(dep._id), data: "2026-10-20", commessa: "2961", posizione: "9", quantita: 1,
      standardTime: String(std._id), tempoImpiegatoMinuti: 60, cliente: "NUOVO PIGNONE SRL", dn: "193", diametro: "16",
    });
    expect(r.status).toBe(201);
    expect(r.body.entry).toMatchObject({ cliente: "NUOVO PIGNONE SRL", dn: "193", diametro: "16", tipologia: "T.C.", dimensione: "MEDIA" });
  });

  test("riga importata dal foglio: si può modificare (es. tempo impiegato) senza perdere i dati del foglio", async () => {
    const capo = await agentFor("capo", "supervisore");
    await capo.post("/api/production/entries/import")
      .field("department", String(dep._id)).field("commit", "true")
      .attach("file", fs.readFileSync(FILE), { filename: "foglio.xlsx", contentType: XLSX_MIME });
    const e = await ProductionEntry.findOne({ commessa: "2810" }).lean();     // 3 pz × 45 min
    const r = await capo.put(`/api/production/entries/${e._id}`).send({
      data: "2026-10-20", commessa: e.commessa, posizione: e.posizione, quantita: 3, standardTime: "",
      tempoImpiegatoMinuti: 150, cliente: e.cliente, dn: e.dn, diametro: e.diametro,
    });
    expect(r.status).toBe(200);
    expect(r.body.entry).toMatchObject({
      tempoImpiegatoMinuti: 150, tempoStdMinuti: 45, tipologia: "T.C.", dimensione: "PICCOLA",
      custodiaLabel: "T.C. PICCOLA", cliente: "PEGORARO GAS TECHNOLOGIES", dn: "145", diametro: "16",
    });
    // Una riga a catalogo invece deve avere la tipologia
    const std = await StandardTime.create({ department: dep._id, tipologia: "X", dimensione: "", label: "X", minuti: 10 });
    const man = await capo.post("/api/production/entries").send({ department: String(dep._id), data: "2026-10-20", commessa: "1", quantita: 1, standardTime: String(std._id), tempoImpiegatoMinuti: 10 });
    const bad = await capo.put(`/api/production/entries/${man.body.entry._id}`).send({ data: "2026-10-20", commessa: "1", quantita: 1, standardTime: "", tempoImpiegatoMinuti: 10 });
    expect(bad.status).toBe(400);
  });

  test("super-admin nascosto anche nelle firme di inizio e fine", async () => {
    const root = await agentFor("root", "admin", { name: "Root Segreto", isSuperAdmin: true });
    const capo = await agentFor("capo", "supervisore", { name: "Capo" });
    await root.post("/api/production/entries/import")
      .field("department", String(dep._id)).field("commit", "true")
      .attach("file", fs.readFileSync(FILE), { filename: "foglio.xlsx", contentType: XLSX_MIME });
    const e = await ProductionEntry.findOne({ commessa: "2630" }).lean();
    await root.post(`/api/production/entries/${e._id}/start`);
    await root.post(`/api/production/entries/${e._id}/finish`);

    const visti = (await capo.get("/api/production/entries").query({ department: String(dep._id), from: "2026-10-01", to: "2026-10-31" })).body.entries;
    const riga = visti.find(x => x.commessa === "2630");
    expect(riga).toMatchObject({ firmaInizio: "Altro operatore", firmaFine: "Altro operatore", operatoreNome: "Altro operatore" });
    expect(JSON.stringify(visti)).not.toContain("Root Segreto");

    const suoi = (await root.get("/api/production/entries").query({ department: String(dep._id), from: "2026-10-01", to: "2026-10-31" })).body.entries;
    expect(suoi.find(x => x.commessa === "2630").firmaInizio).toBe("Root Segreto");   // lui vede sé stesso
  });

  test("migrazione: righe esistenti a mano risultano firmate, quelle con firma scritta nel foglio iniziate/finite", async () => {
    await runMigrations({ log: () => {} });
    const u = await User.create({ username: "vec", password: "Password123!", name: "Vecchio Op", role: "operatore" });
    const std = await StandardTime.create({ department: dep._id, tipologia: "T.C.", dimensione: "MEDIA", label: "T.C. MEDIA", minuti: 60 });
    const comuni = { department: dep._id, data: new Date("2026-10-10"), quantita: 1, custodiaLabel: "T.C. MEDIA", tempoStdMinuti: 60, tempoImpiegatoMinuti: 60 };
    // Righe "di prima": inserite senza i campi nuovi, come nel database di produzione
    await ProductionEntry.collection.insertMany([
      { ...comuni, commessa: "M1", standardTime: std._id, operatore: u._id, operatoreNome: "Vecchio Op", dataFine: new Date("2026-10-11"), createdAt: new Date("2026-10-10T08:00:00Z") },
      { ...comuni, commessa: "M2", standardTime: std._id, operatore: u._id, operatoreNome: "Vecchio Op", dataFine: null, createdAt: new Date("2026-10-10T08:00:00Z") },
      { ...comuni, commessa: "F1", standardTime: null, operatore: null, firmaInizio: "GIANNI", firmaFine: "PINO", createdAt: new Date("2026-10-10T08:00:00Z") },
      { ...comuni, commessa: "F2", standardTime: null, operatore: null, firmaInizio: "", firmaFine: "", createdAt: new Date("2026-10-10T08:00:00Z") },
    ]);
    await Migration.deleteOne({ name: "2026-10-24-andon-firme" });
    await runMigrations({ log: () => {} });

    const by = async (c) => ProductionEntry.findOne({ commessa: c }).lean();
    expect(await by("M1")).toMatchObject({ firmaInizio: "Vecchio Op", firmaFine: "Vecchio Op" });
    expect((await by("M1")).finitaAt).toBeTruthy();
    expect(await by("M2")).toMatchObject({ firmaInizio: "Vecchio Op" });
    expect((await by("M2")).finitaAt ?? null).toBeNull();
    const f1 = await by("F1");
    expect(f1).toMatchObject({ firmaInizio: "GIANNI", firmaFine: "PINO" });
    expect(f1.iniziataAt && f1.finitaAt && f1.dataFine).toBeTruthy();
    expect((await by("F2")).iniziataAt ?? null).toBeNull();               // da iniziare: mostra "Inizia"
  });

  test("export Excel: foglio Dati con le colonne del foglio saldatura e le firme", async () => {
    const capo = await agentFor("capo", "supervisore", { name: "Capo Reparto" });
    await capo.post("/api/production/entries/import")
      .field("department", String(dep._id)).field("commit", "true")
      .attach("file", fs.readFileSync(FILE), { filename: "foglio.xlsx", contentType: XLSX_MIME });
    const e = await ProductionEntry.findOne({ commessa: "2961" }).lean();
    await capo.post(`/api/production/entries/${e._id}/start`);

    const res = await capo.get(`/api/production/export?period=settimana&date=2026-10-20&department=${dep._id}&charts=0`).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const ws = wb.getWorksheet("Dati");
    const header = ws.getRow(1).values.slice(1);
    expect(header).toEqual(expect.arrayContaining(["Comm.", "Pos.", "Cliente", "Q.tà (n°)", "Tipologia", "DN", "Ø Elem. (mm)", "Grandezza", "Firma inizio", "Firma fine"]));
    const col = (h) => header.indexOf(h) + 1;
    const rows = [];
    ws.eachRow((r, n) => { if (n > 1) rows.push(r); });
    expect(rows).toHaveLength(10);
    const r2961 = rows.find(r => String(r.getCell(col("Comm.")).value) === "2961");
    expect(r2961.getCell(col("Cliente")).value).toBe("NUOVO PIGNONE SRL");
    expect(r2961.getCell(col("DN")).value).toBe("193");
    expect(r2961.getCell(col("Ø Elem. (mm)")).value).toBe("16");
    expect(r2961.getCell(col("Grandezza")).value).toBe("MEDIA");
    expect(r2961.getCell(col("Tipologia")).value).toBe("T.C.");
    expect(r2961.getCell(col("Firma inizio")).value).toBe("Capo Reparto");
    expect(r2961.getCell(col("Ora inizio")).value).toBeInstanceOf(Date);
  });
});
