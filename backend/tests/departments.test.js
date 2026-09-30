const request = require("supertest");
const app  = require("../app");
const db   = require("./db");
const User            = require("../models/User");
const Department      = require("../models/Department");
const StandardTime    = require("../models/StandardTime");
const ProductionEntry = require("../models/ProductionEntry");
const Checklist       = require("../models/Checklist");
const Migration       = require("../models/Migration");
const { runMigrations } = require("../utils/migrations");

jest.setTimeout(60000);

beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

const quiet = { log: () => {} };
async function agentFor(username, role, extra = {}) {
  await User.create({ username, password: "Password123!", name: username, role, ...extra });
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ username, password: "Password123!" });
  return agent;
}
const dept = (name) => Department.findOne({ name });
const idOf = async (username) => String((await User.findOne({ username }))._id);

describe("Migrazione reparti (dati come in produzione oggi)", () => {
  test("crea i reparti, sposta tempi e righe su Seconda Saldatura, rimuove il vecchio indice, nomina il super-admin", async () => {
    await User.create({ username: "admin", password: "Password123!", name: "Denis", role: "admin" });
    // Stato di oggi: vecchio indice unico e righe senza reparto
    await StandardTime.collection.createIndex({ tipologia: 1, dimensione: 1 }, { unique: true, name: "tipologia_1_dimensione_1" });
    await ProductionEntry.collection.insertOne({ commessa: "2631", data: new Date("2026-09-25"), quantita: 6 });

    await runMigrations(quiet);

    const names = (await Department.find().sort("order")).map(d => d.name);
    expect(names).toEqual(["Prima Saldatura", "Seconda Saldatura", "Finitura", "Prova Idraulica", "Riempimento"]);
    const [prima, seconda] = [await dept("Prima Saldatura"), await dept("Seconda Saldatura")];
    expect(await StandardTime.countDocuments({ department: seconda._id })).toBe(9);
    expect(await StandardTime.countDocuments({ department: prima._id })).toBe(0);
    expect((await ProductionEntry.findOne({ commessa: "2631" })).department).toEqual(seconda._id);

    const indexes = (await StandardTime.collection.indexes()).map(i => i.name);
    expect(indexes).not.toContain("tipologia_1_dimensione_1");
    // La stessa tipologia ora è ammessa in un altro reparto
    await expect(StandardTime.create({ department: prima._id, tipologia: "Custodia NEMA", label: "NEMA", minuti: 20 })).resolves.toBeTruthy();

    expect((await User.findOne({ username: "admin" })).isSuperAdmin).toBe(true);
  });

  test("è idempotente: una seconda esecuzione non duplica nulla", async () => {
    await runMigrations(quiet);
    await runMigrations(quiet);
    expect(await Department.countDocuments()).toBe(5);
    expect(await StandardTime.countDocuments()).toBe(9);
    expect(await Migration.countDocuments()).toBe(1);
  });
});

describe("Gestione reparti", () => {
  beforeEach(() => runMigrations(quiet));

  test("solo l'admin crea e modifica reparti; si disattivano, non si eliminano", async () => {
    const admin = await agentFor("capo", "admin");
    const sup   = await agentFor("super", "supervisore");
    expect((await sup.post("/api/departments").send({ name: "Verniciatura" })).status).toBe(403);
    const created = await admin.post("/api/departments").send({ name: "Verniciatura" });
    expect(created.status).toBe(201);
    expect((await admin.post("/api/departments").send({ name: "Verniciatura" })).status).toBe(409);
    const off = await admin.put(`/api/departments/${created.body.department._id}`).send({ name: "Verniciatura", isActive: false });
    expect(off.body.department.isActive).toBe(false);
    expect((await admin.delete(`/api/departments/${created.body.department._id}`)).status).toBe(404);
    expect((await sup.get("/api/departments")).body.departments).toHaveLength(6);
  });

  test("non si registra su un reparto disattivato", async () => {
    const admin = await agentFor("capo", "admin");
    const finitura = await dept("Finitura");
    await admin.put(`/api/departments/${finitura._id}`).send({ name: "Finitura", isActive: false });
    const res = await admin.post("/api/production/standard-times").send({ department: String(finitura._id), tipologia: "X", label: "X", minuti: 10 });
    expect(res.status).toBe(400);
  });
});

