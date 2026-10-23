/**
 * tests/andon-import.test.js
 *
 * Import del foglio di lavorazione saldatura (.xlsx) come righe Andon:
 * verifica che TUTTE le colonne vengano catturate (commessa, posizione, cliente,
 * quantità, tipologia, DN, Ø, dimensione, temp standard) usando il file reale
 * fornito dall'utente, in anteprima e in salvataggio.
 */
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");
const Department = require("../models/Department");
const ProductionEntry = require("../models/ProductionEntry");
const { parseAndonXlsx } = require("../utils/xlsxAndonImport");

jest.setTimeout(60000);
beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

const FILE = path.join(__dirname, "..", "samples", "standard-times", "TEST FOGLIO SALD.xlsx");
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function adminAgent() {
  await User.create({ username: "admin", password: "Password123!", name: "Admin", role: "admin" });
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ username: "admin", password: "Password123!" });
  return a;
}

describe("Import foglio saldatura → righe Andon", () => {
  test("il parser cattura TUTTE le colonne del file reale", async () => {
    const buf = fs.readFileSync(FILE);
    const r = await parseAndonXlsx(buf);
    expect(r.rows.length).toBe(10);
    expect(r.errors).toEqual([]);
    expect(r.sheetDate).toBe("2026-10-20");            // data nella cella unita C2:L2
    const first = r.rows[0];
    expect(first).toMatchObject({
      commessa: "2630", posizione: "1", cliente: "ENON BV",
      quantita: 1, tipologia: "T.F.", dn: "95", diametro: "10 inc.",
      dimensione: "PICCOLA", tempoStdMinuti: 60, firmaInizio: "", firmaFine: "",
    });
  });

  test("il parser legge OGNI capo del foglio, nell'ordine, senza mischiare i campi", async () => {
    const r = await parseAndonXlsx(fs.readFileSync(FILE));
    const compact = r.rows.map(x => [x.commessa, x.posizione, x.cliente, x.quantita, x.tipologia, x.dn, x.diametro, x.dimensione, x.tempoStdMinuti]);
    expect(compact).toEqual([
      ["2630", "1",  "ENON BV",                     1, "T.F.",     "95",  "10 inc.", "PICCOLA", 60],
      ["2400", "1",  "ABC",                         1, "T.I.",     "",    "10",      "PICCOLA", 30],
      ["2961", "9",  "NUOVO PIGNONE SRL",           1, "T.C.",     "193", "16",      "MEDIA",   60],
      ["2975", "1",  "HEATING GROUP INTERNATIONAL", 1, "T.F.",     "75",  "12.5",    "PICCOLA", 60],
      ["2347", "1",  "ROSSI",                       4, "Speciale", "",    "10",      "PICCOLA", 60],
      ["2810", "1",  "PEGORARO GAS TECHNOLOGIES",   3, "T.C.",     "145", "16",      "PICCOLA", 45],
      ["3009", "1",  "ROSSI",                       4, "T.I.",     "",    "10",      "PICCOLA", 30],
      ["3000", "1",  "NAVALIMPIANTI SPA",           1, "T.I.",     "",    "10",      "PICCOLA", 30],
      ["2446", "3",  "NUOVO PIGNONE SRL",           1, "T.C.",     "145", "16",      "PICCOLA", 45],
      ["1703", "17", "NUOVO PIGNONE SRL",           1, "T.C.",     "195", "16",      "MEDIA",   60],
    ]);
    expect(r.rows.map(x => x.row)).toEqual([5, 7, 9, 11, 13, 15, 17, 19, 21, 23]);
  });

  test("stesso foglio con valori grezzi (data seriale, tempi in frazione di giorno, intestazioni a capo)", async () => {
    const ExcelJS = require("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Foglio 94");
    ws.getCell("C2").value = 46315;                     // = 20/10/2026, senza formato data
    ws.getRow(3).values = [, "Firma\n(inizio lavorazione)", "Comm.", "Pos.", "Cliente", "Q.tà (n°)", "Tipologia", "DN",
      "Ø Elem.  (mm)", "Dimensione", "Temp standard\n(a pezzo)", "Firma\n(fine lavorazione)"];
    const data = [
      [2630, 1, "ENON BV", 1, "T.F.", 95, "10 inc.", "PICCOLA", 0.041666666666666664],
      [2400, 1, "ABC", 1, "T.I.", "/", 10, "PICCOLA", 0.020833333333333332],
      [2961, 9, "NUOVO PIGNONE SRL", 1, "T.C.", 193, 16, "MEDIA", 0.041666666666666664],
      [2975, 1, "HEATING GROUP INTERNATIONAL", 1, "T.F.", 75, 12.5, "PICCOLA", 0.041666666666666664],
      [2347, 1, "ROSSI", 4, "Speciale", "/", 10, "PICCOLA", 0.041666666666666664],
      [2810, 1, "PEGORARO GAS TECHNOLOGIES", 3, "T.C.", 145, 16, "PICCOLA", 0.03125],
      [3009, 1, "ROSSI", 4, "T.I.", "/", 10, "PICCOLA", 0.020833333333333332],
      [3000, 1, "NAVALIMPIANTI SPA", 1, "T.I.", "/", 10, "PICCOLA", 0.020833333333333332],
      [2446, 3, "NUOVO PIGNONE SRL", 1, "T.C.", 145, 16, "PICCOLA", 0.03125],
      [1703, 17, "NUOVO PIGNONE SRL", 1, "T.C.", 195, 16, "MEDIA", 0.041666666666666664],
    ];
    data.forEach((d, i) => { ws.getRow(5 + i * 2).values = [, , ...d]; });   // da colonna C, una riga vuota tra i capi

    const raw = await parseAndonXlsx(Buffer.from(await wb.xlsx.writeBuffer()));
    const real = await parseAndonXlsx(fs.readFileSync(FILE));
    expect(raw.errors).toEqual([]);
    expect(raw.sheetDate).toBe("2026-10-20");
    expect(raw.rows).toEqual(real.rows);                // stesso risultato del file originale, campo per campo
  });

  test("anteprima: non salva nulla", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Saldatura", isActive: true });
    const r = await a.post("/api/production/entries/import")
      .field("department", String(dep._id))
      .attach("file", fs.readFileSync(FILE), { filename: "foglio.xlsx", contentType: XLSX_MIME });
    expect(r.status).toBe(200);
    expect(r.body.preview).toBe(true);
    expect(r.body.summary.valid).toBe(10);
    expect(r.body.summary.toImport).toBe(10);
    expect(r.body.fase).toBe("Prima saldatura");       // default = prima fase
    expect(r.body.data).toBe("2026-10-20");            // data presa dal foglio
    expect(await ProductionEntry.countDocuments()).toBe(0);
  });

  test("commit: crea le righe con tutti i campi (cliente, DN, Ø)", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Saldatura", isActive: true });
    const r = await a.post("/api/production/entries/import")
      .field("department", String(dep._id))
      .field("commit", "true")
      .attach("file", fs.readFileSync(FILE), { filename: "foglio.xlsx", contentType: XLSX_MIME });
    expect(r.status).toBe(200);
    expect(r.body.summary.created).toBe(10);

    const e = await ProductionEntry.findOne({ commessa: "2630" }).lean();
    expect(e.cliente).toBe("ENON BV");
    expect(e.dn).toBe("95");
    expect(e.diametro).toBe("10 inc.");
    expect(e.custodiaLabel).toBe("T.F. PICCOLA");
    expect(e.tempoStdMinuti).toBe(60);
    expect(e.tempoImpiegatoMinuti).toBe(60);   // std × quantità(1)
    expect(e.tipologia).toBe("T.F.");
    expect(e.dimensione).toBe("PICCOLA");
    expect(e.fase).toBe("Prima saldatura");
    expect(e.data.toISOString().slice(0, 10)).toBe("2026-10-20");
    expect(await ProductionEntry.countDocuments({ fase: "Prima saldatura" })).toBe(10);
  });

  const importAs = (a, dep, fields) => {
    let req = a.post("/api/production/entries/import").field("department", String(dep._id));
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach("file", fs.readFileSync(FILE), { filename: "foglio.xlsx", contentType: XLSX_MIME });
  };

  test("reimport dello stesso foglio: nessun duplicato", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Saldatura", isActive: true });
    expect((await importAs(a, dep, { commit: "true" })).body.summary.created).toBe(10);
    const again = await importAs(a, dep, { commit: "true" });
    expect(again.body.summary).toMatchObject({ created: 0, duplicates: 10 });
    expect(await ProductionEntry.countDocuments()).toBe(10);
  });

  test("altra lavorazione: stessi capi tenuti separati per fase", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Saldatura", isActive: true });
    await importAs(a, dep, { commit: "true", fase: "Prima saldatura" });
    const second = await importAs(a, dep, { commit: "true", fase: "Seconda saldatura" });
    expect(second.body.summary.created).toBe(10);
    expect(await ProductionEntry.countDocuments({ fase: "Prima saldatura" })).toBe(10);
    expect(await ProductionEntry.countDocuments({ fase: "Seconda saldatura" })).toBe(10);

    const onlyFirst = await a.get("/api/production/entries").query({ department: String(dep._id), fase: "Prima saldatura" });
    expect(onlyFirst.body.entries).toHaveLength(10);
    expect(onlyFirst.body.entries.every(e => e.fase === "Prima saldatura")).toBe(true);
  });

  test("fase non configurata → 400, nulla salvato", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Saldatura", isActive: true });
    const r = await importAs(a, dep, { commit: "true", fase: "Verniciatura" });
    expect(r.status).toBe(400);
    expect(await ProductionEntry.countDocuments()).toBe(0);
  });
});
