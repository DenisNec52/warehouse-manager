/**
 * tests/overview.test.js — panoramica della Home: tutti i reparti a colpo d'occhio.
 * Numeri per reparto (oggi, 7 giorni, in lavorazione, da avviare, 5S) e visibilità:
 * un operatore vede solo i propri reparti.
 */
const request = require("supertest");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");
const Department = require("../models/Department");
const ProductionEntry = require("../models/ProductionEntry");
const ChecklistSubmission = require("../models/ChecklistSubmission");
const mongoose = require("mongoose");

jest.setTimeout(60000);
beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

const romeDay = (offset = 0) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
};
const day = (iso) => new Date(`${iso}T00:00:00.000Z`);

async function login(username, role, extra = {}) {
  const u = await User.create({ username, password: "Password123!", name: username, role, ...extra });
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ username, password: "Password123!" });
  return { a, u };
}

function entry(dep, op, { data, quantita = 1, std = 60, impiegato, iniziata = false, finita = false, commessa = "1000" }) {
  return {
    data: day(data), department: dep._id, departmentName: dep.name, operatore: op._id, operatoreNome: op.name,
    commessa, posizione: "1", quantita, custodiaLabel: "T.C. PICCOLA", tempoStdMinuti: std,
    tempoImpiegatoMinuti: impiegato ?? std * quantita,
    iniziataAt: iniziata ? new Date() : null, finitaAt: finita ? new Date() : null,
  };
}

describe("Panoramica reparti per la Home", () => {
  test("numeri per reparto: oggi, settimana, in lavorazione, da avviare, 5S", async () => {
    const { a, u } = await login("capo", "supervisore");
    const prima = await Department.create({ name: "Prima Saldatura", order: 0 });
    const seconda = await Department.create({ name: "Seconda Saldatura", order: 1 });
    await ProductionEntry.insertMany([
      entry(prima, u, { data: romeDay(), quantita: 2, std: 60, impiegato: 100, iniziata: true }),     // in lavorazione
      entry(prima, u, { data: romeDay(), quantita: 1, std: 30, iniziata: true, finita: true }),
      entry(prima, u, { data: romeDay(-3), quantita: 4, std: 30 }),                                 // da avviare
      entry(prima, u, { data: romeDay(-20), quantita: 9 }),                                          // fuori finestra
      entry(seconda, u, { data: romeDay(-1), quantita: 5, std: 45 }),
    ]);
    await ChecklistSubmission.create({
      checklist: new mongoose.Types.ObjectId(), shift: "turno1", department: prima._id, departmentName: prima.name,
      cleaningType: "Ordinaria", date: romeDay(), submittedBy: u._id, submittedByName: u.name,
    });

    const r = await a.get("/api/production/overview");
    expect(r.status).toBe(200);
    expect(r.body.reparti.map((x) => x.name)).toEqual(["Prima Saldatura", "Seconda Saldatura"]);
    const [p, s] = r.body.reparti;
    expect(p.oggi).toEqual({ righe: 2, pezzi: 3, efficienza: Math.round((150 / 130) * 100) / 100 });
    expect(p.settimana.pezzi).toBe(7);                // 2 + 1 + 4 (la riga di 20 giorni fa è esclusa)
    expect(p.inLavorazione).toBe(1);
    expect(p.daAvviare).toBe(1);
    expect(p.fiveSOggi).toBe(1);
    expect(p.andamento).toHaveLength(14);
    expect(p.andamento.at(-1)).toMatchObject({ day: romeDay(), pezzi: 3 });
    expect(s.oggi.pezzi).toBe(0);
    expect(s.settimana.pezzi).toBe(5);
    expect(r.body.totale).toMatchObject({ pezziOggi: 3, inLavorazione: 1, daAvviare: 2, fiveSOggi: 1 });
  });

  test("un operatore vede solo i reparti a cui appartiene", async () => {
    const prima = await Department.create({ name: "Prima Saldatura", order: 0 });
    const seconda = await Department.create({ name: "Seconda Saldatura", order: 1 });
    const { a, u } = await login("mario", "operatore", { departments: [prima._id] });
    await ProductionEntry.insertMany([
      entry(prima, u, { data: romeDay(), quantita: 2 }),
      entry(seconda, u, { data: romeDay(), quantita: 7 }),
    ]);
    const r = await a.get("/api/production/overview");
    expect(r.status).toBe(200);
    expect(r.body.reparti.map((x) => x.name)).toEqual(["Prima Saldatura"]);
    expect(r.body.totale.pezziOggi).toBe(2);           // i 7 pezzi della Seconda non trapelano nei totali
  });

  test("senza login: 401", async () => {
    expect((await request(app).get("/api/production/overview")).status).toBe(401);
  });
});
