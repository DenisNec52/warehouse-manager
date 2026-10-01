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

async function agentFor(username, role, extra = {}) {
  const u = await User.create({ username, password: "Password123!", name: `Nome ${username}`, role, ...extra });
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ username, password: "Password123!" });
  a.userId = String(u._id);
  return a;
}
const names = (users) => users.map((u) => u.name).sort();

describe("Super-admin invisibile", () => {
  let root, admin2, rootId;
  beforeEach(async () => {
    root   = await agentFor("admin", "admin", { isSuperAdmin: true });
    admin2 = await agentFor("admin2", "admin");
    rootId = root.userId;
  });

  test("non compare nell'elenco utenti ad altri admin, ma sì a sé stesso", async () => {
    const perAltri = (await admin2.get("/api/users")).body.users;
    expect(perAltri.some((u) => u.isSuperAdmin)).toBe(false);
    expect(names(perAltri)).not.toContain("Nome admin");
    const perSe = (await root.get("/api/users")).body.users;
    expect(perSe.some((u) => u.isSuperAdmin)).toBe(true);
  });

  test("dettaglio per id: 404 ad altri, 200 a sé stesso", async () => {
    expect((await admin2.get(`/api/users/${rootId}`)).status).toBe(404);
    const self = await root.get(`/api/users/${rootId}`);
    expect(self.status).toBe(200);
    expect(self.body.user.isSuperAdmin).toBe(true);
  });

  test("non è gestibile da altri admin: 404 (non rivela l'esistenza)", async () => {
    expect((await admin2.put(`/api/users/${rootId}`).send({ name: "Hack" })).status).toBe(404);
    expect((await admin2.delete(`/api/users/${rootId}`)).status).toBe(404);
  });

  test("la ricerca per nome non lo rivela ad altri", async () => {
    const r = (await admin2.get("/api/users").query({ search: "admin" })).body.users;
    expect(r.some((u) => u.isSuperAdmin)).toBe(false);
  });
});

describe("Permessi di modifica del supervisore", () => {
  let prima, capoA, capoB, mio, altrui, idMio, idAltrui;
  beforeEach(async () => {
    await runMigrations({ log: () => {} });
    prima = await Department.findOne({ name: "Prima Saldatura" });
    capoA = await agentFor("capoa", "supervisore");
    capoB = await agentFor("capob", "supervisore");
    mio    = await agentFor("mio", "operatore", { departments: [prima._id], supervisor: capoA.userId });
    altrui = await agentFor("altrui", "operatore", { departments: [prima._id], supervisor: capoB.userId });
    idMio = mio.userId; idAltrui = altrui.userId;
  });

  test("può modificare anagrafica, turno e reparto del PROPRIO operaio, non il ruolo", async () => {
    const ok = await capoA.put(`/api/users/${idMio}`).send({ name: "Mio Nuovo", shift: "turno2" });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ name: "Mio Nuovo", shift: "turno2" });
    // tentativo di cambiare ruolo: ignorato (resta operatore)
    const r = await capoA.put(`/api/users/${idMio}`).send({ role: "supervisore" });
    expect(r.status).toBe(200);
    expect(r.body.user.role).toBe("operatore");
  });

  test("NON può modificare l'operaio di un altro supervisore (403)", async () => {
    expect((await capoA.put(`/api/users/${idAltrui}`).send({ name: "X" })).status).toBe(403);
  });

  test("NON può modificare un altro supervisore (403)", async () => {
    expect((await capoA.put(`/api/users/${capoB.userId}`).send({ name: "X" })).status).toBe(403);
  });

  test("NON può riassegnare il supervisore del proprio operaio", async () => {
    await capoA.put(`/api/users/${idMio}`).send({ supervisor: capoB.userId });
    const u = await User.findById(idMio);
    expect(String(u.supervisor)).toBe(String(capoA.userId));   // invariato
  });
});

