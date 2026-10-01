const request = require("supertest");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");
const Product = require("../models/Product");

jest.setTimeout(60000);
beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

async function agent(username, role) {
  await User.create({ username, password: "Password123!", name: username, role });
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ username, password: "Password123!" });
  return a;
}

describe("Hardening di sicurezza", () => {
  test("dashboard: valore del magazzino e n. utenti solo ad admin/supervisori", async () => {
    await Product.create({ code: "P1", name: "X", quantity: 10, unitPrice: 5, createdBy: (await User.findOne({}))?._id || undefined });
    const op = await agent("oper", "operatore");
    const capo = await agent("capo", "supervisore");
    const sOp = (await op.get("/api/dashboard/stats")).body.stats;
    const sCapo = (await capo.get("/api/dashboard/stats")).body.stats;
    expect(sOp.totalValue).toBeUndefined();
    expect(sOp.totalUsers).toBeUndefined();
    expect(sOp.totalProducts).toBeGreaterThanOrEqual(1);   // i dati operativi restano
    expect(typeof sCapo.totalValue).toBe("number");
    expect(typeof sCapo.totalUsers).toBe("number");
  });

  test("ricerca prodotti con parametro non valido non causa 500", async () => {
    const op = await agent("oper", "operatore");
    // ?search[$ne]= arriva come oggetto: deve essere gestito, non andare in errore
    const r = await op.get("/api/products").query({ "search[$ne]": "x", "limit": "abc", "sort": "; drop" });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.products)).toBe(true);
  });

  test("JWT con algoritmo diverso da HS256 viene rifiutato", async () => {
    const jwt = require("jsonwebtoken");
    const none = jwt.sign({ id: "x", role: "admin" }, "", { algorithm: "none" });
    const r = await request(app).get("/api/auth/me").set("Cookie", `wh_token=${none}`);
    expect(r.status).toBe(401);
  });
});
