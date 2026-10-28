/**
 * tests/audit.test.js — registro modifiche: chi può leggerlo, filtri, super-admin
 * nascosto; chiave del rate limiter globale per utente.
 */
const request = require("supertest");
const jwt  = require("jsonwebtoken");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");
const { sessionOrIpKey } = require("../middleware/rateLimiter");

jest.setTimeout(60000);
beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

const PW = "Password123!";
async function agentFor(username, role, extra = {}) {
  await User.create({ username, password: PW, name: `Nome ${username}`, role, ...extra });
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ username, password: PW });
  return a;
}

describe("Registro modifiche", () => {
  test("solo gli admin lo leggono", async () => {
    const op  = await agentFor("oper", "operatore");
    const sup = await agentFor("sup", "supervisore");
    const adm = await agentFor("adm", "admin");
    expect((await op.get("/api/audit")).status).toBe(403);
    expect((await sup.get("/api/audit")).status).toBe(403);
    expect((await adm.get("/api/audit")).status).toBe(200);
  });

  test("filtri per entità e azione, ordine dal più recente", async () => {
    const adm = await agentFor("adm", "admin");
    const p = (await adm.post("/api/products").send({ code: "A-1", quantity: 5 })).body.product;
    await adm.put(`/api/products/${p._id}`).send({ name: "Nuovo nome" });
    await adm.post("/api/products").send({ code: "B-1", quantity: 1 });

    const byEntity = (await adm.get("/api/audit").query({ entityType: "product", entityId: p._id })).body.entries;
    expect(byEntity.map(e => e.action)).toEqual(["product.update", "product.create"]);
    const creates = (await adm.get("/api/audit").query({ action: "product.create" })).body.entries;
    expect(creates).toHaveLength(2);
    const prefix = (await adm.get("/api/audit").query({ action: "product" })).body;
    expect(prefix.pagination.total).toBe(3);
  });

  test("le azioni del super-admin non sono visibili agli altri admin", async () => {
    const root = await agentFor("root", "admin", { isSuperAdmin: true });
    const adm  = await agentFor("adm", "admin");
    await root.post("/api/products").send({ code: "R-1", quantity: 1 });
    expect((await adm.get("/api/audit")).body.entries.find(e => e.entityLabel === "R-1")).toBeUndefined();
    expect((await root.get("/api/audit")).body.entries.find(e => e.entityLabel === "R-1")).toBeTruthy();
  });

  test("parametri strani non causano 500", async () => {
    const adm = await agentFor("adm", "admin");
    const r = await adm.get("/api/audit").query({ "action[$ne]": "x", from: "boh", limit: "abc", entityId: "123" });
    expect(r.status).toBe(200);
  });
});

describe("Rate limiter globale", () => {
  test("chiave per utente quando la sessione è valida, altrimenti per IP", () => {
    const token = jwt.sign({ id: "abc123" }, process.env.JWT_SECRET);
    const base = { headers: { "x-forwarded-for": "1.2.3.4" }, ip: "9.9.9.9" };
    expect(sessionOrIpKey({ ...base, cookies: { wh_token: token } })).toBe("user:abc123");
    expect(sessionOrIpKey({ ...base, cookies: { wh_token: "falso" } })).toBe("ip:1.2.3.4");
    expect(sessionOrIpKey({ ...base, cookies: {} })).toBe("ip:1.2.3.4");
  });
});
