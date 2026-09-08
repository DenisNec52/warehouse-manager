const request = require("supertest");
const app   = require("../app");
const db    = require("./db");
const User  = require("../models/User");
const emailUtil = require("../utils/email");

jest.setTimeout(60000); // il primo avvio di mongodb-memory-server scarica un binario

beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); jest.restoreAllMocks(); });
afterAll(async () => { await db.disconnect(); });

async function createUser(overrides = {}) {
  return User.create({
    username: "mario",
    password: "Password123!",
    name:     "Mario Rossi",
    role:     "operatore",
    ...overrides,
  });
}

describe("POST /api/auth/login", () => {
  test("accetta credenziali corrette e imposta il cookie di sessione", async () => {
    await createUser();
    const res = await request(app).post("/api/auth/login").send({ username: "mario", password: "Password123!" });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: "mario", name: "Mario Rossi", role: "operatore" });
    expect(res.headers["set-cookie"].some(c => c.startsWith("wh_token="))).toBe(true);
  });

  test("rifiuta una password sbagliata senza rivelare quale campo è errato", async () => {
    await createUser();
    const res = await request(app).post("/api/auth/login").send({ username: "mario", password: "sbagliata" });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/non valide/i);
  });

  test("rifiuta un utente disattivato", async () => {
    await createUser({ isActive: false });
    const res = await request(app).post("/api/auth/login").send({ username: "mario", password: "Password123!" });
    expect(res.status).toBe(401);
  });
});

describe("Login automatico da badge QR/NFC", () => {
  test("regenerate → scansione → login automatico → /me riconosce l'utente", async () => {
    await createUser();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: "mario", password: "Password123!" });

    const regen = await agent.post("/api/auth/badge/regenerate");
    expect(regen.status).toBe(200);
    expect(regen.body.url).toMatch(/\/api\/auth\/badge\/[a-f0-9]{24}\/.+/);
    expect(regen.body.qrImage).toMatch(/^data:image\/png;base64,/);

    const badgePath = new URL(regen.body.url).pathname + new URL(regen.body.url).search;

    // Un browser "fresco" (nessun cookie) che apre il link del QR/NFC
    const freshAgent = request.agent(app);
    const scan = await freshAgent.get(badgePath);
    expect(scan.status).toBe(302);
    expect(scan.headers.location).toContain("/?badge=ok");

    const me = await freshAgent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe("mario");
  });

  test("un segreto sbagliato non autentica e rimanda al login con errore", async () => {
    const user = await createUser();
    const badPath = `/api/auth/badge/${user._id}/segreto-completamente-inventato-lungo-abbastanza`;
    const res = await request(app).get(badPath);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/login?badge=error");
  });

  test("un badge disattivato smette di funzionare", async () => {
    await createUser();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: "mario", password: "Password123!" });
    const regen = await agent.post("/api/auth/badge/regenerate");
    await agent.put("/api/auth/badge/status").send({ enabled: false });

    const badgePath = new URL(regen.body.url).pathname + new URL(regen.body.url).search;
    const res = await request(app).get(badgePath);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/login?badge=error");
  });

  test("rigenerare il badge invalida immediatamente quello precedente", async () => {
    await createUser();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: "mario", password: "Password123!" });

    const first  = await agent.post("/api/auth/badge/regenerate");
    const oldPath = new URL(first.body.url).pathname + new URL(first.body.url).search;

    await agent.post("/api/auth/badge/regenerate"); // rigenera → invalida il primo

    const res = await request(app).get(oldPath);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/login?badge=error");
  });
});

describe("Recupero password", () => {
  test("flusso completo: richiesta → link → reset → login automatico", async () => {
    await createUser({ email: "mario@example.it" });
    const sendSpy = jest.spyOn(emailUtil, "sendPasswordReset");

    const forgot = await request(app).post("/api/auth/forgot-password").send({ username: "mario" });
    expect(forgot.status).toBe(200);
    expect(sendSpy).toHaveBeenCalledTimes(1);

    const resetUrl = new URL(sendSpy.mock.calls[0][1]);
    const userId = resetUrl.searchParams.get("uid");
    const token  = resetUrl.searchParams.get("token");
    expect(userId).toBeTruthy();
    expect(token).toBeTruthy();

    const reset = await request(app).post("/api/auth/reset-password").send({ userId, token, newPassword: "NuovaPassword123!" });
    expect(reset.status).toBe(200);
    expect(reset.body.user.username).toBe("mario");

    // La vecchia password non funziona più, la nuova sì
    const oldLogin = await request(app).post("/api/auth/login").send({ username: "mario", password: "Password123!" });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post("/api/auth/login").send({ username: "mario", password: "NuovaPassword123!" });
    expect(newLogin.status).toBe(200);
  });

  test("lo stesso token non può essere riutilizzato una seconda volta", async () => {
    await createUser({ email: "mario@example.it" });
    const sendSpy = jest.spyOn(emailUtil, "sendPasswordReset");
    await request(app).post("/api/auth/forgot-password").send({ username: "mario" });
    const resetUrl = new URL(sendSpy.mock.calls[0][1]);
    const userId = resetUrl.searchParams.get("uid");
    const token  = resetUrl.searchParams.get("token");

    const first  = await request(app).post("/api/auth/reset-password").send({ userId, token, newPassword: "PrimaPassword1!" });
    expect(first.status).toBe(200);

    const second = await request(app).post("/api/auth/reset-password").send({ userId, token, newPassword: "SecondaPassword1!" });
    expect(second.status).toBe(400);
  });

  test("un token scaduto viene rifiutato", async () => {
    const user = await createUser({ email: "mario@example.it" });
    const sendSpy = jest.spyOn(emailUtil, "sendPasswordReset");
    await request(app).post("/api/auth/forgot-password").send({ username: "mario" });
    const resetUrl = new URL(sendSpy.mock.calls[0][1]);
    const token = resetUrl.searchParams.get("token");

    await User.findByIdAndUpdate(user._id, { resetPasswordExpires: new Date(Date.now() - 1000) });

    const res = await request(app).post("/api/auth/reset-password").send({ userId: user._id.toString(), token, newPassword: "NuovaPassword123!" });
    expect(res.status).toBe(400);
  });

  test("risposta generica identica sia per username esistente sia inesistente (anti-enumeration)", async () => {
    await createUser({ email: "mario@example.it" });
    const withUser  = await request(app).post("/api/auth/forgot-password").send({ username: "mario" });
    const noUser    = await request(app).post("/api/auth/forgot-password").send({ username: "utente-che-non-esiste" });
    expect(withUser.status).toBe(noUser.status);
    expect(withUser.body).toEqual(noUser.body);
  });
});
