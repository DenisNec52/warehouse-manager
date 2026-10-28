/**
 * tests/integration-api.test.js — API di integrazione /api/v1 e gestione
 * chiavi/webhook da /api/integrations.
 */
const http    = require("http");
const crypto  = require("crypto");
const request = require("supertest");
const app  = require("../app");
const db   = require("./db");
const User = require("../models/User");
const Product     = require("../models/Product");
const Movement    = require("../models/Movement");
const Reservation = require("../models/Reservation");
const AuditLog    = require("../models/AuditLog");
const ProductionEntry = require("../models/ProductionEntry");
const Department  = require("../models/Department");
const webhooks    = require("../services/webhooks");

jest.setTimeout(90000);
beforeAll(async () => { await db.connect(); });
afterEach(async () => { await db.clearCollections(); });
afterAll(async () => { await db.disconnect(); });

const PW = "Password123!";
const ALL = ["products:read", "movements:read", "movements:write", "reservations:read", "reservations:write", "production:read"];

async function adminAgent(username = "capo") {
  await User.create({ username, password: PW, name: `Nome ${username}`, role: "admin" });
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ username, password: PW });
  return a;
}
async function newKey(admin, scopes = ALL, extra = {}) {
  const r = await admin.post("/api/integrations/keys").send({ name: "Gestionale offerte", scopes, ...extra });
  expect(r.status).toBe(201);
  return r.body;
}
const api = (key) => ({
  get:  (url) => request(app).get(url).set("Authorization", `Bearer ${key}`),
  post: (url, body, idem = crypto.randomUUID()) => {
    const r = request(app).post(url).set("Authorization", `Bearer ${key}`);
    if (idem) r.set("Idempotency-Key", idem);
    return r.send(body);
  },
});

describe("Chiavi API", () => {
  test("solo un admin crea chiavi; la chiave in chiaro compare una sola volta", async () => {
    const admin = await adminAgent();
    await User.create({ username: "sup", password: PW, name: "Sup", role: "supervisore" });
    const sup = request.agent(app);
    await sup.post("/api/auth/login").send({ username: "sup", password: PW });
    expect((await sup.post("/api/integrations/keys").send({ name: "X", scopes: ["products:read"] })).status).toBe(403);

    const { key, apiKey } = await newKey(admin, ["products:read"]);
    expect(key).toMatch(/^whk_[A-Za-z0-9]{10}_[A-Za-z0-9_-]{43}$/);
    const list = (await admin.get("/api/integrations/keys")).body.keys;
    expect(JSON.stringify(list)).not.toContain(key);
    expect(list[0]).toMatchObject({ id: apiKey.id, prefix: apiKey.prefix, active: true });
  });

  test("chiave mancante, sbagliata, revocata, owner disattivato, scope mancante", async () => {
    const admin = await adminAgent();
    const { key, apiKey } = await newKey(admin, ["products:read"]);
    expect((await request(app).get("/api/v1/me")).status).toBe(401);
    expect((await api(key.slice(0, -1) + "x").get("/api/v1/me")).status).toBe(401);
    expect((await api(key).get("/api/v1/me")).body.data.scopes).toEqual(["products:read"]);
    expect((await api(key).get("/api/v1/movements")).status).toBe(403);   // scope mancante

    await User.updateOne({ username: "capo" }, { isActive: false });
    const r = await api(key).get("/api/v1/me");
    expect([r.status, r.body.error.code]).toEqual([401, "key_owner_inactive"]);
    await User.updateOne({ username: "capo" }, { isActive: true });

    expect((await admin.delete(`/api/integrations/keys/${apiKey.id}`)).status).toBe(200);
    expect((await api(key).get("/api/v1/me")).body.error.code).toBe("key_revoked");
  });

  test("allowlist IP: chiave usabile solo dall'IP indicato", async () => {
    const admin = await adminAgent();
    const { key } = await newKey(admin, ["products:read"], { allowedIps: ["203.0.113.7"] });
    const r = await api(key).get("/api/v1/me");
    expect([r.status, r.body.error.code]).toEqual([403, "ip_not_allowed"]);
    // X-Forwarded-For falsificato non basta: in produzione il proxy di Render ACCODA
    // l'IP reale del chiamante e l'allowlist usa quello (ultimo valore), non il primo.
    const viaProxy = (xff) => request(app).get("/api/v1/me").set("Authorization", `Bearer ${key}`).set("X-Forwarded-For", xff);
    expect((await viaProxy("203.0.113.7, 198.51.100.20")).status).toBe(403);
    expect((await viaProxy("1.1.1.1, 203.0.113.7")).status).toBe(200);
  });
});