describe("Visibilità dei reparti (applicata dal backend)", () => {
  let prima, seconda;
  beforeEach(async () => {
    await runMigrations(quiet);
    [prima, seconda] = [await dept("Prima Saldatura"), await dept("Seconda Saldatura")];
    await StandardTime.create({ department: prima._id, tipologia: "Tubo", label: "Tubo", minuti: 15 });
  });

  test("un operatore del gruppo Prima Saldatura vede e registra solo lì", async () => {
    const op = await agentFor("mario", "operatore", { departments: [prima._id] });
    expect((await op.get(`/api/production/standard-times?department=${seconda._id}`)).status).toBe(403);
    const mine = await op.get("/api/production/standard-times");
    expect(mine.body.standardTimes.map(t => t.label)).toEqual(["Tubo"]);

    const tubo = mine.body.standardTimes[0]._id;
    const body = { data: "2026-09-30", commessa: "1", quantita: 1, tempoImpiegatoMinuti: 10, standardTime: tubo };
    expect((await op.post("/api/production/entries").send({ ...body, department: String(seconda._id) })).status).toBe(403);
    expect((await op.post("/api/production/entries").send({ ...body, department: String(prima._id) })).status).toBe(201);
  });

  test("la tipologia deve appartenere al reparto della riga", async () => {
    const op = await agentFor("mario", "operatore");
    const nema = await StandardTime.findOne({ department: seconda._id, label: "NEMA" });
    const res = await op.post("/api/production/entries").send({
      department: String(prima._id), data: "2026-09-30", commessa: "1", quantita: 1, tempoImpiegatoMinuti: 10, standardTime: String(nema._id),
    });
    expect(res.status).toBe(400);
  });

  test("un operatore senza reparti assegnati vede tutto (nessun blocco all'introduzione dei reparti)", async () => {
    const op = await agentFor("mario", "operatore");
    expect((await op.get("/api/production/standard-times")).body.standardTimes).toHaveLength(10);
  });

  test("il supervisore imposta un'eccezione individuale e la può togliere", async () => {
    const sup = await agentFor("super", "supervisore");
    const op  = await agentFor("mario", "operatore", { departments: [prima._id] });
    const id  = await idOf("mario");

    await sup.put(`/api/users/${id}`).send({ visibleDepartments: [String(seconda._id)] });
    expect((await op.get(`/api/production/standard-times?department=${seconda._id}`)).status).toBe(200);
    expect((await op.get(`/api/production/standard-times?department=${prima._id}`)).status).toBe(403);

    await sup.put(`/api/users/${id}`).send({ visibleDepartments: null });
    expect((await op.get(`/api/production/standard-times?department=${prima._id}`)).status).toBe(200);
  });

  test("il supervisore vede tutti i reparti", async () => {
    const sup = await agentFor("super", "supervisore", { departments: [prima._id] });
    expect((await sup.get(`/api/production/standard-times?department=${seconda._id}`)).status).toBe(200);
  });
});

