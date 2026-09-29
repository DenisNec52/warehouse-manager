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
  // Il badge punta a <frontend>/badge#u=<id>&s=<segreto>&src=qr|nfc: la pagina /badge
  // manda questi dati a POST /api/auth/badge-login.
  const badgeData = (url) => {
    const p = new URLSearchParams(new URL(url).hash.slice(1));
    return { userId: p.get("u"), secret: p.get("s"), src: p.get("src") };
  };

  async function loginAndRegenerate() {
    await createUser();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: "mario", password: "Password123!" });
    const regen = await agent.post("/api/auth/badge/regenerate");
    return { agent, regen };
  }

  test("regenerate → scansione → login → /me riconosce l'utente", async () => {
    const { regen } = await loginAndRegenerate();
    expect(regen.status).toBe(200);
    expect(regen.body.url).toMatch(/\/badge#u=[a-f0-9]{24}&s=.+&src=qr$/);
    expect(regen.body.nfcUrl).toMatch(/&src=nfc$/);
    expect(regen.body.qrImage).toMatch(/^data:image\/png;base64,/);

    // Un browser "fresco" (nessun cookie) che apre il badge
    const freshAgent = request.agent(app);
    const scan = await freshAgent.post("/api/auth/badge-login").send(badgeData(regen.body.url));
    expect(scan.status).toBe(200);
    expect(scan.body.user.username).toBe("mario");

    const me = await freshAgent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe("mario");
  });

  test("un segreto sbagliato o dati malformati non autenticano", async () => {
    const user = await createUser();
    const wrong = await request(app).post("/api/auth/badge-login")
      .send({ userId: String(user._id), secret: "segreto-completamente-inventato-lungo-abbastanza" });
    expect(wrong.status).toBe(401);
    expect((await request(app).post("/api/auth/badge-login").send({ userId: { $ne: null }, secret: "x".repeat(30) })).status).toBe(401);
    expect((await request(app).post("/api/auth/badge-login").send({})).status).toBe(401);
  });

  test("un badge disattivato smette di funzionare", async () => {
    const { agent, regen } = await loginAndRegenerate();
    await agent.put("/api/auth/badge/status").send({ enabled: false });
    const res = await request(app).post("/api/auth/badge-login").send(badgeData(regen.body.url));
    expect(res.status).toBe(401);
  });

  test("rigenerare il badge invalida immediatamente quello precedente", async () => {
    const { agent, regen: first } = await loginAndRegenerate();
    await agent.post("/api/auth/badge/regenerate");
    const res = await request(app).post("/api/auth/badge-login").send(badgeData(first.body.url));
    expect(res.status).toBe(401);
  });

  test("i link dei badge generati prima di /badge rimandano alla nuova pagina con gli stessi dati", async () => {
    const { regen } = await loginAndRegenerate();
    const { userId, secret } = badgeData(regen.body.url);
    const res = await request(app).get(`/api/auth/badge/${userId}/${secret}?src=nfc`);
    expect(res.status).toBe(302);
    expect(badgeData(res.headers.location)).toEqual({ userId, secret, src: "nfc" });

    const login = await request.agent(app).post("/api/auth/badge-login").send(badgeData(res.headers.location));
    expect(login.status).toBe(200);
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