describe("Visibilità operaio: stesso turno E stesso reparto", () => {
  let prima, seconda, admin, aaa, sameShift, otherShift, otherDept, noShift;
  beforeEach(async () => {
    await runMigrations({ log: () => {} });
    prima = await Department.findOne({ name: "Prima Saldatura" });
    seconda = await Department.findOne({ name: "Seconda Saldatura" });
    admin = await agentFor("admin", "admin");
    aaa        = await agentFor("aaa", "operatore", { departments: [prima._id], shift: "turno1" });
    sameShift  = await agentFor("sameshift", "operatore", { departments: [prima._id], shift: "turno1" });  // collega
    otherShift = await agentFor("othershift", "operatore", { departments: [prima._id], shift: "turno2" }); // stesso reparto, turno diverso
    otherDept  = await agentFor("otherdept", "operatore", { departments: [seconda._id], shift: "turno1" });// stesso turno, reparto diverso
    noShift    = await agentFor("noshift", "operatore", { departments: [prima._id] });                     // senza turno
    // una riga di produzione a testa, nel proprio reparto
    const stdP = (await admin.post("/api/production/standard-times").send({ department: String(prima._id), tipologia: "T", dimensione: "", label: "T", minuti: 10 })).body.standardTime;
    const stdS = (await admin.get(`/api/production/standard-times?department=${seconda._id}`)).body.standardTimes[0];
    const row = (dep, std) => ({ department: String(dep), data: "2026-09-30", commessa: "1", quantita: 1, standardTime: std, tempoImpiegatoMinuti: 10 });
    for (const a of [aaa, sameShift, otherShift, noShift]) await a.post("/api/production/entries").send(row(prima._id, stdP._id));
    await otherDept.post("/api/production/entries").send(row(seconda._id, stdS._id));
  });

  test("vede solo chi ha stesso turno E stesso reparto (più sé stesso)", async () => {
    const perOp = (await aaa.get("/api/production/stats")).body.perOperatore;
    expect(perOp.map((o) => o.nome).sort()).toEqual(["Nome aaa", "Nome sameshift"]);
  });

  test("un operaio senza turno vede solo sé stesso", async () => {
    const perOp = (await noShift.get("/api/production/stats")).body.perOperatore;
    expect(perOp.map((o) => o.nome).sort()).toEqual(["Nome noshift"]);
  });
});

describe("Assegnazione turni e supervisore (validazione)", () => {
  let admin, capo, prima;
  beforeEach(async () => {
    await runMigrations({ log: () => {} });
    prima = await Department.findOne({ name: "Prima Saldatura" });
    admin = await agentFor("admin", "admin");
    capo  = await agentFor("capo", "supervisore");
  });

  test("admin crea un operaio con turno e supervisore validi", async () => {
    const r = await admin.post("/api/users").send({
      username: "nuovo", password: "Password123!", name: "Nuovo", role: "operatore",
      departments: [String(prima._id)], shift: "turno1", supervisor: capo.userId,
    });
    expect(r.status).toBe(201);
    expect(r.body.user).toMatchObject({ shift: "turno1" });
    expect(String(r.body.user.supervisor)).toBe(String(capo.userId));
  });

  test("turno non valido -> 400", async () => {
    const r = await admin.post("/api/users").send({ username: "x", password: "Password123!", name: "X", role: "operatore", shift: "notte" });
    expect(r.status).toBe(400);
  });

  test("supervisore indicato non è un supervisore -> 400", async () => {
    const opx = await agentFor("opx", "operatore");
    const r = await admin.post("/api/users").send({ username: "yyy", password: "Password123!", name: "Y", role: "operatore", supervisor: opx.userId });
    expect(r.status).toBe(400);
  });

  test("un supervisore non può assegnare il campo supervisore (riservato agli admin)", async () => {
    const r = await capo.post("/api/users").send({ username: "z", password: "Password123!", name: "Z", role: "operatore", supervisor: capo.userId });
    expect(r.status).toBe(400);
  });

  test("admin sposta il turno di un operaio con PUT", async () => {
    const opx = await agentFor("opx", "operatore", { departments: [prima._id], shift: "turno1" });
    const r = await admin.put(`/api/users/${opx.userId}`).send({ shift: "centrale" });
    expect(r.status).toBe(200);
    expect(r.body.user.shift).toBe("centrale");
    // togliere il turno
    const r2 = await admin.put(`/api/users/${opx.userId}`).send({ shift: "" });
    expect(r2.body.user.shift).toBeNull();
  });
});
