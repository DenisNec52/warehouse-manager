/**
 * Regressioni delle falle trovate dalla simulazione di attacchi prima della 1.1.0.
 * Ogni test riproduce l'attacco: se una modifica futura riapre la falla, la CI lo segnala.
 */
const request  = require("supertest");
const mongoose = require("mongoose");
const app      = require("../app");
const db       = require("./db");
const User     = require("../models/User");
const Category = require("../models/Category");

jest.setTimeout(60000);
beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

const PW = "Password123!";
async function agent(username, role) {
  await User.create({ username, password: PW, name: username, role });
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ username, password: PW });
  return a;
}
const cookieOf = async (username) =>
  (await request(app).post("/api/auth/login").send({ username, password: PW })).headers["set-cookie"];

describe("Sessioni revocabili", () => {
  test("dopo il cambio password le altre sessioni (cookie rubato) non valgono più, quella corrente sì", async () => {
    const me = await agent("mario", "operatore");
    const stolen = await cookieOf("mario");
    expect((await request(app).get("/api/auth/me").set("Cookie", stolen)).status).toBe(200);

    expect((await me.put("/api/auth/password").send({ currentPassword: PW, newPassword: "NuovaPass456!" })).status).toBe(200);
    expect((await request(app).get("/api/auth/me").set("Cookie", stolen)).status).toBe(401);
    expect((await me.get("/api/auth/me")).status).toBe(200); // chi l'ha cambiata resta dentro
  });

  test("il logout revoca il token anche se copiato prima", async () => {
    await User.create({ username: "anna", password: PW, name: "anna", role: "operatore" });
    const copy = await cookieOf("anna");
    await request(app).post("/api/auth/logout").set("Cookie", copy);
    expect((await request(app).get("/api/auth/me").set("Cookie", copy)).status).toBe(401);
  });
});

describe("Robustezza degli handler", () => {
  test("un errore async non gestito diventa 500, il server resta in piedi", async () => {
    const admin = await agent("capo", "admin");
    const cat = await Category.create({ name: "Viti" });
    // _id nel body: prima mandava in crash l'intero processo (Promise rifiutata non gestita)
    const r = await admin.put(`/api/categories/${cat._id}`).send({ name: "Bulloni", _id: String(new mongoose.Types.ObjectId()) });
    expect(r.status).toBeLessThan(500);
    expect((await admin.get("/api/categories")).status).toBe(200);
  });

  test("categoria: solo i campi ammessi arrivano al DB", async () => {
    const admin = await agent("capo", "admin");
    const owner = await User.findOne({ username: "capo" });
    const cat = await Category.create({ name: "Viti", createdBy: owner._id });
    await admin.put(`/api/categories/${cat._id}`).send({ name: "Bulloni", createdBy: String(new mongoose.Types.ObjectId()), isActive: false });
    const after = await Category.findById(cat._id).lean();
    expect(after.name).toBe("Bulloni");
    expect(String(after.createdBy)).toBe(String(owner._id));
    expect(after.isActive).toBe(true);
  });
});

describe("Input dalla query", () => {
  test("checklist: il mese finisce in una regex, quindi solo YYYY-MM", async () => {
    const capo = await agent("capo", "supervisore");
    expect((await capo.get("/api/checklist/submissions").query({ month: "(.*a){25}" })).status).toBe(400);
    expect((await capo.get("/api/checklist/monthly-report").query({ month: ".*" })).status).toBe(400);
    expect((await capo.get("/api/checklist/monthly-report").query({ month: "2026-11" })).status).toBe(200);
  });

  test("paginazione con un tetto massimo", async () => {
    const admin = await agent("capo", "admin");
    const r = await admin.get("/api/movements").query({ limit: "1000000000", page: "-3" });
    expect(r.status).toBe(200);
    expect(r.body.pagination.limit).toBeLessThanOrEqual(100);
    expect(r.body.pagination.page).toBe(1);
  });

  test("movimenti: oggetti o id non validi nei filtri → 400, mai 500", async () => {
    const admin = await agent("capo", "admin");
    expect((await admin.get("/api/movements").query({ "productId[ne]": "x" })).status).toBe(400);
    expect((await admin.get("/api/movements").query({ "type[gt]": "a" })).status).toBe(200); // ignorato
    expect((await admin.get("/api/movements").query({ from: "non-una-data" })).status).toBe(400);
  });
});

describe("Altri controlli", () => {
  test("tema: accento solo predefinito o esadecimale (finisce in una variabile CSS)", async () => {
    const op = await agent("oper", "operatore");
    expect((await op.put("/api/auth/theme").send({ accentColor: "red;}</style><script>x</script>" })).status).toBe(400);
    expect((await op.put("/api/auth/theme").send({ accentColor: "green" })).status).toBe(200);
    expect((await op.put("/api/auth/theme").send({ accentColor: "#12ab34", mode: "dark" })).body.theme.accentColor).toBe("#12ab34");
  });

  test("password: minimo 8 caratteri per quelle nuove", async () => {
    const op = await agent("oper", "operatore");
    expect((await op.put("/api/auth/password").send({ currentPassword: PW, newPassword: "corta1" })).status).toBe(400);
  });

  test("health non rivela l'ambiente", async () => {
    const r = await request(app).get("/api/health");
    expect(r.status).toBe(200);
    expect(r.body.env).toBeUndefined();
  });
});
