/**
 * tests/bolle.test.js — PDF della bolla per POSIZIONE di commessa.
 * Spenta → 404 per tutti; accesa solo dal super-admin; caricano solo supervisore/admin,
 * vedono tutti; solo veri PDF (magic bytes); ogni posizione ha la sua bolla;
 * sostituzione ed eliminazione puliscono GridFS.
 */
const request  = require("supertest");
const mongoose = require("mongoose");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");

jest.setTimeout(60000);
beforeAll(async () => { await db.connect(); });
afterEach(async () => {
  await db.clearCollections();
  // GridFS non è un modello mongoose: clearCollections non svuota le sue collezioni
  for (const c of ["bolle.files", "bolle.chunks"]) await mongoose.connection.db.collection(c).deleteMany({});
});
afterAll(async () => { await db.disconnect(); });

const PDF  = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const PDF2 = Buffer.from("%PDF-1.7\n% seconda versione\n%%EOF\n");
const FAKE = Buffer.from("MZ\x90\x00 eseguibile travestito da pdf");

async function agent(username, role, extra = {}) {
  await User.create({ username, password: "Password123!", name: username, role, ...extra });
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ username, password: "Password123!" });
  return a;
}
const enable = (superA, on = true) => superA.put("/api/settings").send({ features: { bollaPdf: on } });
const upload = (a, commessa, posizione, buf, name = "bolla.pdf") =>
  a.put("/api/bolle").query({ commessa, posizione }).attach("file", buf, { filename: name, contentType: "application/pdf" });
const download = (a, commessa, posizione) => a.get("/api/bolle/file").query({ commessa, posizione }).buffer(true)
  .parse((res, cb) => { const c = []; res.on("data", (d) => c.push(d)); res.on("end", () => cb(null, Buffer.concat(c))); });
const gridFiles = () => mongoose.connection.db.collection("bolle.files").countDocuments();
const settle = async (n) => { for (let i = 0; i < 20 && (await gridFiles()) !== n; i++) await new Promise((r) => setTimeout(r, 50)); };

describe("Bolle PDF per posizione", () => {
  test("spenta di default: 404 anche per il super-admin, e nessun file accettato", async () => {
    const sup = await agent("super", "admin", { isSuperAdmin: true });
    expect((await sup.get("/api/settings")).body.settings.features.bollaPdf).toBe(false);
    expect((await sup.get("/api/bolle")).status).toBe(404);
    expect((await upload(sup, "2630", "1", PDF)).status).toBe(404);
    expect(await gridFiles()).toBe(0);
  });

  test("solo il super-admin la accende (un admin normale riceve 403)", async () => {
    const admin = await agent("admin", "admin");
    expect((await enable(admin)).status).toBe(403);
    const sup = await agent("super", "admin", { isSuperAdmin: true });
    const r = await enable(sup);
    expect(r.status).toBe(200);
    expect(r.body.settings.features.bollaPdf).toBe(true);
  });

  test("stessa commessa, posizioni diverse: una bolla per posizione, indipendenti", async () => {
    const sup = await agent("super", "admin", { isSuperAdmin: true });
    await enable(sup);
    expect((await upload(sup, "2961", "1", PDF)).status).toBe(201);
    expect((await upload(sup, "2961", "9", PDF2)).status).toBe(201);
    expect((await upload(sup, "2961", "", PDF)).status).toBe(201);           // riga senza posizione

    const list = (await sup.get("/api/bolle")).body.bolle.map((b) => `${b.commessa}/${b.posizione}`);
    expect(list).toEqual(["2961/", "2961/1", "2961/9"]);

    const p9 = await download(sup, "2961", "9");
    expect(Buffer.compare(p9.body, PDF2)).toBe(0);                          // il PDF giusto per la pos. 9
    expect((await download(sup, "2961", "2")).status).toBe(404);           // pos. 2: nessuna bolla

    expect((await sup.delete("/api/bolle").query({ commessa: "2961", posizione: "1" })).status).toBe(200);
    await settle(2);
    expect(await gridFiles()).toBe(2);
    expect((await download(sup, "2961", "9")).status).toBe(200);           // le altre restano
  });

  test("supervisore carica, operatore vede ma non carica né elimina", async () => {
    const sup = await agent("super", "admin", { isSuperAdmin: true });
    await enable(sup);
    const capo = await agent("capo", "supervisore");
    const op   = await agent("operaio", "operatore");

    expect((await upload(op, "2630", "1", PDF)).status).toBe(403);
    expect((await upload(capo, "2630", "1", PDF)).status).toBe(201);

    const file = await download(op, "2630", "1");
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toBe("application/pdf");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    expect(file.headers["content-disposition"]).toMatch(/bolla-2630-1\.pdf/);
    expect(Buffer.compare(file.body, PDF)).toBe(0);

    expect((await op.delete("/api/bolle").query({ commessa: "2630", posizione: "1" })).status).toBe(403);
  });

  test("rifiuta un file che non è un vero PDF (estensione falsa)", async () => {
    const sup = await agent("super", "admin", { isSuperAdmin: true });
    await enable(sup);
    expect((await upload(sup, "2630", "1", FAKE, "bolla.pdf")).status).toBe(400);
    expect(await gridFiles()).toBe(0);
  });

  test("rifiuta commesse/posizioni con caratteri pericolosi o parametri a forma di oggetto", async () => {
    const sup = await agent("super", "admin", { isSuperAdmin: true });
    await enable(sup);
    expect((await upload(sup, "../../etc", "1", PDF)).status).toBe(400);
    expect((await upload(sup, "2630", "1/../2", PDF)).status).toBe(400);
    expect((await sup.get("/api/bolle/file?commessa[]=2630&posizione=1")).status).toBe(400);
    expect(await gridFiles()).toBe(0);
  });

  test("sostituire e poi eliminare non lascia file orfani in GridFS", async () => {
    const sup = await agent("super", "admin", { isSuperAdmin: true });
    await enable(sup);
    expect((await upload(sup, "2961", "9", PDF)).status).toBe(201);
    expect((await upload(sup, "2961", "9", PDF2)).status).toBe(200);
    await settle(1);
    expect(await gridFiles()).toBe(1);
    expect((await sup.delete("/api/bolle").query({ commessa: "2961", posizione: "9" })).status).toBe(200);
    await settle(0);
    expect(await gridFiles()).toBe(0);
  });

  test("se viene spenta dopo, le bolle esistenti non sono più raggiungibili", async () => {
    const sup = await agent("super", "admin", { isSuperAdmin: true });
    await enable(sup);
    await upload(sup, "2400", "1", PDF);
    await enable(sup, false);
    expect((await download(sup, "2400", "1")).status).toBe(404);
  });
});
