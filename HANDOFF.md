# HANDOFF — Utenti: super-admin invisibile, viste Elenco/Gerarchia, turni, permessi

Lavoro in 3 fasi con modelli diversi. Ogni fase aggiorna questo file.
Branch: `feat/utenti-gerarchia-turni` (da `main` @29aaa22).

## Decisioni confermate da Denis (2026-10-01)
- **Mansione = reparto** (campo `departments`). Nessun campo "mansione" separato.
- **Pagina Utenti** (Elenco + Gerarchia): solo admin e supervisori. Gli operai NON la aprono.
- La nuova regola di visibilità operai (**stesso turno E stesso reparto**) **sostituisce** quella
  attuale (solo reparto) ovunque compaiono i colleghi: Andon, statistiche, report, export, movimenti.

## Stato di partenza (prima di questo lavoro)
- `User`: `role` (admin|supervisore|operatore), `departments[]`, `visibleDepartments`, `isSuperAdmin`.
  NON esistono: `shift`, `supervisor`.
- `GET /api/users` (routes/users.js) monta `protect, requireSupervisor` → solo admin/supervisori.
  Ritorna TUTTI gli utenti, **super-admin incluso** (da nascondere — Obiettivo 1).
- `loadManageableTarget`: super-admin → 403 (va cambiato in 404 per non rivelarlo), admin protetto da non-admin.
- `utils/colleagues.js`: `visibleColleagueIds` = utenti con un reparto in comune (+ sé stessi).
  `maskMovements`/`maskField` mascherano `performedBy`/`createdBy` non visibili.
- Frontend `pages/UsersPage.jsx`: tabella + `UserModal`. Nessuna vista gerarchia.

## Piano

### Obiettivo 1 — Super-admin invisibile (BACKEND)
- Helper `hideSuperAdmin(req)` → `{}` se `req.user.isSuperAdmin`, altrimenti `{ isSuperAdmin: { $ne: true } }`.
- Applicare a: `GET /api/users` (elenco + ricerca), `GET /api/users/:id` (404 se target super-admin e non è lui),
  conteggi (`dashboard/stats` totalUsers), Andon `perOperatore`/righe/export, `recentMovements`,
  `products` populate createdBy/updatedBy, snapshot nomi (`operatoreNome`, `performedByName`).
- `loadManageableTarget`: super-admin non-self → **404** (non 403).
- Confermare che `isSuperAdmin` e il ruolo "super-admin" non siano assegnabili (già: whitelist + enum ruoli).

### Obiettivo 2 — Pagina Utenti con due viste (FRONTEND)
- Toggle "Elenco" / "Gerarchia".
- Elenco: tabella esistente + ricerca + filtri (ruolo, reparto, turno).
- Gerarchia: organigramma Admin → Supervisore → Operaio (caselle + linee, CSS/SVG, nessuna dipendenza nuova).
  Operai raggruppati per turno sotto ogni supervisore. Super-admin in cima solo se lo guarda lui stesso.
  Responsive: scroll orizzontale su mobile.

### Obiettivo 3 — Turni (MODELLO + MIGRAZIONE + UI)
- `User.shift`: enum `["turno1","turno2","centrale"]`, default `null` (= "non assegnato").
- Migrazione: gli utenti senza turno restano `null` (nessun backfill, nessun errore). Sezione dedicata in Gerarchia.
- Admin/super-admin assegnano/spostano turno e struttura via **selettori** (dropdown nel modal + nella gerarchia).

### Obiettivo 4 — Permessi e visibilità (BACKEND)
- `User.supervisor`: ObjectId ref User (solo per operatore), default `null`. Assegnabile da admin/super-admin.
- Modifica:
  - super-admin & admin: tutti (salvo restrizioni super-admin).
  - supervisore: SOLO i propri operai (`operatore` con `supervisor == req.user._id`). Può cambiare
    anagrafica, turno, reparto; NON il ruolo. Non tocca altri supervisori/admin/super-admin/operai altrui.
  - operatore: nessuno.
  - Fuori permesso → 403 (404 per super-admin).
- Visibilità operai: `visibleColleagueIds` per operatore = utenti con (reparto in comune) AND (stesso `shift`),
  + sé stessi. Senza reparto o senza turno → solo sé stesso. Sostituisce la regola per-reparto in tutta l'app.

### Vincoli
- Stack e stile invariati, nessuna dipendenza superflua. Validazione input backend. Niente dati sensibili in risposta.
- Fase 3: build + lint + test verdi. Test nuovi: super-admin invisibile, modifica supervisore (solo propri operai),
  visibilità operaio (turno+reparto), assegnazione turni.

---

## FASE 1 — Ollama (gemma4:26b): implementazione di base
(in corso)

