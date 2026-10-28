/**
 * tests/products-hardening.test.js
 *
 * La giacenza cambia solo tramite movimenti: niente modifica diretta della
 * quantità da parte degli operatori, niente campi di sistema impostabili dal
 * client, e ogni modifica finisce nel registro (AuditLog).
 */
const request = require("supertest");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");
const Product  = require("../models/Product");
const Movement = require("../models/Movement");
const AuditLog = require("../models/AuditLog");

jest.setTimeout(60000);
beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

async function agentFor(username, role) {
  await User.create({ username, password: "Password123!", name: `Nome ${username}`, role });
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ username, password: "Password123!" });
  return a;
}

let admin, sup, op, product;
beforeEach(async () => {
  admin = await agentFor("capo", "admin");
  sup   = await agentFor("super", "supervisore");
  op    = await agentFor("oper", "operatore");
  const r = await admin.post("/api/products").send({ code: "1534-1", name: "Vite M8", quantity: 20, minQuantity: 5, pallet: 3 });
  expect(r.status).toBe(201);
  product = r.body.product;
});

describe("Prodotti: whitelist dei campi", () => {
  test("un operatore non può cambiare la quantità con PUT", async () => {
    const r = await op.put(`/api/products/${product._id}`).send({ quantity: 999 });
    expect(r.status).toBe(403);
    expect((await Product.findById(product._id)).quantity).toBe(20);
    expect(await Movement.countDocuments()).toBe(0);
  });

  test("un operatore può modificare l'anagrafica se la quantità resta uguale", async () => {
    const r = await op.put(`/api/products/${product._id}`).send({ name: "Vite M8 zincata", quantity: 20 });
    expect(r.status).toBe(200);
    expect(r.body.product.name).toBe("Vite M8 zincata");
  });

  test("campi di sistema nel body vengono ignorati (isActive, createdBy, placementHistory)", async () => {
    const intruso = await User.findOne({ username: "oper" });
    const r = await op.put(`/api/products/${product._id}`).send({
      isActive: false, createdBy: String(intruso._id), placementHistory: [], images: [{ url: "x" }],
    });
    expect(r.status).toBe(200);
    const p = await Product.findById(product._id);
    expect(p.isActive).toBe(true);
    expect(String(p.createdBy)).not.toBe(String(intruso._id));
    expect(p.placementHistory.length).toBe(1);   // la voce creata con la pedana iniziale resta
    expect(p.images.length).toBe(0);
  });

  test("anche in creazione i campi di sistema sono ignorati", async () => {
    const r = await op.post("/api/products").send({ code: "X-1", quantity: 1, isActive: false, updatedBy: "000000000000000000000000" });
    expect(r.status).toBe(201);
    const p = await Product.findById(r.body.product._id);
    expect(p.isActive).toBe(true);
    expect(p.updatedBy).toBeUndefined();
  });

  test("admin e supervisore: cambiare la quantità crea una rettifica tracciata", async () => {
    const r1 = await sup.put(`/api/products/${product._id}`).send({ quantity: 15 });
    expect(r1.status).toBe(200);
    expect(r1.body.product.quantity).toBe(15);
    const r2 = await admin.put(`/api/products/${product._id}`).send({ quantity: 18, adjustmentReason: "Inventario annuale" });
    expect(r2.status).toBe(200);

    const moves = await Movement.find({ product: product._id }).sort({ createdAt: 1 }).lean();
    expect(moves.map(m => [m.type, m.quantity, m.quantityBefore, m.quantityAfter, m.source])).toEqual([
      ["OUT", 5, 20, 15, "adjustment"],
      ["IN",  3, 15, 18, "adjustment"],
    ]);
    expect(moves[1].reason).toBe("Inventario annuale");
  });

  test("ogni creazione e modifica finisce nel registro con prima/dopo", async () => {
    await sup.put(`/api/products/${product._id}`).send({ minQuantity: 8, quantity: 12 });
    const logs = await AuditLog.find({ entityId: product._id }).sort({ at: 1 }).lean();
    expect(logs.map(l => l.action)).toEqual(["product.create", "product.update"]);
    const upd = logs[1];
    expect(upd.actorName).toBe("Nome super");
    expect(upd.changes).toEqual(expect.arrayContaining([
      { field: "minQuantity", from: 5, to: 8 },
      { field: "quantity", from: 20, to: 12 },
    ]));
  });

  test("un movimento dalla UI viene registrato nel registro", async () => {
    const r = await op.post("/api/movements").send({ productId: product._id, type: "OUT", quantity: 2 });
    expect(r.status).toBe(201);
    const log = await AuditLog.findOne({ action: "movement.create" }).lean();
    expect(log).toMatchObject({ actorName: "Nome oper", entityType: "movement" });
    expect(log.meta).toMatchObject({ quantityBefore: 20, quantityAfter: 18 });
  });

  test("id non valido → 404, non 500", async () => {
    expect((await admin.put("/api/products/abc").send({ name: "x" })).status).toBe(404);
    expect((await admin.delete("/api/products/abc")).status).toBe(404);
    expect((await op.post("/api/movements").send({ productId: "abc", type: "IN", quantity: 1 })).status).toBe(404);
  });
});
