/**
 * smoke.js — checkup rapido senza DB: verifica che l'app si avvii e che le
 * route base rispondano in modo sensato senza una connessione MongoDB reale
 * (usato perché mongodb-memory-server non può scaricare il suo binario in
 * questo sandbox). Non sostituisce i test Jest con DB, solo un controllo
 * aggiuntivo di sanità prima della consegna.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "smoke_test_secret";
process.env.JWT_EXPIRES_IN = "1h";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.COOKIE_SECURE = "false";
process.env.ENABLE_EMAIL = "false";
process.env.ENABLE_CLOUDINARY = "false";
process.env.RATE_LIMIT_MAX = "100000";
process.env.RATE_LIMIT_LOGIN_MAX = "100000";
process.env.RATE_LIMIT_BADGE_MAX = "100000";
process.env.RATE_LIMIT_VISION_MAX = "100000";
process.env.RATE_LIMIT_FORGOT_MAX = "100000";

const request = require("supertest");
const app = require("../app");

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`OK   ${name}`);
  else { console.log(`FAIL ${name}`); failures++; }
}

(async () => {
  // Health check pubblico
  let res = await request(app).get("/api/health");
  check("GET /api/health -> 200", res.status === 200 && res.body.status === "ok");

  // 404 su rotta inesistente
  res = await request(app).get("/api/does-not-exist");
  check("GET /api/does-not-exist -> 404", res.status === 404);

  // Vision provider info (nessuna auth richiesta a livello middleware... verifichiamo)
  res = await request(app).get("/api/vision/provider");
  check("GET /api/vision/provider -> 401 (richiede auth)", res.status === 401);

  // Tutte le route protette devono rifiutare senza cookie, SENZA toccare il DB
  const protectedGets = [
    "/api/auth/me",
    "/api/products",
    "/api/movements",
    "/api/categories",
    "/api/notifications",
    "/api/dashboard/stats",
    "/api/checklist",
    "/api/users",
  ];
  for (const path of protectedGets) {
    res = await request(app).get(path);
    check(`GET ${path} senza cookie -> 401`, res.status === 401);
  }

  // Login con body vuoto -> 400 di validazione, non 500 (nessun accesso al DB)
  res = await request(app).post("/api/auth/login").send({});
  check("POST /api/auth/login body vuoto -> 400", res.status === 400);

  // Badge login con parametri palesemente invalidi -> redirect (mai JSON), nessun DB
  res = await request(app).get("/api/auth/badge/xxx/tooshort");
  check("GET /api/auth/badge/xxx/tooshort -> 302 redirect", res.status === 302 && /badge=error/.test(res.headers.location || ""));

  // Reset password con parametri invalidi -> 400 di validazione
  res = await request(app).post("/api/auth/reset-password").send({ userId: "bad", token: "x", newPassword: "123" });
  check("POST /api/auth/reset-password invalido -> 400", res.status === 400);

  console.log(failures === 0 ? "\nTutti i controlli OK." : `\n${failures} controllo/i falliti.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(err => {
  console.error("Errore smoke test:", err);
  process.exit(1);
});
