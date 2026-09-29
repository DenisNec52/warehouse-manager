const request = require("supertest");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");
const Product = require("../models/Product");
const Checklist = require("../models/Checklist");
const ChecklistSubmission = require("../models/ChecklistSubmission");

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
const stock  = async (id) => (await Product.findById(id)).quantity;
const titles = (res) => (res.body.notifications || res.body).map(n => n.title);

let admin, sup, op, product;

beforeEach(async () => {
  admin = await agentFor("capo", "admin", "Capo Admin");
  sup   = await agentFor("super", "supervisore", "Super Visore");
  op    = await agentFor("operatore1", "operatore", "Luigi Verdi");
  const res = await admin.post("/api/products").send({ code: "1534-1", name: "Vite M8", quantity: 20, minQuantity: 5, unit: "pz" });
  expect(res.status).toBe(201);
  product = res.body.product;
});

async function move(type, quantity) {
  const res = await op.post("/api/movements").send({ productId: product._id, type, quantity });
  expect(res.status).toBe(201);
  return res.body.movement;
}

describe("Correzione movimenti (admin)", () => {
  test("corregge la quantità di un'uscita e riallinea la giacenza", async () => {
    const m = await move("OUT", 5);                       // 20 -> 15
    const res = await admin.put(`/api/movements/${m._id}`).send({ type: "OUT", quantity: 3 });
    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(17);
    expect(await stock(product._id)).toBe(17);
    expect(res.body.movement).toMatchObject({ quantity: 3, quantityAfter: 17, correctedByName: "Capo Admin" });
  });

  test("cambiare il tipo da uscita a entrata sposta la giacenza di entrambi gli effetti", async () => {
    const m = await move("OUT", 5);                       // 15
    await admin.put(`/api/movements/${m._id}`).send({ type: "IN", quantity: 5 });
    expect(await stock(product._id)).toBe(25);
  });

  test("supervisore e operatore non possono correggere", async () => {
    const m = await move("OUT", 5);
    expect((await sup.put(`/api/movements/${m._id}`).send({ type: "OUT", quantity: 1 })).status).toBe(403);
    expect((await op.put(`/api/movements/${m._id}`).send({ type: "OUT", quantity: 1 })).status).toBe(403);
    expect(await stock(product._id)).toBe(15);
  });

  test("rifiuta una correzione che porterebbe la giacenza sotto zero, senza toccarla", async () => {
    const entrata = await move("IN", 5);                   // 25
    await move("OUT", 25);                                  // 0
    const res = await admin.put(`/api/movements/${entrata._id}`).send({ type: "IN", quantity: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/sotto zero/);
    expect(await stock(product._id)).toBe(0);
  });

  test("id non valido e quantità nulla", async () => {
    expect((await admin.put("/api/movements/abc").send({ type: "OUT", quantity: 1 })).status).toBe(404);
    const m = await move("OUT", 5);
    expect((await admin.put(`/api/movements/${m._id}`).send({ type: "OUT", quantity: 0 })).status).toBe(400);
  });
});

describe("Annullamento movimenti (admin)", () => {
  test("annulla un'uscita: la giacenza torna com'era e il movimento sparisce", async () => {
    const m = await move("OUT", 5);                       // 15
    const res = await admin.delete(`/api/movements/${m._id}`);
    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(20);
    expect(await stock(product._id)).toBe(20);
    expect((await admin.get(`/api/movements/${m._id}`)).status).toBe(404);
  });

  test("rifiuta un annullamento che porterebbe la giacenza sotto zero", async () => {
    const entrata = await move("IN", 5);                   // 25
    await move("OUT", 25);                                  // 0
    const res = await admin.delete(`/api/movements/${entrata._id}`);
    expect(res.status).toBe(400);
    expect(await stock(product._id)).toBe(0);
    expect((await admin.get(`/api/movements/${entrata._id}`)).status).toBe(200);
  });

  test("solo l'admin può annullare", async () => {
    const m = await move("OUT", 5);
    expect((await sup.delete(`/api/movements/${m._id}`)).status).toBe(403);
    expect((await op.delete(`/api/movements/${m._id}`)).status).toBe(403);
    expect(await stock(product._id)).toBe(15);
  });

  test("correzioni e annullamenti lasciano una notifica di traccia", async () => {
    const a = await move("OUT", 5);
    const b = await move("OUT", 2);
    await admin.put(`/api/movements/${a._id}`).send({ type: "OUT", quantity: 4 });
    await admin.delete(`/api/movements/${b._id}`);
    const t = titles(await admin.get("/api/notifications"));
    expect(t.some(x => x.startsWith("Movimento corretto"))).toBe(true);
    expect(t.some(x => x.startsWith("Movimento annullato"))).toBe(true);
  });
});

describe("Compilazioni 5S (admin)", () => {
  let cl, userId;
  beforeEach(async () => {
    userId = (await User.findOne({ username: "operatore1" }))._id;
    cl = await Checklist.create({
      sections: [{ title: "Area", items: [{ label: "Banco pulito" }, { label: "Attrezzi riposti" }] }],
      shifts: [{ name: "Mattina" }, { name: "Pomeriggio" }],
      cleaningTypes: [{ label: "Ordinaria", default: true }],
    });
  });
  const makeSub = (overrides = {}) => ChecklistSubmission.create({
    checklist: cl._id, shift: "Mattina", cleaningType: "Ordinaria", date: "2026-09-25",
    responses: [{ label: "Banco pulito", checked: true }, { label: "Attrezzi riposti", checked: false }],
    totalItems: 2, checkedItems: 1, allChecked: false, score: 50,
    submittedBy: userId, submittedByName: "Luigi Verdi", ...overrides,
  });

  test("corregge esiti e note e ricalcola il punteggio", async () => {
    const sub = await makeSub({ generalNote: "da cancellare" });
    const res = await admin.put(`/api/checklist/submissions/${sub._id}`)
      .send({ responses: [{ checked: true }, { checked: true, note: "ok" }], generalNote: "" });
    expect(res.status).toBe(200);
    expect(res.body.submission).toMatchObject({ checkedItems: 2, score: 100, allChecked: true, generalNote: "" });
    expect(res.body.submission.responses[1]).toMatchObject({ label: "Attrezzi riposti", note: "ok" });
  });

  test("rifiuta un numero di voci diverso da quello compilato", async () => {
    const sub = await makeSub();
    expect((await admin.put(`/api/checklist/submissions/${sub._id}`).send({ responses: [{ checked: true }] })).status).toBe(400);
  });

  test("non crea doppioni per stesso utente, giorno e turno", async () => {
    await makeSub();
    const other = await makeSub({ shift: "Pomeriggio" });
    expect((await admin.put(`/api/checklist/submissions/${other._id}`).send({ shift: "Mattina" })).status).toBe(409);
  });

  test("il supervisore non può modificare né eliminare", async () => {
    const sub = await makeSub();
    expect((await sup.put(`/api/checklist/submissions/${sub._id}`).send({ generalNote: "x" })).status).toBe(403);
    expect((await sup.delete(`/api/checklist/submissions/${sub._id}`)).status).toBe(403);
  });

  test("l'admin elimina una compilazione", async () => {
    const sub = await makeSub();
    expect((await admin.delete(`/api/checklist/submissions/${sub._id}`)).status).toBe(200);
    expect(await ChecklistSubmission.findById(sub._id)).toBeNull();
  });

  test("id non valido", async () => {
    expect((await admin.put("/api/checklist/submissions/abc").send({ generalNote: "x" })).status).toBe(404);
    expect((await admin.delete("/api/checklist/submissions/abc")).status).toBe(404);
  });
});
