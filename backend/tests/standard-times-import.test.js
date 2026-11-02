/**
 * tests/standard-times-import.test.js
 *
 * Verifica l'import Excel dei tempi standard e, soprattutto, la rete di sicurezza
 * anti-malware: solo .xlsx veri (magic bytes), formula injection scartata,
 * estensioni/MIME non ammessi respinti, anteprima che non salva.
 */
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const ExcelJS = require("exceljs");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");
const Department  = require("../models/Department");
const StandardTime = require("../models/StandardTime");

jest.setTimeout(60000);
beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

async function adminAgent() {
  await User.create({ username: "admin", password: "Password123!", name: "Admin", role: "admin" });
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ username: "admin", password: "Password123!" });
  return a;
}

async function xlsx(rows, headers = ["Tipologia", "Dimensione", "Nome breve", "Minuti"]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Tempi");
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("Import tempi standard da Excel", () => {
  test("anteprima: legge le righe valide e NON salva nulla", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Saldatura", isActive: true });
    const buf = await xlsx([
      ["Custodia IP65 (calandrata)", "Piccola", "IP65 Piccola", 90],
      ["Custodia IP66", "", "IP66", "1:30"],
    ]);
    const r = await a.post("/api/production/standard-times/import")
      .field("department", String(dep._id))
      .attach("file", buf, { filename: "tempi.xlsx", contentType: XLSX_MIME });

    expect(r.status).toBe(200);
    expect(r.body.preview).toBe(true);
    expect(r.body.summary.valid).toBe(2);
    expect(r.body.rows[1].minuti).toBe(90);          // "1:30" convertito in minuti
    expect(await StandardTime.countDocuments()).toBe(0); // anteprima: niente salvato
  });

  test("commit=true: salva (upsert) nel reparto scelto", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Saldatura", isActive: true });
    const buf = await xlsx([["Custodia IP65", "Piccola", "IP65 P", 90]]);
    const r = await a.post("/api/production/standard-times/import")
      .field("department", String(dep._id))
      .field("commit", "true")
      .attach("file", buf, { filename: "tempi.xlsx", contentType: XLSX_MIME });

    expect(r.status).toBe(200);
    expect(r.body.summary.created).toBe(1);
    expect(await StandardTime.countDocuments({ department: dep._id })).toBe(1);
  });

  test("formula injection: una cella che inizia con '=' viene scartata, non salvata", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Saldatura", isActive: true });
    const buf = await xlsx([["=HYPERLINK(\"http://evil\")", "", "X", 60]]);
    const r = await a.post("/api/production/standard-times/import")
      .field("department", String(dep._id))
      .attach("file", buf, { filename: "tempi.xlsx", contentType: XLSX_MIME });

    expect(r.status).toBe(200);
    expect(r.body.summary.valid).toBe(0);
    expect(r.body.errors.length).toBeGreaterThanOrEqual(1);
  });

  test("magic bytes: un file NON-xlsx rinominato .xlsx viene respinto", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Saldatura", isActive: true });
    const fake = Buffer.from("Questo non è un vero Excel, è testo mascherato.");
    const r = await a.post("/api/production/standard-times/import")
      .field("department", String(dep._id))
      .attach("file", fake, { filename: "malware.xlsx", contentType: XLSX_MIME });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/vero file Excel|non riconosciuto/i);
  });

  test("estensione non ammessa (.xls / .exe) viene respinta", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Saldatura", isActive: true });
    for (const filename of ["vecchio.xls", "virus.exe"]) {
      const r = await a.post("/api/production/standard-times/import")
        .field("department", String(dep._id))
        .attach("file", Buffer.from("a,b,c"), { filename, contentType: "application/octet-stream" });
      expect(r.status).toBe(400);
    }
  });

  test("un binario travestito da .csv (zip/exe) viene respinto", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Saldatura", isActive: true });
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("Tipologia;Minuti\nX;10\n")]);
    const r = await a.post("/api/production/standard-times/import")
      .field("department", String(dep._id))
      .attach("file", zip, { filename: "tempi.csv", contentType: "text/csv" });
    expect(r.status).toBe(400);
    expect(await StandardTime.countDocuments()).toBe(0);
  });
});

// ── Foglio di lavorazione Prima Saldatura: una riga = un pezzo ──────────────────
const REAL = path.join(__dirname, "..", "samples", "standard-times", "TEST FOGLIO SALD.xlsx");
const importFile = (a, dep, buf, { commit = false, filename = "foglio.xlsx", type = XLSX_MIME } = {}) =>
  a.post("/api/production/standard-times/import")
    .field("department", String(dep._id)).field("commit", String(commit))
    .attach("file", buf, { filename, contentType: type });