describe("Pulizia 5S per reparto", () => {
  let prima, seconda, op;
  beforeEach(async () => {
    await runMigrations(quiet);
    [prima, seconda] = [await dept("Prima Saldatura"), await dept("Seconda Saldatura")];
    await Checklist.create({
      sections: [{ title: "Area", items: [{ label: "Banco pulito" }] }],
      shifts: [{ name: "Mattina" }], cleaningTypes: [{ label: "Ordinaria", default: true }],
    });
    op = await agentFor("mario", "operatore");
  });
  const submit = (department) => op.post("/api/checklist/submit").send({
    shift: "Mattina", cleaningType: "Ordinaria", responses: [{ label: "Banco pulito", checked: true }],
    ...(department && { department: String(department._id) }),
  });

  test("il reparto è obbligatorio", async () => {
    expect((await submit(null)).status).toBe(400);
  });

  test("due postazioni nello stesso turno = due compilazioni; la stessa postazione due volte no", async () => {
    const a = await submit(prima);
    expect(a.status).toBe(201);
    expect(a.body.submission.departmentName).toBe("Prima Saldatura");
    expect((await submit(seconda)).status).toBe(201);
    expect((await submit(prima)).status).toBe(409);
  });

  test("un operatore non compila per un reparto che non vede", async () => {
    await User.updateOne({ username: "mario" }, { departments: [prima._id] });
    expect((await submit(seconda)).status).toBe(403);
  });
});

describe("Gerarchia admin e super-admin", () => {
  let root, admin2, sup, rootId;
  beforeEach(async () => {
    root   = await agentFor("admin", "admin", { isSuperAdmin: true });
    admin2 = await agentFor("admin2", "admin");
    sup    = await agentFor("super", "supervisore");
    rootId = await idOf("admin");
  });

  test("un admin crea altri admin, un supervisore no", async () => {
    const body = { username: "admin3", password: "Password123!", name: "Admin Tre", role: "admin" };
    expect((await sup.post("/api/users").send(body)).status).toBe(403);
    expect((await admin2.post("/api/users").send(body)).status).toBe(201);
  });

  test("nessun altro admin può toccare il super-admin", async () => {
    expect((await admin2.put(`/api/users/${rootId}`).send({ name: "X" })).status).toBe(403);
    expect((await admin2.put(`/api/users/${rootId}/status`).send({ isActive: false })).status).toBe(403);
    expect((await admin2.put(`/api/users/${rootId}/password`).send({ newPassword: "NuovaPass123" })).status).toBe(403);
    expect((await admin2.post(`/api/users/${rootId}/badge/regenerate`)).status).toBe(403);
    expect((await admin2.delete(`/api/users/${rootId}`)).status).toBe(403);
    const me = await User.findById(rootId);
    expect(me).toMatchObject({ isActive: true, role: "admin", isSuperAdmin: true, name: "admin" });
  });

  test("il super-admin gestisce il proprio profilo ma non può togliersi il ruolo", async () => {
    expect((await root.put(`/api/users/${rootId}`).send({ name: "Denis" })).status).toBe(200);
    expect((await root.put(`/api/users/${rootId}`).send({ role: "operatore" })).status).toBe(403);
  });

  test("gli admin normali sono alla pari: si gestiscono a vicenda", async () => {
    await admin2.post("/api/users").send({ username: "admin3", password: "Password123!", name: "Admin Tre", role: "admin" });
    const id3 = await idOf("admin3");
    expect((await admin2.put(`/api/users/${id3}/status`).send({ isActive: false })).status).toBe(200);
    expect((await sup.put(`/api/users/${id3}`).send({ name: "X" })).status).toBe(403);
  });

  test("campi non ammessi nel body vengono ignorati (niente auto-nomina a super-admin)", async () => {
    const id2 = await idOf("admin2");
    await admin2.put(`/api/users/${id2}`).send({ name: "Admin Due", isSuperAdmin: true, badgeSecretHash: "x", isActive: false });
    const after = await User.findById(id2).select("+badgeSecretHash");
    expect(after).toMatchObject({ name: "Admin Due", isSuperAdmin: false, isActive: true, badgeSecretHash: null });

    const created = await admin2.post("/api/users").send({ username: "furbo", password: "Password123!", name: "F", role: "operatore", isSuperAdmin: true });
    expect(created.status).toBe(201);
    expect((await User.findOne({ username: "furbo" })).isSuperAdmin).toBe(false);
  });

  test("il database ammette un solo super-admin", async () => {
    await expect(User.create({ username: "altro", password: "Password123!", name: "A", role: "admin", isSuperAdmin: true }))
      .rejects.toThrow(/duplicate key/);
  });
});
