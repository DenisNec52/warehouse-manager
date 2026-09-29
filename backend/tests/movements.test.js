const request = require("supertest");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");
const Notification = require("../models/Notification");

jest.setTimeout(60000);

let agent;

beforeAll(async () => {
  await db.connect();
});

beforeEach(async () => {
  await User.create({ username: "operatore1", password: "Password123!", name: "Luigi Verdi", role: "operatore" });
  agent = request.agent(app);
  await agent.post("/api/auth/login").send({ username: "operatore1", password: "Password123!" });
});

afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

async function createProduct(overrides = {}) {
  const res = await agent.post("/api/products").send({
    code: "1534-1", name: "Vite M8", quantity: 20, minQuantity: 5, unit: "pz",
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.product;
}

describe("Movimenti di magazzino (transazione stock)", () => {
  test("un'uscita riduce la quantità e registra prima/dopo", async () => {
    const product = await createProduct();

    const res = await agent.post("/api/movements").send({ productId: product._id, type: "OUT", quantity: 5, reason: "Test" });
    expect(res.status).toBe(201);
    expect(res.body.movement.quantityBefore).toBe(20);
    expect(res.body.movement.quantityAfter).toBe(15);

    const check = await agent.get(`/api/products/${product._id}`);
    expect(check.body.product.quantity).toBe(15);
  });

  test("un'entrata aumenta la quantità", async () => {
    const product = await createProduct();
    const res = await agent.post("/api/movements").send({ productId: product._id, type: "IN", quantity: 10 });
    expect(res.status).toBe(201);
    expect(res.body.movement.quantityAfter).toBe(30);
  });

  test("un'uscita superiore alla scorta disponibile viene rifiutata e NON tocca la quantità", async () => {
    const product = await createProduct({ quantity: 3 });

    const res = await agent.post("/api/movements").send({ productId: product._id, type: "OUT", quantity: 999 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/scorte insufficienti/i);

    // La transazione deve essere stata annullata: la quantità resta invariata
    const check = await agent.get(`/api/products/${product._id}`);
    expect(check.body.product.quantity).toBe(3);
  });

  test("scendere sotto la soglia minima genera una notifica di scorta bassa", async () => {
    const product = await createProduct({ quantity: 10, minQuantity: 5 });

    await agent.post("/api/movements").send({ productId: product._id, type: "OUT", quantity: 6 }); // 10 -> 4, sotto soglia 5

    const notifications = await Notification.find({ type: "low_stock" });
    expect(notifications.length).toBe(1);
    expect(notifications[0].message).toMatch(/4 pz/);
  });

  test("non genera una seconda notifica se la scorta era già sotto soglia", async () => {
    const product = await createProduct({ quantity: 8, minQuantity: 8 }); // già in scorta bassa alla creazione (8 <= 8)

    const beforeCount = await Notification.countDocuments({ type: "low_stock" });
    expect(beforeCount).toBe(1); // generata alla creazione del prodotto

    await agent.post("/api/movements").send({ productId: product._id, type: "OUT", quantity: 1 }); // 8 -> 7, resta sotto soglia

    const afterCount = await Notification.countDocuments({ type: "low_stock" });
    expect(afterCount).toBe(1); // nessuna nuova notifica: era già sotto soglia prima del movimento
  });

  test("rifiuta un movimento con quantità non positiva o tipo non valido", async () => {
    const product = await createProduct();
    const zero = await agent.post("/api/movements").send({ productId: product._id, type: "OUT", quantity: 0 });
    expect(zero.status).toBe(400);

    const badType = await agent.post("/api/movements").send({ productId: product._id, type: "SIDEWAYS", quantity: 1 });
    expect(badType.status).toBe(400);
  });

  test("rifiuta un movimento su un prodotto inesistente", async () => {
    const res = await agent.post("/api/movements").send({ productId: "64b000000000000000000000", type: "IN", quantity: 1 });
    expect(res.status).toBe(404);
  });

  test("le route dei movimenti richiedono autenticazione", async () => {
    const res = await request(app).get("/api/movements");
    expect(res.status).toBe(401);
  });
});