describe("Tempi standard per pezzo dal foglio di lavorazione", () => {
  test("estrae TUTTE le righe del foglio reale con TUTTI i campi (un tempo per pezzo)", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Prima Saldatura", isActive: true });
    const r = await importFile(a, dep, fs.readFileSync(REAL), { commit: true });

    expect(r.status).toBe(200);
    expect(r.body.errors).toEqual([]);
    expect(r.body.summary.created).toBe(10);
    const saved = await StandardTime.find({ department: dep._id }).sort({ commessa: 1 }).lean();
    expect(saved).toHaveLength(10);
    const p = saved.find((s) => s.commessa === "2630");
    expect(p).toMatchObject({ posizione: "1", cliente: "ENON BV", quantita: 1, tipologia: "T.F.",
      dn: "95", diametro: "10 inc.", dimensione: "PICCOLA", minuti: 60 });
    expect(saved.find((s) => s.commessa === "2400")).toMatchObject({ dn: "", diametro: "10", minuti: 30 }); // "/" = vuoto
    expect(saved.find((s) => s.commessa === "1703")).toMatchObject({ posizione: "17", dimensione: "MEDIA", dn: "195" });
    expect(saved.filter((s) => s.tipologia === "T.I." && s.dimensione === "PICCOLA")).toHaveLength(3); // 3 pezzi distinti
  });

  test("ricaricare lo stesso file non duplica nulla: tutto 'invariato'", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Prima Saldatura", isActive: true });
    await importFile(a, dep, fs.readFileSync(REAL), { commit: true });
    const again = await importFile(a, dep, fs.readFileSync(REAL));
    expect(again.body.summary).toMatchObject({ valid: 10, nuovi: 0, aggiornati: 0, invariati: 10 });
    const saved = await importFile(a, dep, fs.readFileSync(REAL), { commit: true });
    expect(saved.body.summary).toMatchObject({ created: 0, updated: 0, unchanged: 10 });
    expect(await StandardTime.countDocuments({ department: dep._id })).toBe(10);
  });

  test("un pezzo con dati cambiati viene AGGIORNATO, uno nuovo AGGIUNTO, gli altri restano", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Prima Saldatura", isActive: true });
    await importFile(a, dep, fs.readFileSync(REAL), { commit: true });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(REAL);
    const ws = wb.worksheets[0];
    // 2630/1: 1:00 → 1:15. La cella ha il formato orario del foglio: si scrive come
    // frazione di giorno, esattamente come quando in Excel si digita "1:15".
    ws.getCell("K5").value = 75 / 1440;
    ws.getRow(25).values = [undefined, "", "4000", 2, "NUOVO CLIENTE", 3, "T.C.", 120, 16, "MEDIA", 50];
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const prev = await importFile(a, dep, buf);
    expect(prev.body.summary).toMatchObject({ nuovi: 1, aggiornati: 1, invariati: 9 });
    const changed = prev.body.rows.find((r) => r.commessa === "2630");
    expect(changed.status).toBe("aggiornato");
    expect(changed.changes).toEqual(["minuti"]);
    expect(changed.before).toEqual({ minuti: 60 });

    const done = await importFile(a, dep, buf, { commit: true });
    expect(done.body.summary).toMatchObject({ created: 1, updated: 1, unchanged: 9 });
    expect((await StandardTime.findOne({ department: dep._id, commessa: "2630" })).minuti).toBe(75);
    expect(await StandardTime.countDocuments({ department: dep._id })).toBe(11);
  });

  test("non entra in conflitto con i tempi di un altro reparto (Seconda Saldatura)", async () => {
    const a = await adminAgent();
    const prima = await Department.create({ name: "Prima Saldatura", isActive: true });
    const seconda = await Department.create({ name: "Seconda Saldatura", isActive: true });
    await StandardTime.create({ department: seconda._id, tipologia: "T.F.", dimensione: "PICCOLA", label: "T.F. P", minuti: 999 });

    const r = await importFile(a, prima, fs.readFileSync(REAL), { commit: true });
    expect(r.body.summary.created).toBe(10);
    const other = await StandardTime.find({ department: seconda._id }).lean();
    expect(other).toHaveLength(1);
    expect(other[0].minuti).toBe(999);                     // non toccato
  });

  test("CSV (separatore ; e codifica di Excel italiano) equivalente al foglio", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Prima Saldatura", isActive: true });
    const csv = [
      ";20/10/2026;;;;;;;;;",
      "Firma (inizio lavorazione);Comm.;Pos.;Cliente;Q.tà (n°);Tipologia;DN;Ø Elem.  (mm);Dimensione;Temp standard (a pezzo);Firma (fine lavorazione)",
      ";;;;;;;;;;",
      ";2630;1;ENON BV;1;T.F.;95;10 inc.;PICCOLA;01:00:00;",
      ";2975;1;\"HEATING GROUP; INTERNATIONAL\";1;T.F.;75;12,5;PICCOLA;1:00;",
      ";2810;1;PEGORARO;3;T.C.;145;16;PICCOLA;0:45;",
    ].join("\r\n");
    const buf = Buffer.from(csv, "latin1");                 // Ø, à, ° in Windows-1252, come li salva Excel
    const r = await importFile(a, dep, buf, { commit: true, filename: "foglio.csv", type: "text/csv" });

    expect(r.status).toBe(200);
    expect(r.body.errors).toEqual([]);
    expect(r.body.summary.created).toBe(3);
    const s = await StandardTime.findOne({ department: dep._id, commessa: "2975" }).lean();
    expect(s).toMatchObject({ cliente: "HEATING GROUP; INTERNATIONAL", diametro: "12,5", minuti: 60 });
    expect((await StandardTime.findOne({ commessa: "2810" })).minuti).toBe(45);
  });

  test("modificare a mano solo il tempo di un pezzo importato NON cancella commessa, cliente, DN…", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Prima Saldatura", isActive: true });
    await importFile(a, dep, fs.readFileSync(REAL), { commit: true });
    const p = await StandardTime.findOne({ department: dep._id, commessa: "2630" }).lean();
    const r = await a.put(`/api/production/standard-times/${p._id}`)
      .send({ tipologia: p.tipologia, dimensione: p.dimensione, label: p.label, minuti: 70 });
    expect(r.status).toBe(200);
    expect(r.body.standardTime).toMatchObject({ minuti: 70, commessa: "2630", posizione: "1", cliente: "ENON BV", dn: "95", diametro: "10 inc.", quantita: 1 });
  });

  test("CSV UTF-8 con BOM (\"CSV UTF-8\" di Excel): intestazione riconosciuta, BOM non finisce nei dati", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Prima Saldatura", isActive: true });
    const csv = "﻿Comm.;Pos.;Tipologia;Dimensione;Temp standard\r\nFEFF-1;1;T.F.;PICCOLA;1:00\r\n";
    const r = await importFile(a, dep, Buffer.from(csv, "utf8"), { commit: true, filename: "foglio.csv", type: "text/csv" });
    expect(r.status).toBe(200);
    expect(r.body.errors).toEqual([]);
    // la commessa che inizia con "FEFF" deve restare intatta (nessuna sostituzione testuale del BOM)
    expect(await StandardTime.findOne({ department: dep._id }).lean()).toMatchObject({ commessa: "FEFF-1", minuti: 60 });
  });

  test("lo stesso pezzo due volte nel file con dati diversi è un CONFLITTO, non viene scelto a caso", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Prima Saldatura", isActive: true });
    const buf = await xlsx(
      [["2630", "1", "T.F.", "PICCOLA", 60], ["2630", "1", "T.F.", "PICCOLA", 90], ["2400", "1", "T.I.", "PICCOLA", 30], ["2400", "1", "T.I.", "PICCOLA", 30]],
      ["Comm.", "Pos.", "Tipologia", "Dimensione", "Temp standard"],
    );
    const r = await importFile(a, dep, buf);
    expect(r.body.summary).toMatchObject({ valid: 2, errors: 1, duplicates: 1 });   // 2400 ripetuta identica: unita
    expect(r.body.errors[0].message).toMatch(/Conflitto: la commessa 2630 pos\. 1/);
  });

  test("un operatore non può importare (serve supervisore/admin)", async () => {
    await User.create({ username: "oper", password: "Password123!", name: "Op", role: "operatore" });
    const a = request.agent(app);
    await a.post("/api/auth/login").send({ username: "oper", password: "Password123!" });
    const dep = await Department.create({ name: "Saldatura", isActive: true });
    const buf = await xlsx([["Custodia IP65", "P", "IP65 P", 90]]);
    const r = await a.post("/api/production/standard-times/import")
      .field("department", String(dep._id))
      .attach("file", buf, { filename: "tempi.xlsx", contentType: XLSX_MIME });

    expect(r.status).toBe(403);
  });
});
