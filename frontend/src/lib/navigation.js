/**
 * lib/navigation.js — unica fonte della navigazione.
 *
 * Sei sezioni; ognuna raggruppa una o più schede (le pagine di prima, con gli stessi URL,
 * così link nelle notifiche e segnalibri restano validi). Le `key` delle schede sono le
 * stesse chiavi di moduleVisibility accettate dal backend (routes/settings.js → NAV_KEYS).
 * Nascondere qui è solo interfaccia: i permessi veri li controlla il server.
 */
import {
  Home, ClipboardCheck, Package, Timer, Users, Settings,
} from "lucide-react";

const MANAGERS = ["admin", "supervisore"];

export const SECTIONS = [
  { id: "home", label: "Home", icon: Home,
    tabs: [{ to: "/", label: "Home", exact: true }] },
  { id: "checklist", label: "Pulizia 5S", icon: ClipboardCheck,
    tabs: [
      { key: "checklist",       to: "/checklist",       label: "Compila" },
      { key: "admin-checklist", to: "/admin/checklist", label: "Gestione", roles: MANAGERS },
    ] },
  { id: "warehouse", label: "Magazzino", icon: Package,
    tabs: [
      { key: "products",  to: "/products",  label: "Articoli" },
      { key: "movements", to: "/movements", label: "Movimenti" },
    ] },
  { id: "production", label: "Produzione", icon: Timer,
    tabs: [
      { key: "production",     to: "/production",                label: "Andon Board", exact: true },
      { key: "standard-times", to: "/production/standard-times", label: "Tempi standard" },
    ] },
  { id: "people", label: "Persone", icon: Users,
    tabs: [{ key: "users", to: "/users", label: "Utenti", roles: MANAGERS }] },
  { id: "settings", label: "Impostazioni", icon: Settings,
    tabs: [
      { key: "settings",    to: "/settings",          label: "Profilo" },
      { key: "departments", to: "/admin/departments", label: "Reparti",      roles: ["admin"] },
      { key: "categories",  to: "/categories",        label: "Categorie",    roles: ["admin"] },
      {                     to: "/superadmin",        label: "App e moduli", superAdmin: true },
    ] },
];

/** La scheda è visibile a questo utente? (ruolo, super-admin, visibilità decisa dal super-admin) */
export function canSeeTab(tab, user, settings) {
  if (!user) return false;
  if (tab.superAdmin) return Boolean(user.isSuperAdmin);
  if (tab.roles && !tab.roles.includes(user.role)) return false;
  if (!tab.key || user.isSuperAdmin) return true;
  const allowed = settings?.moduleVisibility?.[tab.key];
  return !Array.isArray(allowed) || allowed.includes(user.role);
}

/** Sezioni con almeno una scheda visibile, ciascuna con le sole schede visibili. */
export function visibleSections(user, settings) {
  return SECTIONS
    .map((s) => ({ ...s, tabs: s.tabs.filter((t) => canSeeTab(t, user, settings)) }))
    .filter((s) => s.tabs.length > 0);
}

/** La scheda corrisponde al percorso? /products/123 appartiene ad "Articoli". */
export function tabMatches(tab, pathname) {
  if (tab.exact) return pathname === tab.to;
  return pathname === tab.to || pathname.startsWith(tab.to + "/");
}

export function sectionOf(sections, pathname) {
  return sections.find((s) => s.tabs.some((t) => tabMatches(t, pathname)));
}
