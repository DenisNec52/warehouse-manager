/**
 * utils/departmentAccess.js — accesso ai reparti, applicato lato server.
 *
 * Admin e supervisori vedono tutti i reparti; un operatore solo i suoi
 * (User.visibleDepartments se impostato, altrimenti User.departments).
 */
const mongoose   = require("mongoose");
const Department = require("../models/Department");

/**
 * Reparto richiesto (id), verificato: esiste e l'utente può accedervi.
 * forWrite: per registrare dati nuovi il reparto deve essere attivo.
 * Restituisce { department } oppure { status, message }.
 */
async function checkDepartment(user, id, { forWrite = false } = {}) {
  if (!id) return { status: 400, message: "Seleziona il reparto." };
  if (!mongoose.isValidObjectId(id)) return { status: 400, message: "Reparto non valido." };
  const department = await Department.findById(id);
  if (!department || (forWrite && !department.isActive)) return { status: 400, message: "Reparto non trovato o non attivo." };
  const visible = user.visibleDepartmentIds();
  if (visible && !visible.includes(String(department._id))) return { status: 403, message: "Non hai accesso a questo reparto." };
  return { department };
}

/** Filtro Mongo sui reparti visibili all'utente, per le liste senza reparto indicato ({} = tutti). */
function visibleScope(user, field = "department") {
  const visible = user.visibleDepartmentIds();
  return visible ? { [field]: { $in: visible.map(id => new mongoose.Types.ObjectId(id)) } } : {};
}

module.exports = { checkDepartment, visibleScope };