**FATTO (base, backend):**
- `models/User.js`: aggiunti `shift` (enum turno1/turno2/centrale, default null) e `supervisor` (ref User, default null). `toPublic` espone shift e supervisor.
- `utils/colleagues.js`: `visibleColleagueIds` riscritta → operatore vede chi ha reparto in comune E stesso turno (+ sé); senza reparto o turno → solo sé; super-admin sempre escluso. Nuovi helper `hideSuperAdmin(req)` e `supervisorCanManage(actor, target)`.
**FATTO (base, frontend):**
- `components/users/UserHierarchy.jsx`: scheletro organigramma (super-admin in cima, Admin, Supervisori, operai per turno sotto ogni supervisore, sezione "senza supervisore"). Da rifinire: collegamento visivo gruppo→supervisore, linee.
**File toccati fase 1:** backend/models/User.js, backend/utils/colleagues.js, frontend/src/components/users/UserHierarchy.jsx.
**Modello usato:** Ollama gemma4:26b (output troncato due volte per limite token; logica corretta, completata a mano).

**RESTA (fase 2 Gemini + fase 3 Claude):**
- routes/users.js: `GET /` applica `hideSuperAdmin` + filtri (role, department, shift) e ricerca; aggiungere `GET /:id` con 404 se super-admin e non-self; `loadManageableTarget` super-admin → 404 (non 403); permesso supervisore (solo propri operai, mai il ruolo); whitelist create/update accetta shift+supervisor (validati).
- Nascondere super-admin ovunque: dashboard totalUsers, Andon perOperatore/export righe, movements performedBy, products createdBy/updatedBy, snapshot nomi (operatoreNome/performedByName).
- Migrazione: voce per shift (solo registrazione, nessun backfill).
- Frontend: UsersPage con toggle Elenco/Gerarchia + ricerca/filtri; UserModal con selettori turno e supervisore.
- Test (fase 3).

## FASE 2 — Gemini Pro: revisione e completamento
(in corso)

**FATTO:** Gemini **Pro non disponibile (quota 429)** → usato gemini-3-flash-preview. Ha prodotto: nuovo `loadManageableTarget` (super-admin→404, supervisore solo propri operai), lista con filtri (search anti-regex-injection, role, department, shift) + hideSuperAdmin, `GET /:id` con 404 per super-admin, validazione shift/supervisor, frammenti create/update.
**CORREZIONE necessaria (fase 3):** Gemini vietava ai supervisori di cambiare shift e departments dei propri operai → SBAGLIATO: la specifica dice che possono (solo NON il ruolo e NON riassegnare il supervisore). Forbidden per supervisore = solo ['role','supervisor'].
**RESTA (fase 3 Claude):** applicare e correggere le rotte; nascondere super-admin anche in dashboard/Andon/movements/products/snapshot; migrazione shift; frontend (toggle Elenco/Gerarchia, filtri, selettori turno+supervisore nel modal); sicurezza; build+lint+test; PR.

## FASE 3 — Claude: integrazione, sicurezza, test, PR
(in corso)

**FATTO (Claude):**
- routes/users.js: loadManageableTarget (super-admin→404, supervisore solo propri operai); lista con filtri (ricerca anti-regex-injection, ruolo, reparto, turno) + hideSuperAdmin; GET /:id (404 per super-admin ad altri); create/update accettano turno+supervisore con `staffFields` (turno a chi gestisce; supervisore solo admin, deve essere un supervisore esistente; supervisore NON cambia ruolo né riassegna).
- Super-admin invisibile anche ai manager: utils/colleagues.js `hiddenSuperAdminId` + `visibilityContext` {ids,hideId}; maschere aggiornate; applicato a movements, dashboard (recentMovements + totalUsers), products (createdBy/updatedBy), production (entries, /stats perOperatore, /report, /export via andonReport hideUserId).
- Migrazione `2026-10-02-user-shift` (solo conteggio, nessun backfill).
- Frontend: UsersPage con toggle Elenco/Gerarchia, ricerca + filtri (ruolo/reparto/turno), UserHierarchy integrata; UserModal con selettori Turno e Supervisore (supervisore assegnabile solo da admin).
- Test: +15 (tests/users-staff.test.js) su super-admin invisibile, permessi supervisore, visibilità operaio (turno+reparto), assegnazione turni. Aggiornati colleagues/departments test alla nuova regola. **Totale 122 backend, verdi. Lint OK. Build OK.**
- e2e Chrome: Utenti 9/9 (due viste, filtri, organigramma per turno, selettori, mobile), regressioni perf 21/21 e Andon 17/17.

**COSA DEVE FARE DENIS:**
- Migrazioni: automatiche all'avvio (nessuna azione). Gli utenti esistenti restano "non assegnato" (turno) e "senza supervisore".
- Assegnazioni manuali (pagina Utenti): assegnare a ogni operaio il **turno** e il **supervisore**. Finché un operaio non ha turno+reparto, vede solo sé stesso.
- Nessuna variabile d'ambiente nuova obbligatoria (facoltativo: RATE_LIMIT_EXPORT_MAX).
- Modelli: Fase 1 Ollama gemma4:26b; Fase 2 Gemini (Pro in quota 429 → flash); Fase 3 Claude.
