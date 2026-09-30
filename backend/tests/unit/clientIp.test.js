const express = require("express");
const request = require("supertest");
const { clientIp } = require("../../utils/clientIp");

describe("utils/clientIp", () => {
  const req = (xff, ip = "10.0.0.1") => ({ headers: xff === undefined ? {} : { "x-forwarded-for": xff }, ip });

  test("senza X-Forwarded-For usa req.ip", () => {
    expect(clientIp(req(undefined))).toBe("10.0.0.1");
  });
  test("con un solo valore usa quello", () => {
    expect(clientIp(req("203.0.113.7"))).toBe("203.0.113.7");
  });
  test("dietro Vercel + Render usa il primo valore (il client), non il server Vercel", () => {
    expect(clientIp(req("203.0.113.7, 76.76.21.9, 10.1.2.3"))).toBe("203.0.113.7");
  });
  test("ignora spazi e header vuoto", () => {
    expect(clientIp(req("  203.0.113.7 ,76.76.21.9"))).toBe("203.0.113.7");
    expect(clientIp(req(""))).toBe("10.0.0.1");
  });
});

describe("loginLimiter: chiave per username", () => {
  // App minima con il limiter reale e un login che fallisce sempre (401),
  // limite abbassato a 3 solo per questo test
  function buildApp() {
    let loginLimiter;
    jest.isolateModules(() => {
      process.env.RATE_LIMIT_LOGIN_MAX = "3";
      ({ loginLimiter } = require("../../middleware/rateLimiter"));
      process.env.RATE_LIMIT_LOGIN_MAX = "100000";
    });
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.post("/login", loginLimiter, (req, res) => res.status(401).json({ message: "Credenziali non valide" }));
    return app;
  }
  const VERCEL = "76.76.21.9"; // stesso IP per tutti, come dietro la rewrite

  test("i tentativi sbagliati di un utente non bloccano un collega con lo stesso IP", async () => {
    const app = buildApp();
    for (let i = 0; i < 3; i++) {
      await request(app).post("/login").set("X-Forwarded-For", VERCEL).send({ username: "mario", password: "x" }).expect(401);
    }
    await request(app).post("/login").set("X-Forwarded-For", VERCEL).send({ username: "mario", password: "x" }).expect(429);
    await request(app).post("/login").set("X-Forwarded-For", VERCEL).send({ username: "luigi", password: "x" }).expect(401);
  });

  test("cambiare IP (anche falsificando l'header) non aggira il limite sullo stesso account", async () => {
    const app = buildApp();
    for (let i = 0; i < 3; i++) {
      await request(app).post("/login").set("X-Forwarded-For", `198.51.100.${i}`).send({ username: "Mario ", password: "x" }).expect(401);
    }
    await request(app).post("/login").set("X-Forwarded-For", "198.51.100.99").send({ username: "mario", password: "x" }).expect(429);
  });
});
