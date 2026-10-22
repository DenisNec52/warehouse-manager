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
    const first = r.rows[0];
    expect(first).toMatchObject({
      commessa: "2630", posizione: "1", cliente: "ENON BV",
      quantita: 1, tipologia: "T.F.", dn: "95", diametro: "10 inc.",
      dimensione: "PICCOLA", tempoStdMinuti: 60,
    });
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
  });
});
