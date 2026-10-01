const request = require("supertest");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");
const Department = require("../models/Department");
const { runMigrations } = require("../utils/migrations");

jest.setTimeout(60000);

beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

async function agentFor(username, role, name) {
  await User.create({ username, password: "Password123!", name, role });
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ username, password: "Password123!" });
  return agent;
}

async function stdId(agent, label) {
  const r = await agent.get("/api/production/standard-times");
  return r.body.standardTimes.find(t => t.label === label)._id;
}

const userId = async (username) => (await User.findOne({ username }))._id.toString();

let seconda;   // reparto dei 9 tempi del foglio (assegnati dalla migrazione)
const entryBody = (overrides) => ({
  department: String(seconda._id),
  data: "2026-09-25",
  commessa: "2631",
  posizione: "1",
  quantita: 6,
  tempoImpiegatoMinuti: 300,
  ...overrides,
});

let capo, op1, op2;

describe("Produzione saldatura (Andon Board)", () => {
  beforeEach(async () => {
    await runMigrations({ log: () => {} });
    seconda = await Department.findOne({ name: "Seconda Saldatura" });
    capo = await agentFor("capo", "supervisore", "Capo Reparto");
    op1  = await agentFor("alessandro", "operatore", "Alessandro");
    op2  = await agentFor("denis", "operatore", "Denis");
  });

  test("la migrazione assegna i 9 tempi del foglio a Seconda Saldatura, senza duplicarli", async () => {
    const res1 = await op1.get("/api/production/standard-times");
    expect(res1.body.standardTimes).toHaveLength(9);
    expect(res1.body.standardTimes.find(t => t.label === "IP65 Piccola").minuti).toBe(90);

    const res2 = await op1.get("/api/production/standard-times");
    expect(res2.body.standardTimes).toHaveLength(9);
  });

  test("solo supervisore/admin gestiscono i tempi standard", async () => {
    const body = { department: String(seconda._id), tipologia: "Custodia prova", dimensione: "", label: "Prova", minuti: 40 };
    expect((await op1.post("/api/production/standard-times").send(body)).status).toBe(403);
    expect((await capo.post("/api/production/standard-times").send(body)).status).toBe(201);
    expect((await capo.post("/api/production/standard-times").send(body)).status).toBe(409);
    expect((await capo.post("/api/production/standard-times").send({ ...body, label: "Zero", minuti: 0 })).status).toBe(400);
  });

  test("esempio del foglio: 6 pezzi IP65 Piccola -> atteso 9 ore", async () => {
    const id  = await stdId(op1, "IP65 Piccola");
    const res = await op1.post("/api/production/entries").send(entryBody({ standardTime: id }));
    expect(res.status).toBe(201);
    expect(res.body.entry).toMatchObject({
      tempoStdMinuti: 90, tempoAttesoMinuti: 540, operatoreNome: "Alessandro", custodiaLabel: "IP65 Piccola",
    });
  });

  test("cambiare la tabella non riscrive lo storico, nemmeno modificando la riga", async () => {
    const id = await stdId(op1, "IP65 Piccola");
    await op1.post("/api/production/entries").send(entryBody({ standardTime: id }));

    await capo.put(`/api/production/standard-times/${id}`).send({
      department: String(seconda._id),
      tipologia: "Custodia IP65 (calandrata)", dimensione: "Piccola (DN80-DN150)", label: "IP65 Piccola", minuti: 120,
    });

    const list = await op1.get("/api/production/entries?from=2026-09-25&to=2026-09-25");
    expect(list.body.entries[0].tempoStdMinuti).toBe(90);

    const resPut = await op1.put(`/api/production/entries/${list.body.entries[0]._id}`).send(entryBody({ standardTime: id, quantita: 7 }));
    expect(resPut.body.entry.tempoStdMinuti).toBe(90);
    expect(resPut.body.entry.tempoAttesoMinuti).toBe(630);
  });

  test("una tipologia disattivata resta modificabile sulle righe esistenti ma non per quelle nuove", async () => {
    const id = await stdId(op1, "IP65 Piccola");
    const created = await op1.post("/api/production/entries").send(entryBody({ standardTime: id }));

    await capo.delete(`/api/production/standard-times/${id}`);

    expect((await op1.put(`/api/production/entries/${created.body.entry._id}`).send(entryBody({ standardTime: id }))).status).toBe(200);
    expect((await op1.post("/api/production/entries").send(entryBody({ standardTime: id }))).status).toBe(400);
  });

  test("un operatore gestisce solo le proprie righe, il supervisore quelle di tutti", async () => {
    const id = await stdId(op1, "IP65 Piccola");
    const created = await op1.post("/api/production/entries").send(entryBody({ standardTime: id }));
    const entryId = created.body.entry._id;
    const alessandroId = await userId("alessandro");

    expect((await op2.put(`/api/production/entries/${entryId}`).send(entryBody({ standardTime: id }))).status).toBe(403);
    expect((await op2.delete(`/api/production/entries/${entryId}`)).status).toBe(403);
    expect((await op2.post("/api/production/entries").send(entryBody({ standardTime: id, operatore: alessandroId }))).status).toBe(403);

    const byCapo = await capo.post("/api/production/entries").send(entryBody({ standardTime: id, operatore: alessandroId }));
    expect(byCapo.status).toBe(201);
    expect(byCapo.body.entry.operatoreNome).toBe("Alessandro");

    expect((await op1.delete(`/api/production/entries/${entryId}`)).status).toBe(200);
  });

  test("rifiuta quantità nulla e date in formato non ISO", async () => {
    const id = await stdId(op1, "IP65 Piccola");
    expect((await op1.post("/api/production/entries").send(entryBody({ standardTime: id, quantita: 0 }))).status).toBe(400);
    expect((await op1.post("/api/production/entries").send(entryBody({ standardTime: id, data: "25/09/2026" }))).status).toBe(400);
  });

  test("statistiche: atteso vs impiegato, efficienza per operatore e periodo vuoto", async () => {
    const id = await stdId(op1, "IP65 Piccola");
    await op1.post("/api/production/entries").send(entryBody({ standardTime: id, tempoImpiegatoMinuti: 320 }));
    await op2.post("/api/production/entries").send(entryBody({ standardTime: id, quantita: 5, tempoImpiegatoMinuti: 300 }));

    // Il supervisore vede tutti gli operai: totali e per operatore
    const res = await capo.get("/api/production/stats?from=2026-09-25&to=2026-09-25");
    expect(res.body.totale).toMatchObject({ righe: 2, pezzi: 11, attesoMinuti: 990, impiegatoMinuti: 620, efficienza: 1.6 });
    // Un operaio senza reparto assegnato vede solo le proprie righe (nessun collega di mansione)
    const own = await op1.get("/api/production/stats?from=2026-09-25&to=2026-09-25");
    expect(own.body.totale).toMatchObject({ righe: 1, pezzi: 6 });
    expect(own.body.perOperatore.map(o => o.nome)).toEqual(["Alessandro"]);
    expect(res.body.perOperatore.find(o => o.nome === "Alessandro").efficienza).toBe(1.69);
    expect(res.body.perOperatore.find(o => o.nome === "Denis").efficienza).toBe(1.5);
    expect(res.body.perCommessa).toHaveLength(1);

    const empty = await op1.get("/api/production/stats?from=2020-01-01&to=2020-01-02");
    expect(empty.body.totale.righe).toBe(0);
    expect(empty.body.totale.efficienza).toBeNull();
  });

  test("le route di produzione richiedono una sessione", async () => {
    expect((await request(app).get("/api/production/entries")).status).toBe(401);
  });
});
