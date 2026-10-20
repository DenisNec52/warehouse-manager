const request = require("supertest");
const ExcelJS = require("exceljs");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");
const Department = require("../models/Department");
const StandardTime = require("../models/StandardTime");
const { runMigrations } = require("../utils/migrations");

jest.setTimeout(60000);

beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

async function agentFor(username, role) {
  await User.create({ username, password: "Password123!", name: username, role });
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ username, password: "Password123!" });
  return agent;
}

const time = (h, m) => new Date(Date.UTC(1899, 11, 30, h, m));

/**
 * Riproduce la struttura del foglio di saldatura di reparto: data unita in alto,
 * intestazioni in riga 3 con firme ai lati, righe dati alternate a righe vuote,
 * tempo in formato h:mm.
 */
async function foglioSaldatura(righe) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Foglio 94");
  ws.mergeCells("C2:L2");
  ws.getCell("C2").value = new Date(Date.UTC(2026, 9, 20));
  ws.getRow(3).values = [null, "Firma (inizio lavorazione)", "Comm.", "Pos.", "Cliente", "Q.tà (n°)",
    "Tipologia", "DN", "Ø Elem.  (mm)", "Dimensione", "Temp standard        (a pezzo)", "Firma (fine lavorazione)"];
  righe.forEach(([tipologia, dimensione, tempo], i) => {
    const r = ws.getRow(5 + i * 2);
    r.values = [null, null, 2600 + i, 1, "CLIENTE", 1, tipologia, "/", 10, dimensione, tempo];
    if (tempo instanceof Date) r.getCell(11).numFmt = "h:mm";
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const upload = (agent, buffer, fields) => {
  let req = agent.post("/api/production/standard-times/import");
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  return req.attach("file", buffer, "foglio.xlsx");
};

let seconda, capo, op;

describe("Import tempi standard da Excel", () => {
  beforeEach(async () => {
    await runMigrations({ log: () => {} });
    seconda = await Department.findOne({ name: "Seconda Saldatura" });
    capo = await agentFor("capo", "supervisore");
    op   = await agentFor("operaio", "operatore");
  });

  test("anteprima dal foglio di saldatura: raggruppa per tipologia+dimensione, non salva nulla", async () => {
    const file = await foglioSaldatura([
      ["T.F.", "PICCOLA", time(1, 0)],
      ["T.I.", "PICCOLA", time(0, 30)],
      ["T.C.", "MEDIA", time(1, 0)],
      ["T.I.", "PICCOLA", time(0, 30)],
      ["T.C.", "PICCOLA", time(0, 45)],
    ]);
    const before = await StandardTime.countDocuments();
    const res = await upload(capo, file, { department: String(seconda._id), dryRun: "1" });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(4);
    expect(res.body.items.find(i => i.tipologia === "T.I.")).toMatchObject({
      dimensione: "PICCOLA", minuti: 30, righe: 2, label: "T.I. Piccola", action: "create",
    });
    expect(res.body.conflicts).toEqual([]);
    expect(await StandardTime.countDocuments()).toBe(before);
  });

  test("conferma: crea i nuovi, aggiorna e riattiva gli esistenti senza duplicarli", async () => {
    // Esistente con scrittura diversa (maiuscole) e un altro rimosso.
    const tf = await StandardTime.create({ department: seconda._id, tipologia: "T.F.", dimensione: "Piccola", label: "TF piccola", minuti: 50 });
    const ti = await StandardTime.create({ department: seconda._id, tipologia: "T.I.", dimensione: "PICCOLA", label: "TI", minuti: 30, isActive: false });

    const file = await foglioSaldatura([
      ["T.F.", "PICCOLA", time(1, 0)],
      ["T.I.", "PICCOLA", time(0, 30)],
      ["Speciale", "/", "1:15"],
    ]);
    const res = await upload(capo, file, { department: String(seconda._id) });

    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ creati: 1, aggiornati: 2, invariati: 0, errori: [] });

    const tfNow = await StandardTime.findById(tf._id);
    expect(tfNow).toMatchObject({ minuti: 60, label: "TF piccola", dimensione: "Piccola" });
    expect((await StandardTime.findById(ti._id)).isActive).toBe(true);
    expect(await StandardTime.findOne({ department: seconda._id, tipologia: "Speciale" }))
      .toMatchObject({ dimensione: "", minuti: 75, label: "Speciale" });

    // Reimportare lo stesso file non cambia niente.
    const again = await upload(capo, file, { department: String(seconda._id) });
    expect(again.body.result).toMatchObject({ creati: 0, aggiornati: 0, invariati: 3 });
  });

  test("stessa tipologia con tempi diversi = conflitto, non importata", async () => {
    const file = await foglioSaldatura([
      ["T.C.", "MEDIA", time(1, 0)],
      ["T.C.", "media", time(1, 15)],
      ["T.F.", "PICCOLA", time(1, 0)],
      ["T.F.", "PICCOLA", null],
    ]);
    const res = await upload(capo, file, { department: String(seconda._id) });

    expect(res.status).toBe(200);
    expect(res.body.conflicts).toHaveLength(1);
    expect(res.body.conflicts[0].valori.map(v => v.minuti).sort()).toEqual([60, 75]);
    expect(res.body.errors).toEqual([expect.objectContaining({ riga: 11, message: expect.stringContaining("tempo standard mancante") })]);
    expect(res.body.result.creati).toBe(1);
    expect(await StandardTime.findOne({ tipologia: "T.C." })).toBeNull();
  });

  test("solo supervisore/admin, file valido e colonne riconoscibili", async () => {
    const file = await foglioSaldatura([["T.F.", "PICCOLA", time(1, 0)]]);
    expect((await upload(op, file, { department: String(seconda._id) })).status).toBe(403);
    expect((await upload(capo, file, {})).status).toBe(400);

    const notExcel = await upload(capo, Buffer.from("ciao"), { department: String(seconda._id) });
    expect(notExcel.status).toBe(400);

    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("x").addRow(["Commessa", "Cliente"]);
    const noCols = await upload(capo, Buffer.from(await wb.xlsx.writeBuffer()), { department: String(seconda._id) });
    expect(noCols.status).toBe(400);
    expect(noCols.body.message).toMatch(/Tipologia/);
  });
});
