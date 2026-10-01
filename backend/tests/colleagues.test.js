const request = require("supertest");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");
const Department   = require("../models/Department");
const Notification = require("../models/Notification");
const Migration    = require("../models/Migration");
const { runMigrations } = require("../utils/migrations");

jest.setTimeout(60000);

beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

async function agentFor(username, role, extra = {}) {
  const user = await User.create({ username, password: "Password123!", name: `Nome ${username}`, role, ...extra });
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ username, password: "Password123!" });
  agent.id = String(user._id);
  return agent;
}
const names = (rows, field) => rows.map((r) => (typeof r[field] === "string" ? r[field] : r[field]?.name)).sort();

describe("Visibilità dei colleghi per mansione (reparto)", () => {
  let prima, seconda, capo, anna, bruno, carlo, nadia, std;

  beforeEach(async () => {
    await runMigrations({ log: () => {} });
    prima = await Department.findOne({ name: "Prima Saldatura" });
    seconda = await Department.findOne({ name: "Seconda Saldatura" });
    capo  = await agentFor("capo", "supervisore");
    anna  = await agentFor("anna", "operatore", { departments: [prima._id] });   // Prima
    bruno = await agentFor("bruno", "operatore", { departments: [prima._id] });  // Prima: collega di Anna
    carlo = await agentFor("carlo", "operatore", { departments: [seconda._id] }); // Seconda
    nadia = await agentFor("nadia", "operatore");                                 // nessun reparto

    // Un tempo standard in Prima Saldatura per poter registrare righe
    std = (await capo.post("/api/production/standard-times").send({ department: String(prima._id), tipologia: "Tubo", dimensione: "", label: "Tubo", minuti: 30 })).body.standardTime;
    const secondaStd = (await capo.get(`/api/production/standard-times?department=${seconda._id}`)).body.standardTimes[0];
    const row = (department, standardTime) => ({ department: String(department), data: "2026-09-30", commessa: "1", quantita: 1, standardTime, tempoImpiegatoMinuti: 30 });
    for (const a of [anna, bruno, nadia]) expect((await a.post("/api/production/entries").send(row(prima._id, std._id))).status).toBe(201);
    expect((await carlo.post("/api/production/entries").send(row(seconda._id, secondaStd._id))).status).toBe(201);
  });

  test("Andon: un operaio vede solo le righe dei colleghi del suo reparto (anche se la riga è nel suo reparto)", async () => {
    const rows = (await anna.get("/api/production/entries")).body.entries;
    // la riga di Nadia è in Prima Saldatura, ma Nadia non è del reparto di Anna
    expect(names(rows, "operatoreNome")).toEqual(["Nome anna", "Nome bruno"]);
  });

  test("statistiche e report per operatore: solo colleghi", async () => {
    const stats = (await anna.get("/api/production/stats")).body;
    expect(names(stats.perOperatore, "nome")).toEqual(["Nome anna", "Nome bruno"]);
    const rep = (await anna.get(`/api/production/report?period=giorno&date=2026-09-30&department=${prima._id}`)).body;
    expect(names(rep.perOperatore, "nome")).toEqual(["Nome anna", "Nome bruno"]);
  });

  test("operaio senza reparto: vede solo sé stesso, ma può continuare a lavorare", async () => {
    const rows = (await nadia.get("/api/production/entries")).body.entries;
    expect(names(rows, "operatoreNome")).toEqual(["Nome nadia"]);
  });

  test("supervisore: vede tutti gli operai", async () => {
    const rows = (await capo.get("/api/production/entries")).body.entries;
    expect(names(rows, "operatoreNome")).toEqual(["Nome anna", "Nome bruno", "Nome carlo", "Nome nadia"]);
  });

  test("movimenti: colleghi di altri reparti come 'Altro operatore', filtro per utente limitato", async () => {
    const product = (await capo.post("/api/products").send({ code: "P1", name: "Lamiera", quantity: 100, minQuantity: 0 })).body.product;
    for (const a of [bruno, carlo]) {
      expect((await a.post("/api/movements").send({ productId: product._id, type: "OUT", quantity: 1 })).status).toBe(201);
    }
    const list = (await anna.get("/api/movements")).body.movements;
    expect(names(list, "performedBy")).toEqual(["Altro operatore", "Nome bruno"]);
    const hidden = list.find((m) => m.performedBy.name === "Altro operatore");
    expect(hidden.performedBy).toEqual({ name: "Altro operatore", username: null, role: null });
    expect(hidden.performedByName).toBe("Altro operatore");          // anche la copia del nome salvata nel movimento
    expect(list.find((m) => m.performedBy.name === "Nome bruno").performedByName).toBe("Nome bruno");
    expect(JSON.stringify((await anna.get("/api/movements")).body)).not.toContain("carlo");   // il nome non compare da nessuna parte
    const detail = (await anna.get(`/api/movements/${hidden._id}`)).body.movement;
    expect([detail.performedBy.name, detail.performedByName]).toEqual(["Altro operatore", "Altro operatore"]);

    const history = (await anna.get(`/api/movements/product/${product._id}`)).body.movements;
    expect(names(history, "performedBy")).toEqual(["Altro operatore", "Nome bruno"]);
    const recent = (await anna.get("/api/dashboard/stats")).body.recentMovements;
    expect(names(recent, "performedBy")).toEqual(["Altro operatore", "Nome bruno"]);

    expect((await anna.get(`/api/movements?userId=${carlo.id}`)).status).toBe(403);
    expect((await anna.get(`/api/movements?userId=${bruno.id}`)).status).toBe(200);
    // il supervisore vede tutti i nomi
    expect(names((await capo.get("/api/movements")).body.movements, "performedBy")).toEqual(["Nome bruno", "Nome carlo"]);
    // dettaglio prodotto: chi l'ha creato (il supervisore, senza reparto in comune) è nascosto
    expect((await anna.get(`/api/products/${product._id}`)).body.product.createdBy.name).toBe("Altro operatore");
    expect((await capo.get(`/api/products/${product._id}`)).body.product.createdBy.name).toBe("Nome capo");
  });

  test("notifiche dei movimenti (con il nome) solo ad admin e supervisori", async () => {
    const product = (await capo.post("/api/products").send({ code: "P2", name: "Tubo", quantity: 5, minQuantity: 3 })).body.product;
    await carlo.post("/api/movements").send({ productId: product._id, type: "OUT", quantity: 3 });   // scende sotto soglia
    const forAnna = (await anna.get("/api/notifications")).body.notifications.map((n) => n.type);
    const forCapo = (await capo.get("/api/notifications")).body.notifications.map((n) => n.type);
    expect(forAnna).not.toContain("movement");
    expect(forAnna).toContain("low_stock");          // le scorte basse restano per tutti (nessun nome)
    expect(forCapo).toEqual(expect.arrayContaining(["movement", "low_stock"]));
  });

  test("migrazione: le vecchie notifiche generali dei movimenti diventano solo per i responsabili", async () => {
    await Notification.create({ type: "movement", title: "Uscita", message: "3 pz rimossi da Carlo.", userId: null });
    await Migration.deleteOne({ name: "2026-10-01-notification-audience" });
    await runMigrations({ log: () => {} });
    expect((await anna.get("/api/notifications")).body.notifications.map((n) => n.message)).not.toContain("3 pz rimossi da Carlo.");
    expect((await capo.get("/api/notifications")).body.notifications.map((n) => n.message)).toContain("3 pz rimossi da Carlo.");
  });
});
