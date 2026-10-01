const request = require("supertest");
const JSZip = require("jszip");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");
const Department = require("../models/Department");
const { runMigrations } = require("../utils/migrations");
const { resolvePeriod, trendDirection } = require("../utils/reportPeriod");

jest.setTimeout(60000);

beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

describe("utils/reportPeriod", () => {
  test("settimana da lunedì a domenica, anche a cavallo di mese", () => {
    expect(resolvePeriod("settimana", "2026-09-30")).toMatchObject({ from: "2026-09-28", to: "2026-10-04" });
    expect(resolvePeriod("settimana", "2026-10-04")).toMatchObject({ from: "2026-09-28", to: "2026-10-04" }); // domenica
  });
  test("mese dal primo all'ultimo giorno (anche febbraio bisestile)", () => {
    expect(resolvePeriod("mese", "2026-09-15")).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(resolvePeriod("mese", "2028-02-10")).toMatchObject({ from: "2028-02-01", to: "2028-02-29" });
  });
  test("giorno: il trend usa gli ultimi 7 giorni fino alla data", () => {
    expect(resolvePeriod("giorno", "2026-09-30")).toMatchObject({ from: "2026-09-30", to: "2026-09-30", trend: { from: "2026-09-24", to: "2026-09-30" } });
  });
  test("direzione del trend: rialzo, ribasso, stabile (i giorni vuoti non contano)", () => {
    expect(trendDirection([80, null, 90, 100]).direction).toBe("rialzo");
    expect(trendDirection([110, 100, 90]).direction).toBe("ribasso");
    expect(trendDirection([100, 100.2, 100]).direction).toBe("stabile");
    expect(trendDirection([100]).direction).toBe("stabile");
  });
});

async function agentFor(username, role, extra = {}) {
  await User.create({ username, password: "Password123!", name: username, role, ...extra });
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ username, password: "Password123!" });
  return agent;
}
const binary = (res, cb) => { const chunks = []; res.on("data", (c) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks))); };

describe("GET /api/production/report e /export", () => {
  let seconda, prima, capo, op;
  beforeEach(async () => {
    await runMigrations({ log: () => {} });
    seconda = await Department.findOne({ name: "Seconda Saldatura" });
    prima = await Department.findOne({ name: "Prima Saldatura" });
    capo = await agentFor("capo", "supervisore");
    op = await agentFor("luigi", "operatore", { departments: [prima._id] });
    const std = (await capo.get(`/api/production/standard-times?department=${seconda._id}`)).body.standardTimes[0];
    // lunedì 28/09 efficienza 80%, mercoledì 30/09 100%, venerdì 02/10 120%; 05/10 è nella settimana dopo
    for (const [data, eff] of [["2026-09-28", 0.8], ["2026-09-30", 1.0], ["2026-10-02", 1.2], ["2026-10-05", 1.0]]) {
      const r = await capo.post("/api/production/entries").send({
        department: String(seconda._id), data, commessa: "1", quantita: 1, standardTime: std._id,
        tempoImpiegatoMinuti: Math.round(std.minuti / eff),
      });
      expect(r.status).toBe(201);
    }
  });

  const q = (extra = "") => `period=settimana&date=2026-09-30&department=${seconda._id}${extra}`;

  test("report settimanale: solo le righe della settimana, andamento giorno per giorno e trend in rialzo", async () => {
    const res = await capo.get(`/api/production/report?${q()}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ from: "2026-09-28", to: "2026-10-04" });
    expect(res.body.totale.righe).toBe(3);
    expect(res.body.andamento).toHaveLength(7);
    expect(res.body.andamento.filter((d) => d.efficienza != null)).toHaveLength(3);
    expect(res.body.trend.direction).toBe("rialzo");
    expect(res.body.perTipologia).toHaveLength(1);
  });

  test("validazione: periodo e data obbligatori e validi", async () => {
    expect((await capo.get(`/api/production/report?period=anno&date=2026-09-30`)).status).toBe(400);
    expect((await capo.get(`/api/production/report?period=mese&date=30/09/2026`)).status).toBe(400);
    expect((await capo.get(`/api/production/export?${q("&charts=2")}`)).status).toBe(400);
  });

  test("un operatore non può esportare un reparto che non vede (403)", async () => {
    expect((await op.get(`/api/production/report?${q()}`)).status).toBe(403);
    expect((await op.get(`/api/production/export?${q("&charts=1")}`)).status).toBe(403);
  });

  test("Excel: con charts=1 contiene 3 grafici nativi collegati al Riepilogo, con charts=0 nessuno", async () => {
    const withCharts = await capo.get(`/api/production/export?${q("&charts=1")}`).buffer(true).parse(binary);
    expect(withCharts.status).toBe(200);
    expect(withCharts.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(withCharts.headers["content-disposition"]).toContain("andon_seconda-saldatura_settimana_2026-09-28.xlsx");
    const zip = await JSZip.loadAsync(withCharts.body);
    const charts = Object.keys(zip.files).filter((f) => /^xl\/charts\/chart\d\.xml$/.test(f)).sort();
    expect(charts).toHaveLength(3);
    const xml = await Promise.all(charts.map((f) => zip.file(f).async("string")));
    expect(xml[0]).toContain("<c:barChart>");
    expect(xml[1]).toContain("<c:pieChart>");
    expect(xml[2]).toContain("<c:lineChart>");
    expect(xml[2]).toContain('<c:trendlineType val="linear"/>');
    expect(xml[2]).toContain("16A34A");                       // verde: trend in rialzo
    expect(await zip.file("[Content_Types].xml").async("string")).toContain("drawingml.chart+xml");
    expect(await zip.file("xl/worksheets/sheet1.xml").async("string")).toMatch(/<drawing r:id="rId\d+"\/><\/worksheet>/);

    const dataOnly = await capo.get(`/api/production/export?${q("&charts=0")}`).buffer(true).parse(binary);
    const zip0 = await JSZip.loadAsync(dataOnly.body);
    expect(Object.keys(zip0.files).some((f) => f.startsWith("xl/charts/"))).toBe(false);
  });
});
