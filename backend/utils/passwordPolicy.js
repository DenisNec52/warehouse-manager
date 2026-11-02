/**
 * utils/passwordPolicy.js — regola unica per ogni password impostata nell'app
 * (registrazione utente, cambio, reset da link, reset da admin).
 *
 * - Minimo 8 caratteri: con il limite per-account sui login (rateLimiter) rende
 *   impraticabile il "password spraying" delle password corte più comuni.
 * - Massimo 128: bcrypt usa solo i primi 72 byte, e un body enorme farebbe solo
 *   perdere tempo al server.
 */
const { body } = require("express-validator");

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

const passwordRule = (field) => body(field)
  .isString().withMessage("Password non valida")
  .isLength({ min: PASSWORD_MIN, max: PASSWORD_MAX })
  .withMessage(`La password deve avere da ${PASSWORD_MIN} a ${PASSWORD_MAX} caratteri`);

module.exports = { PASSWORD_MIN, PASSWORD_MAX, passwordRule };
