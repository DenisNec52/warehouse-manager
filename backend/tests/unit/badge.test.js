process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_non_usare_in_produzione";
process.env.PORT = process.env.PORT || "5000";
delete process.env.PUBLIC_API_URL;

const badge = require("../../utils/badge");

describe("utils/badge", () => {
  test("generateSecret produce stringhe uniche e sufficientemente lunghe", () => {
    const a = badge.generateSecret();
    const b = badge.generateSecret();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(40); // 32 byte in base64url ≈ 43 caratteri
  });

  test("verifySecret accetta il segreto corretto", () => {
    const secret = badge.generateSecret();
    const hash   = badge.hashSecret(secret);
    expect(badge.verifySecret(secret, hash)).toBe(true);
  });

  test("verifySecret rifiuta un segreto sbagliato", () => {
    const hash = badge.hashSecret(badge.generateSecret());
    expect(badge.verifySecret("segreto-sbagliato", hash)).toBe(false);
  });

  test("verifySecret rifiuta un hash manomesso", () => {
    const secret = badge.generateSecret();
    const hash   = badge.hashSecret(secret);
    const tampered = hash.slice(0, -2) + (hash.slice(-2) === "00" ? "11" : "00");
    expect(badge.verifySecret(secret, tampered)).toBe(false);
  });

  test("verifySecret non lancia mai eccezioni su input malformati", () => {
    expect(badge.verifySecret(null, null)).toBe(false);
    expect(badge.verifySecret("x", "non-hex-valido")).toBe(false);
    expect(badge.verifySecret("", "")).toBe(false);
  });

  test("hashSecret dipende da JWT_SECRET (cambiare la chiave invalida i badge esistenti)", () => {
    const secret = badge.generateSecret();
    const hashWithKey1 = badge.hashSecret(secret);
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "una_chiave_diversa";
    const hashWithKey2 = badge.hashSecret(secret);
    process.env.JWT_SECRET = original;
    expect(hashWithKey1).not.toEqual(hashWithKey2);
  });

  test("badgeUrl costruisce l'URL con il segreto e la sorgente (qr/nfc)", () => {
    const url = badge.badgeUrl("507f1f77bcf86cd799439011", "abc123", "nfc");
    expect(url).toBe("http://localhost:5000/api/auth/badge/507f1f77bcf86cd799439011/abc123?src=nfc");
  });

  test("qrImageDataUrl genera un data URL PNG valido", async () => {
    const dataUrl = await badge.qrImageDataUrl("http://localhost:5000/api/auth/badge/x/y");
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
