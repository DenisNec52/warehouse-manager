/**
 * tests/production-deduction.test.js
 *
 * Distinta base + scarico automatico del magazzino al salvataggio della riga Andon:
 * scorta scalata, movimenti OUT creati, snapshot consumi, blocco se scorta
 * insufficiente (transazione annullata), e retrocompatibilità senza consumi.
 */
const request = require("supertest");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");
const Department  = require("../models/Department");
const StandardTime = require("../models/StandardTime");
const Product     = require("../models/Product");
const Movement    = require("../models/Movement");

jest.setTimeout(60000);
beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

async function setup() {
  await User.create({ username: "admin", password: "Password123!", name: "Admin", role: "admin" });
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ username: "admin", password: "Password123!" });
  const dep = await Department.create({ name: "Saldatura", isActive: true });
  const std = await StandardTime.create({ department: dep._id, tipologia: "IP65", label: "IP65 P", minuti: 90 });
  const prod = await Product.create({ name: "Flangia 1534-1", code: "1534-1", quantity: 100, unitPrice: 1 });
  return { a, dep, std, prod };
}

const entryBody = (dep, std, extra = {}) => ({
  department: String(dep._id), data: "2026-10-22", commessa: "C.O 856",
  quantita: 3, standardTime: String(std._id), tempoImpiegatoMinuti: 120, ...extra,
});

describe("Deduzione automatica magazzino", () => {
  test("distinta base: creazione e proposta componenti (resolve)", async () => {
    const { a, dep, std, prod } = await setup();
    const c = await a.post("/api/production/bom").send({
      department: String(dep._id), standardTime: String(std._id), fase: "Prima saldatura",
      components: [{ product: String(prod._id), quantita: 2 }],
    });
    expect(c.status).toBe(201);

    const r = await a.get("/api/production/bom/resolve")
      .query({ standardTime: String(std._id), fase: "Prima saldatura", quantita: 3 });
    expect(r.body.found).toBe(true);
    expect(r.body.components[0].quantita).toBe(6);   // 2 per pezzo × 3 pezzi
  });

  test("salvataggio con consumi: scorta scalata + movimento OUT + snapshot", async () => {
    const { a, dep, std, prod } = await setup();
    const r = await a.post("/api/production/entries").send(entryBody(dep, std, {
      fase: "Prima saldatura", consumi: [{ product: String(prod._id), quantita: 6 }],
    }));
    expect(r.status).toBe(201);
    expect(r.body.entry.fase).toBe("Prima saldatura");
    expect(r.body.entry.consumi[0].code).toBe("1534-1");

    expect((await Product.findById(prod._id)).quantity).toBe(94);   // 100 - 6
    const mv = await Movement.find({ product: prod._id });
    expect(mv).toHaveLength(1);
    expect(mv[0].type).toBe("OUT");
    expect(mv[0].quantityAfter).toBe(94);
  });

  test("scorta insufficiente: 409 e NESSUNA modifica (transazione annullata)", async () => {
    const { a, dep, std, prod } = await setup();
    const r = await a.post("/api/production/entries").send(entryBody(dep, std, {
      fase: "Prima saldatura", consumi: [{ product: String(prod._id), quantita: 999 }],
    }));
    expect(r.status).toBe(409);
    expect((await Product.findById(prod._id)).quantity).toBe(100);  // invariata
    expect(await Movement.countDocuments()).toBe(0);
  });

  test("senza consumi: comportamento classico, nessuno scarico", async () => {
    const { a, dep, std, prod } = await setup();
    const r = await a.post("/api/production/entries").send(entryBody(dep, std));
    expect(r.status).toBe(201);
    expect((await Product.findById(prod._id)).quantity).toBe(100);
    expect(await Movement.countDocuments()).toBe(0);
  });
});
