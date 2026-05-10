/**
 * middleware/validate.js
 *
 * Wrapper per express-validator.
 * Da usare dopo i check() nelle route.
 */
const { validationResult } = require("express-validator");

module.exports = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Dati non validi",
      errors:  errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};
