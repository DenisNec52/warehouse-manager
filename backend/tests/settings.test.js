/**
 * tests/settings.test.js — impostazioni globali: lettura per tutti, scrittura solo super-admin.
 */
const request = require("supertest");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");

jest.setTimeout(60000);
beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

async function agent(username, extra = {}) {
  await User.create({ username, password: "Password123!", name: username, role: "admin", ...extra });
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ username, password: "Password123!" });
  return a;
}

describe("Impostazioni globali", () => {
  test("GET: qualunque utente autenticato legge i default", async () => {
    const a = await agent("admin1");
    const r = await a.get("/api/settings");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.settings.workPhases)).toBe(true);
    expect(r.body.settings.appName).toBeTruthy();
  });

  test("PUT: un admin NON super-admin riceve 403", async () => {
    const a = await agent("admin2");
    const r = await a.put("/api/settings").send({ appName: "Hack" });
    expect(r.status).toBe(403);
  });

  test("PUT: il super-admin salva nome, fasi e visibilità (ruoli ignoti scartati)", async () => {
    const a = await agent("super", { isSuperAdmin: true });
    const r = await a.put("/api/settings").send({
      appName: "Magazzino ACME",
      workPhases: ["Prima saldatura", "Prima saldatura", "  ", "Collaudo"],
      moduleVisibility: { products: ["operatore", "hacker"], sconosciuto: ["admin"] },
    });
    expect(r.status).toBe(200);
    expect(r.body.settings.appName).toBe("Magazzino ACME");
    expect(r.body.settings.workPhases).toEqual(["Prima saldatura", "Collaudo"]); // dedup + no vuoti
    expect(r.body.settings.moduleVisibility.products).toEqual(["operatore"]);      // ruolo ignoto rimosso
    expect(r.body.settings.moduleVisibility.sconosciuto).toBeUndefined();          // chiave ignota rimossa
  });
});