describe("Prodotti e disponibilità", () => {
  let key;
  beforeEach(async () => {
    const admin = await adminAgent();
    key = (await newKey(admin)).key;
    await Product.create([
      { code: "1534-1", name: "Flangia", quantity: 30, pallet: 1, arrivalDate: new Date("2026-01-10") },
      { code: "1534-1", name: "Flangia", quantity: 70, pallet: 2, arrivalDate: new Date("2026-03-01") },
      { code: "999-1",  name: "Tubo",    quantity: 5 },
      { code: "OLD-1",  name: "Vecchio", quantity: 0, isActive: false },
    ]);
  });

  test("lista con cursore: tutte le pagine, nessun duplicato, inattivi solo se richiesti", async () => {
    const seen = [];
    let cursor = null;
    for (let i = 0; i < 5; i++) {
      const r = await api(key).get(`/api/v1/products?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
      expect(r.status).toBe(200);
      seen.push(...r.body.data.map((p) => p.id));
      cursor = r.body.nextCursor;
      if (!r.body.hasMore) break;
    }
    expect(new Set(seen).size).toBe(3);
    const all = await api(key).get("/api/v1/products?includeInactive=true");
    expect(all.body.data).toHaveLength(4);
    expect((await api(key).get("/api/v1/products?cursor=rotto")).body.error.code).toBe("invalid_cursor");
  });

  test("stock per codice somma le pedane", async () => {
    const r = await api(key).get("/api/v1/stock?codes=1534-1,999-1,NONESISTE");
    expect(r.status).toBe(200);
    const byCode = Object.fromEntries(r.body.data.map((x) => [x.code, x]));
    expect(byCode["1534-1"]).toMatchObject({ quantity: 100, reserved: 0, available: 100 });
    expect(byCode["1534-1"].products).toHaveLength(2);
    expect(byCode.NONESISTE).toMatchObject({ quantity: 0, available: 0 });
  });
});

describe("Prenotazioni", () => {
  let key, admin;
  beforeEach(async () => {
    admin = await adminAgent();
    key = (await newKey(admin)).key;
    await Product.create([
      { code: "1534-1", name: "Flangia", quantity: 30, pallet: 1, arrivalDate: new Date("2026-01-10") },
      { code: "1534-1", name: "Flangia", quantity: 70, pallet: 2, arrivalDate: new Date("2026-03-01") },
      { code: "999-1",  name: "Tubo",    quantity: 5 },
    ]);
  });

  test("prenota, riduce il disponibile, rilascia", async () => {
    const r = await api(key).post("/api/v1/reservations", { externalRef: "OFF-1", items: [{ code: "1534-1", quantity: 40 }, { code: "1534-1", quantity: 10 }] });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ externalRef: "OFF-1", status: "active", items: [{ code: "1534-1", quantity: 50 }] });
    expect(r.body.data.expiresAt).toBeTruthy();   // mai eterna
    const s = (await api(key).get("/api/v1/stock?codes=1534-1")).body.data[0];
    expect([s.quantity, s.reserved, s.available]).toEqual([100, 50, 50]);

    const rel = await api(key).post(`/api/v1/reservations/${r.body.data.id}/release`, {});
    expect(rel.body.data.status).toBe("released");
    expect((await api(key).get("/api/v1/stock?codes=1534-1")).body.data[0].available).toBe(100);
    expect((await api(key).post(`/api/v1/reservations/${r.body.data.id}/release`, {})).status).toBe(409);
  });

  test("tutto o niente: una riga mancante → 409 con il dettaglio, nulla prenotato", async () => {
    const r = await api(key).post("/api/v1/reservations", { externalRef: "OFF-2", items: [{ code: "1534-1", quantity: 10 }, { code: "999-1", quantity: 6 }] });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("insufficient_stock");
    expect(r.body.error.details).toEqual([{ code: "999-1", requested: 6, available: 5, exists: true }]);
    expect(await Reservation.countDocuments()).toBe(0);
  });

  test("due prenotazioni simultanee non superano il disponibile", async () => {
    const [a, b, c] = await Promise.all([
      api(key).post("/api/v1/reservations", { externalRef: "A", items: [{ code: "1534-1", quantity: 60 }] }),
      api(key).post("/api/v1/reservations", { externalRef: "B", items: [{ code: "1534-1", quantity: 60 }] }),
      api(key).post("/api/v1/reservations", { externalRef: "C", items: [{ code: "1534-1", quantity: 60 }] }),
    ]);
    const statuses = [a.status, b.status, c.status].sort();
    expect(statuses).toEqual([201, 409, 409]);
    const s = (await api(key).get("/api/v1/stock?codes=1534-1")).body.data[0];
    expect(s.reserved).toBe(60);
  });

  test("le prenotazioni scadute non impegnano più materiale", async () => {
    await Reservation.create({ externalRef: "OLD", items: [{ code: "999-1", quantity: 5 }], expiresAt: new Date(Date.now() - 1000) });
    expect((await api(key).get("/api/v1/stock?codes=999-1")).body.data[0].available).toBe(5);
    const list = (await api(key).get("/api/v1/reservations?status=expired")).body.data;
    expect(list.map((x) => [x.externalRef, x.status])).toEqual([["OLD", "expired"]]);
  });

  test("consumo: uscite FIFO tra le pedane, tracciate e collegate all'offerta", async () => {
    const r = (await api(key).post("/api/v1/reservations", { externalRef: "OFF-9", items: [{ code: "1534-1", quantity: 45 }] })).body.data;
    const c = await api(key).post(`/api/v1/reservations/${r.id}/consume`, {});
    expect(c.status).toBe(200);
    expect(c.body.data.status).toBe("consumed");
    expect(c.body.data.movements.map((m) => [m.type, m.quantity, m.quantityBefore, m.quantityAfter, m.externalRef, m.source]))
      .toEqual([["OUT", 30, 30, 0, "OFF-9", "api"], ["OUT", 15, 70, 55, "OFF-9", "api"]]);
    const s = (await api(key).get("/api/v1/stock?codes=1534-1")).body.data[0];
    expect([s.quantity, s.reserved, s.available]).toEqual([55, 0, 55]);

    const m = await Movement.findOne({ externalRef: "OFF-9" }).lean();
    expect(m.performedByName).toBe("API · Gestionale offerte");
    const log = await AuditLog.findOne({ action: "reservation.consume" }).lean();
    expect(log).toMatchObject({ actorType: "apiKey", actorName: "API · Gestionale offerte" });

    expect((await api(key).post(`/api/v1/reservations/${r.id}/consume`, {})).status).toBe(409);
    // il feed movimenti filtrabile per offerta
    expect((await api(key).get("/api/v1/movements?externalRef=OFF-9")).body.data).toHaveLength(2);
  });
});

describe("Idempotenza e movimenti", () => {
  let key, product;
  beforeEach(async () => {
    const admin = await adminAgent();
    key = (await newKey(admin)).key;
    product = await Product.create({ code: "777-1", name: "Lamiera", quantity: 10, minQuantity: 2 });
  });

  test("stessa Idempotency-Key: un solo movimento, risposta ripetuta", async () => {
    const idem = "ddt-2026-000123";
    const body = { productId: String(product._id), type: "IN", quantity: 5, externalRef: "DDT-123" };
    const a = await api(key).post("/api/v1/movements", body, idem);
    const b = await api(key).post("/api/v1/movements", body, idem);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.headers["idempotent-replayed"]).toBe("true");
    expect(b.body.data.id).toBe(a.body.data.id);
    expect(await Movement.countDocuments()).toBe(1);
    expect((await Product.findById(product._id)).quantity).toBe(15);

    const c = await api(key).post("/api/v1/movements", { ...body, quantity: 6 }, idem);
    expect([c.status, c.body.error.code]).toEqual([422, "idempotency_key_reused"]);
    const d = await api(key).post("/api/v1/movements", body, null);
    expect(d.body.error.code).toBe("idempotency_key_required");
  });

  test("codice su più pedane → 409 ambiguo con i candidati; uscita oltre giacenza → 400", async () => {
    await Product.create({ code: "777-1", name: "Lamiera", quantity: 3, pallet: 9 });
    const amb = await api(key).post("/api/v1/movements", { code: "777-1", type: "OUT", quantity: 1 });
    expect(amb.status).toBe(409);
    expect(amb.body.error.details).toHaveLength(2);
    const over = await api(key).post("/api/v1/movements", { productId: String(product._id), type: "OUT", quantity: 50 });
    expect(over.status).toBe(400);
    const ok = await api(key).post("/api/v1/movements", { productId: String(product._id), type: "OUT", quantity: 9 });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ type: "OUT", quantity: 9, quantityBefore: 10, quantityAfter: 1, source: "api" });
  });

  test("validazione nel formato dell'API", async () => {
    const r = await api(key).post("/api/v1/movements", { productId: String(product._id), type: "BOH", quantity: -1 });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("validation_error");
    expect(r.body.error.details.map((d) => d.field)).toEqual(expect.arrayContaining(["type", "quantity"]));
  });
});

describe("Commesse", () => {
  test("articoli a magazzino e stato di produzione", async () => {
    const admin = await adminAgent();
    const { key } = await newKey(admin, ["production:read"]);
    const dep = await Department.create({ name: "Saldatura", isActive: true });
    await Product.create({ code: "2630-1", name: "Flangia", quantity: 2, commessa: "2630", posizione: 1 });
    await ProductionEntry.create({
      data: new Date(), department: dep._id, departmentName: "Saldatura", commessa: "2630", posizione: "1",
      cliente: "CLIENTE ALFA BV", quantita: 1, custodiaLabel: "T.F. PICCOLA", tempoStdMinuti: 60, tempoImpiegatoMinuti: 60,
      iniziataAt: new Date(),
    });
    const r = await api(key).get("/api/v1/commesse/2630");
    expect(r.status).toBe(200);
    expect(r.body.data.products).toHaveLength(1);
    expect(r.body.data.production[0]).toMatchObject({ posizione: "1", status: "in_lavorazione", reparto: "Saldatura" });
  });
});

describe("Webhook", () => {
  test("controllo URL: solo https pubblici", () => {
    expect(webhooks.urlProblem("http://example.com/h")).toMatch(/https/);
    expect(webhooks.urlProblem("https://localhost/h")).toMatch(/privati/);
    expect(webhooks.urlProblem("https://169.254.169.254/latest")).toMatch(/privati/);
    expect(webhooks.urlProblem("https://10.1.2.3/h")).toMatch(/privati/);
    expect(webhooks.urlProblem("https://[::1]/h")).toMatch(/privati/);
    expect(webhooks.urlProblem("https://user:pw@example.com/h")).toMatch(/credenziali/);
    expect(webhooks.urlProblem("https://example.com/hook")).toBeNull();
    expect(webhooks.isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(webhooks.isPrivateIp("8.8.8.8")).toBe(false);
  });

  test("segreto cifrato e firma verificabile", () => {
    const secret = webhooks.newSecret();
    expect(webhooks.decryptSecret(webhooks.encryptSecret(secret))).toBe(secret);
    const sig = webhooks.sign(secret, '{"a":1}', 1700000000);
    const v1 = crypto.createHmac("sha256", secret).update('1700000000.{"a":1}').digest("hex");
    expect(sig).toBe(`t=1700000000,v1=${v1}`);
  });

  test("un movimento via API arriva firmato al webhook registrato", async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE = "true";
    const received = [];
    const server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", () => { received.push({ headers: req.headers, raw }); res.end("ok"); });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      const admin = await adminAgent();
      const { key } = await newKey(admin);
      const wh = await admin.post("/api/integrations/webhooks").send({
        name: "Gestionale", url: `http://127.0.0.1:${server.address().port}/hook`, events: ["movement.created"],
      });
      expect(wh.status).toBe(201);
      const secret = wh.body.secret;
      expect(JSON.stringify((await admin.get("/api/integrations/webhooks")).body)).not.toContain(secret);

      const product = await Product.create({ code: "W-1", name: "X", quantity: 1 });
      await api(key).post("/api/v1/movements", { productId: String(product._id), type: "IN", quantity: 2 });

      for (let i = 0; i < 50 && !received.length; i++) await new Promise((r) => setTimeout(r, 100));
      expect(received).toHaveLength(1);
      const { headers, raw } = received[0];
      expect(headers["x-warehouse-event"]).toBe("movement.created");
      const [, t, v1] = headers["x-warehouse-signature"].match(/^t=(\d+),v1=([a-f0-9]{64})$/);
      expect(v1).toBe(crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex"));
      expect(JSON.parse(raw).data).toMatchObject({ code: "W-1", type: "IN", quantity: 2, quantityAfter: 3 });

      const test = await admin.post(`/api/integrations/webhooks/${wh.body.webhook.id}/test`);
      expect(test.body.result.ok).toBe(true);
    } finally {
      delete process.env.WEBHOOK_ALLOW_PRIVATE;
      await new Promise((r) => server.close(r));
    }
  });

  test("registrazione rifiutata per URL interni", async () => {
    const admin = await adminAgent();
    const r = await admin.post("/api/integrations/webhooks").send({ name: "X", url: "https://192.168.1.10/h", events: ["stock.low"] });
    expect(r.status).toBe(400);
  });
});

describe("Documentazione", () => {
  test("openapi.yaml servito senza chiave e allineato alle route", async () => {
    const r = await request(app).get("/api/v1/openapi.yaml");
    expect(r.status).toBe(200);
    const spec = require("js-yaml").load(r.text);
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths).sort()).toEqual([
      "/commesse/{commessa}", "/me", "/movements", "/products", "/products/{id}",
      "/reservations", "/reservations/{id}", "/reservations/{id}/consume", "/reservations/{id}/release", "/stock",
    ]);
    expect(spec.components.schemas.Scope.enum).toEqual(require("../models/ApiKey").SCOPES);
  });
});
