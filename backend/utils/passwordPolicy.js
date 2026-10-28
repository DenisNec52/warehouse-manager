/**
 * utils/passwordPolicy.js — regole uniche per le password.
 *
 * Minimo 10 caratteri: con dati aziendali reali (giacenze, commesse, clienti)
 * 6 caratteri sono troppo pochi anche con il limite ai tentativi di login.
 * Massimo 72 byte: bcrypt ignora tutto ciò che viene dopo, quindi una password
 * più lunga darebbe una falsa sensazione di sicurezza.
 * Le password già esistenti restano valide: la regola vale per quelle nuove.
 */
const { body } = require("express-validator");

const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_BYTES  = 72;

function passwordProblem(pw, { username } = {}) {
  if (typeof pw !== "string") return "Password obbligatoria.";
  if (pw.length < MIN_PASSWORD_LENGTH) return `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`;
  if (Buffer.byteLength(pw, "utf8") > MAX_PASSWORD_BYTES) return "Password troppo lunga (massimo 72 caratteri).";
  if (username && pw.toLowerCase().includes(String(username).toLowerCase()))
    return "La password non può contenere lo username.";
  return null;
}

/** Validatore express-validator per il campo `field` (username preso da body.username o dall'utente target). */
function passwordRule(field = "password") {
  return body(field).custom((value, { req }) => {
    const username = req.body?.username || req.target?.username || req.user?.username;
    const problem = passwordProblem(value, { username });
    if (problem) throw new Error(problem);
    return true;
  });
}

module.exports = { MIN_PASSWORD_LENGTH, passwordProblem, passwordRule };
