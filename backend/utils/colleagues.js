/**
 * utils/colleagues.js — quali colleghi può vedere un utente (applicato lato server).
 *
 * Admin e supervisori vedono tutti. Un operaio vede solo i colleghi della propria
 * squadra: chi ha almeno un reparto in comune E lo stesso turno (shift), più sé stesso.
 * Un operaio senza reparto o senza turno assegnato vede solo sé stesso.
 * Il super-admin è sempre escluso (non deve comparire a nessuno tranne sé stesso).
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
  const self = String(req.user._id);
  const depts = Array.isArray(req.user.visibleDepartments) ? req.user.visibleDepartments : (req.user.departments || []);
  const shift = req.user.shift;
  // Senza reparto o senza turno: nessun collega, solo sé stesso
  if (!depts.length || !shift) {
    req._colleagueIds = new Set([self]);
    return req._colleagueIds;
  }
  // Colleghi = stesso turno + almeno un reparto in comune (super-admin sempre escluso)
  const ids = await User.find({
    shift,
    departments: { $in: depts },
    isSuperAdmin: { $ne: true },
  }).distinct("_id");
  req._colleagueIds = new Set([...ids.map(String), self]);
  return req._colleagueIds;
}

/** Filtro Mongo per nascondere il super-admin a tutti tranne a sé stesso. */
function hideSuperAdmin(req) {
  return req.user?.isSuperAdmin ? {} : { isSuperAdmin: { $ne: true } };
}

/** _id (stringa) del super-admin da nascondere a chi guarda, oppure null (se guarda lui o non esiste). Cache per richiesta. */
async function hiddenSuperAdminId(req) {
  if (req.user?.isSuperAdmin) return null;
  if (req._hiddenSaId !== undefined) return req._hiddenSaId;
  const sa = await User.findOne({ isSuperAdmin: true }).select("_id").lean();
  req._hiddenSaId = sa ? String(sa._id) : null;
  return req._hiddenSaId;
}

/**
 * Contesto di visibilità delle PERSONE per una richiesta:
 * - ids: colleghi visibili (Set) o null (manager = tutti);
 * - hideId: id del super-admin da mascherare comunque (anche ai manager), o null.
 * Un utente va mascherato se non è tra gli ids (quando ids è impostato) OPPURE se è il super-admin nascosto.
 */
async function visibilityContext(req) {
  return { ids: await visibleColleagueIds(req), hideId: await hiddenSuperAdminId(req) };
}
const shouldHide = (id, ctx) => {
  if (!id) return !!ctx.ids;                       // autore assente: nascosto se c'è un filtro colleghi
  const s = String(id);
  return (ctx.ids && !ctx.ids.has(s)) || (ctx.hideId && s === ctx.hideId);
};

/** Un supervisore può gestire solo i propri operai (operatore con supervisor == lui). */
function supervisorCanManage(actor, target) {
  return actor.role === "supervisore"
    && target.role === "operatore"
    && String(target.supervisor || "") === String(actor._id);
}

/** Filtro Mongo sul campo che contiene l'utente (es. "operatore"): {} per admin/supervisori. */
async function colleagueFilter(req, field) {
  const ids = await visibleColleagueIds(req);
  return ids ? { [field]: { $in: [...ids].map((id) => new mongoose.Types.ObjectId(id)) } } : {};
}

const OTHER = Object.freeze({ name: "Altro operatore", username: null, role: null });

// I mascheratori accettano un contesto { ids, hideId } (visibilityContext). Per compatibilità
// accettano anche un semplice Set di colleghi (vecchia firma) = { ids:set, hideId:null }.
const toCtx = (x) => (x && x.ids !== undefined ? x : { ids: x || null, hideId: null });
const noMasking = (ctx) => !ctx.ids && !ctx.hideId;

/**
 * Nasconde un utente popolato ({ _id, name, ... }) se non è visibile (non collega, o super-admin):
 * resta l'informazione che qualcuno ha fatto l'operazione, non chi.
 */
function maskUser(user, ctxOrIds) {
  const ctx = toCtx(ctxOrIds);
  if (noMasking(ctx) || !user || typeof user !== "object" || !user._id) return user;
  return shouldHide(user._id, ctx) ? { ...OTHER } : user;
}

/** Maschera il campo `field` di ogni documento (oggetti semplici o documenti mongoose). */
function maskField(docs, field, ctxOrIds) {
  const ctx = toCtx(ctxOrIds);
  if (noMasking(ctx)) return docs;
  const one = (d) => {
    if (!d) return d;
    const plain = typeof d.toObject === "function" ? d.toObject() : d;
    return { ...plain, [field]: maskUser(plain[field], ctx) };
  };
  return Array.isArray(docs) ? docs.map(one) : one(docs);
}

/**
 * Movimenti: oltre all'utente popolato vanno nascoste anche le copie del nome salvate nel
 * movimento (performedByName, correctedByName), altrimenti il nome passerebbe comunque.
 * Un autore non più esistente (utente eliminato) conta come non visibile.
 */
function maskMovements(docs, ctxOrIds) {
  const ctx = toCtx(ctxOrIds);
  if (noMasking(ctx)) return docs;
  const idOf = (u) => (u && typeof u === "object" ? u._id : u);
  const one = (d) => {
    if (!d) return d;
    const m = typeof d.toObject === "function" ? d.toObject() : { ...d };
    if (shouldHide(idOf(m.performedBy), ctx)) {
      m.performedBy = { ...OTHER };
      if ("performedByName" in m) m.performedByName = OTHER.name;
    }
    const fixer = idOf(m.correctedBy);
    if (fixer && shouldHide(fixer, ctx)) {
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

module.exports = { visibleColleagueIds, colleagueFilter, maskUser, maskField, maskMovements, notificationScope, isManager, hideSuperAdmin, supervisorCanManage, visibilityContext, hiddenSuperAdminId };
