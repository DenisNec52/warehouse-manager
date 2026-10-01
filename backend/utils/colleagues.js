/**
 * utils/colleagues.js — quali colleghi può vedere un utente (applicato lato server).
 *
 * Admin e supervisori vedono tutti. Un operaio vede solo i colleghi della propria
 * "mansione", cioè chi ha almeno un reparto in comune con i reparti che l'operaio
 * vede (User.visibleDepartments se impostato, altrimenti i suoi gruppi), più sé stesso.
 * Un operaio senza reparto assegnato vede solo sé stesso.
 *
 * Nota: qui si filtrano le PERSONE. L'accesso ai reparti resta quello di
 * utils/departmentAccess.js (un operaio senza reparto può comunque lavorare).
 */
const mongoose = require("mongoose");
const User     = require("../models/User");

const isManager = (user) => user.role === "admin" || user.role === "supervisore";

/** Set di id (stringa) dei colleghi visibili, sé compreso; null = tutti. Calcolato una volta per richiesta. */
async function visibleColleagueIds(req) {
  if (isManager(req.user)) return null;
  if (req._colleagueIds) return req._colleagueIds;
  // Per i colleghi conta il reparto assegnato: null ("nessun gruppo") vuol dire nessun collega
  const depts = Array.isArray(req.user.visibleDepartments) ? req.user.visibleDepartments : (req.user.departments || []);
  const ids = depts.length ? await User.find({ departments: { $in: depts } }).distinct("_id") : [];
  req._colleagueIds = new Set([...ids.map(String), String(req.user._id)]);
  return req._colleagueIds;
}

/** Filtro Mongo sul campo che contiene l'utente (es. "operatore"): {} per admin/supervisori. */
async function colleagueFilter(req, field) {
  const ids = await visibleColleagueIds(req);
  return ids ? { [field]: { $in: [...ids].map((id) => new mongoose.Types.ObjectId(id)) } } : {};
}

const OTHER = Object.freeze({ name: "Altro operatore", username: null, role: null });

/**
 * Nasconde un utente popolato ({ _id, name, ... }) se non è un collega visibile:
 * resta l'informazione che qualcuno ha fatto l'operazione, non chi.
 */
function maskUser(user, ids) {
  if (!ids || !user || typeof user !== "object" || !user._id) return user;
  return ids.has(String(user._id)) ? user : { ...OTHER };
}

/** Maschera il campo `field` di ogni documento (oggetti semplici o documenti mongoose). */
function maskField(docs, field, ids) {
  if (!ids) return docs;
  const one = (d) => {
    if (!d) return d;
    const plain = typeof d.toObject === "function" ? d.toObject() : d;
    return { ...plain, [field]: maskUser(plain[field], ids) };
  };
  return Array.isArray(docs) ? docs.map(one) : one(docs);
}

/**
 * Movimenti: oltre all'utente popolato vanno nascoste anche le copie del nome salvate nel
 * movimento (performedByName, correctedByName), altrimenti il nome passerebbe comunque.
 * Un autore non più esistente (utente eliminato) conta come non visibile.
 */
function maskMovements(docs, ids) {
  if (!ids) return docs;
  const idOf = (u) => (u && typeof u === "object" ? u._id : u);
  const one = (d) => {
    if (!d) return d;
    const m = typeof d.toObject === "function" ? d.toObject() : { ...d };
    const author = idOf(m.performedBy);
    if (!author || !ids.has(String(author))) {
      m.performedBy = { ...OTHER };
      if ("performedByName" in m) m.performedByName = OTHER.name;
    }
    const fixer = idOf(m.correctedBy);
    if (fixer && !ids.has(String(fixer))) {
      m.correctedBy = null;
      m.correctedByName = OTHER.name;
    }
    return m;
  };
  return Array.isArray(docs) ? docs.map(one) : one(docs);
}

/**
 * Notifiche visibili: le proprie e quelle generali; le notifiche per i soli responsabili
 * (audience "managers", es. movimenti con il nome di chi li ha fatti) non arrivano agli operai.
 */
function notificationScope(user) {
  return isManager(user)
    ? { $or: [{ userId: user._id }, { userId: null }] }
    : { $or: [{ userId: user._id }, { userId: null, audience: { $ne: "managers" } }] };
}

module.exports = { visibleColleagueIds, colleagueFilter, maskUser, maskField, maskMovements, notificationScope, isManager };
