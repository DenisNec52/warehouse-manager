/**
 * tests/sessions.test.js
 *
 * Sessioni revocabili (User.tokenVersion) e policy password.
 */
const request = require("supertest");
const jwt  = require("jsonwebtoken");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");

jest.setTimeout(60000);
beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

const PW = "Password123!";
async function login(username, password = PW) {
  const a = request.agent(app);
  const r = await a.post("/api/auth/login").send({ username, password });
  expect(r.status).toBe(200);
  return a;
}
const me = async (a) => (await a.get("/api/auth/me")).status;

describe("Sessioni revocabili", () => {
  beforeEach(async () => {
    await User.create({ username: "capo", password: PW, name: "Capo", role: "admin" });
    await User.create({ username: "mario", password: PW, name: "Mario", role: "operatore" });
  });

  test("cambio password: le altre sessioni scadono, quella corrente resta valida", async () => {
    const telefono = await login("mario");
    const pc = await login("mario");
    const r = await pc.put("/api/auth/password").send({ currentPassword: PW, newPassword: "NuovaPassword123!" });
    expect(r.status).toBe(200);
    expect(await me(pc)).toBe(200);
    expect(await me(telefono)).toBe(401);
    await login("mario", "NuovaPassword123!");
  });

  test("esci da tutti i dispositivi", async () => {
    const a = await login("mario");
    const b = await login("mario");
    expect((await a.post("/api/auth/logout-all")).status).toBe(200);
    expect(await me(a)).toBe(401);
    expect(await me(b)).toBe(401);
    expect(await me(await login("mario"))).toBe(200);
  });

  test("reset password da admin: le sessioni dell'utente vengono chiuse", async () => {
    const mario = await login("mario");
    const capo = await login("capo");
    const id = (await User.findOne({ username: "mario" }))._id;
    expect((await capo.put(`/api/users/${id}/password`).send({ newPassword: "Resettata2026!" })).status).toBe(200);
    expect(await me(mario)).toBe(401);
    expect(await me(capo)).toBe(200);
  });

  test("disattivare e riattivare non fa tornare valido il vecchio token", async () => {
    const mario = await login("mario");
    const capo = await login("capo");
    const id = (await User.findOne({ username: "mario" }))._id;
    await capo.put(`/api/users/${id}/status`).send({ isActive: false });
    await capo.put(`/api/users/${id}/status`).send({ isActive: true });
    expect(await me(mario)).toBe(401);
  });

  test("i token emessi prima di questa versione (senza tv) restano validi finché non si revoca", async () => {
    const u = await User.findOne({ username: "mario" });
    const legacy = jwt.sign({ id: u._id, role: u.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const r = await request(app).get("/api/auth/me").set("Cookie", `wh_token=${legacy}`);
    expect(r.status).toBe(200);
    await User.updateOne({ _id: u._id }, { $inc: { tokenVersion: 1 } });
    expect((await request(app).get("/api/auth/me").set("Cookie", `wh_token=${legacy}`)).status).toBe(401);
  });

  test("tokenVersion non compare mai nelle risposte", async () => {
    const capo = await login("capo");
    const r = await capo.get("/api/users");
    expect(JSON.stringify(r.body)).not.toContain("tokenVersion");
    expect(JSON.stringify((await capo.get("/api/auth/me")).body)).not.toContain("tokenVersion");
  });

  test("le operazioni sulle password finiscono nel registro, senza la password", async () => {
    const mario = await login("mario");
    await mario.put("/api/auth/password").send({ currentPassword: PW, newPassword: "NuovaPassword123!" });
    const log = await AuditLog.findOne({ action: "user.password_change" }).lean();
    expect(log.actorName).toBe("Mario");
    expect(JSON.stringify(log)).not.toContain("NuovaPassword123!");
  });
});

describe("Policy password", () => {
  beforeEach(async () => {
    await User.create({ username: "capo", password: PW, name: "Capo", role: "admin" });
  });

  test("meno di 10 caratteri: rifiutata in creazione, cambio e reset", async () => {
    const capo = await login("capo");
    const c = await capo.post("/api/users").send({ username: "nuovo", password: "Corta123!", name: "Nuovo", role: "operatore" });
    expect(c.status).toBe(400);
    const ch = await capo.put("/api/auth/password").send({ currentPassword: PW, newPassword: "Corta123!" });
    expect(ch.status).toBe(400);
    const id = (await User.findOne({ username: "capo" }))._id;
    const rs = await request(app).post("/api/auth/reset-password").send({ userId: String(id), token: "x".repeat(40), newPassword: "Corta1" });
    expect(rs.status).toBe(400);
  });

  test("la password non può contenere lo username", async () => {
    const capo = await login("capo");
    const c = await capo.post("/api/users").send({ username: "giovanni", password: "giovanni2026!!", name: "G", role: "operatore" });
    expect(c.status).toBe(400);
  });

  test("username inesistente e password sbagliata danno la stessa risposta", async () => {
    const a = await request(app).post("/api/auth/login").send({ username: "nessuno", password: "qualcosa1234" });
    const b = await request(app).post("/api/auth/login").send({ username: "capo", password: "sbagliata1234" });
    expect([a.status, a.body.message]).toEqual([b.status, b.body.message]);
  });
});
