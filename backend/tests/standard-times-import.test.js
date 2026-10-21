/**
 * tests/standard-times-import.test.js
 *
 * Verifica l'import Excel dei tempi standard e, soprattutto, la rete di sicurezza
 * anti-malware: solo .xlsx veri (magic bytes), formula injection scartata,
 * estensioni/MIME non ammessi respinti, anteprima che non salva.
 */
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

  test("estensione non ammessa (.csv) viene respinta", async () => {
    const a = await adminAgent();
    const dep = await Department.create({ name: "Saldatura", isActive: true });
    const r = await a.post("/api/production/standard-times/import")
      .field("department", String(dep._id))
      .attach("file", Buffer.from("a,b,c"), { filename: "dati.csv", contentType: "text/csv" });

    expect(r.status).toBe(400);
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
