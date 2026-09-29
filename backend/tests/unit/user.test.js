process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_non_usare_in_produzione";

const User = require("../../models/User");

// Regressione: un indice sparse su "email" esclude solo i documenti dove il
// campo è ASSENTE, non quelli con valore null. Con un default a null (o un
// $set esplicito a null), il secondo utente senza email fallirebbe con un
// errore di chiave duplicata sull'indice unique. Questi test verificano che
// "" e "non fornita" restino entrambe assenti (undefined), mai null.
describe("models/User — campo email opzionale (indice sparse)", () => {
  function build(overrides = {}) {
    return new User({
      username: "utente1",
      password: "Password123!",
      name: "Utente Uno",
      role: "operatore",
      ...overrides,
    });
  }

  test("email non fornita resta assente dal documento (non null)", () => {
    const u = build();
    expect(u.email).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(u.toObject(), "email")).toBe(false);
    expect(u.validateSync()).toBeUndefined();
  });

  test("email vuota (\"\") viene trattata come assente, non come stringa vuota", () => {
    const u = build({ email: "" });
    expect(u.email).toBeUndefined();
    expect(u.validateSync()).toBeUndefined();
  });

  test("un'email valida viene normalizzata e passa la validazione", () => {
    const u = build({ email: "Mario@Example.IT" });
    expect(u.email).toBe("mario@example.it");
    expect(u.validateSync()).toBeUndefined();
  });

  test("un'email non valida viene rifiutata dalla validazione", () => {
    const u = build({ email: "non-un-email" });
    const err = u.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.email).toBeDefined();
  });
});
