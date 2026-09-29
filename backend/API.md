# API — Warehouse Pro

Riferimento rapido di tutti gli endpoint REST esposti dal backend. Base URL: `{PUBLIC_API_URL}/api` (in locale `http://localhost:5000/api`).

Convenzioni generali:

- Autenticazione tramite cookie httpOnly `wh_token` (JWT), impostato dal server al login. Le route protette rispondono `401` se il cookie manca, è scaduto o non valido.
- I ruoli utente sono `admin`, `supervisore`, `operatore`. `admin` non è mai assegnabile via API (solo tramite `npm run seed`).
- Le risposte di errore hanno sempre la forma `{ "message": "..." }`; gli errori di validazione (`express-validator`) rispondono `400` con `{ "message": "...", "errors": [...] }`.
- Le liste paginate rispondono con `{ items..., pagination: { page, limit, total, pages } }`.
- Tutte le date sono ISO 8601.

## Autenticazione — `/api/auth`

| Metodo | Path | Auth | Descrizione |
|---|---|---|---|
| POST | `/login` | pubblica (rate limit) | Login con `username`+`password`. Imposta il cookie di sessione. |
| GET | `/badge/:userId/:secret` | pubblica (rate limit) | Login automatico da QR o tag NFC. Non risponde mai JSON: reindirizza sempre al frontend (`/?badge=ok` o `/login?badge=error`). Query `?src=nfc` per distinguere la fonte nei log. |
| POST | `/badge/regenerate` | protetta | Genera/rigenera il proprio badge. Il segreto in chiaro è restituito **una sola volta** in `url`/`nfcUrl`/`qrImage` (data URL PNG); rigenerare invalida il badge precedente. |
| PUT | `/badge/status` | protetta | Body `{ enabled: boolean }`: abilita/disabilita il proprio badge senza revocarlo. |
| DELETE | `/badge` | protetta | Revoca il proprio badge (nessun QR/NFC esistente funzionerà più). |
| POST | `/logout` | protetta | Cancella il cookie di sessione. |
| GET | `/me` | protetta | Utente corrente + conteggio notifiche non lette. |
| PUT | `/email` | protetta | Body `{ email }`: imposta/aggiorna la propria email (necessaria per il recupero password). `409` se già in uso. |
| POST | `/forgot-password` | pubblica (rate limit) | Body `{ username }`. Risposta **sempre identica** (anti-enumeration) indipendentemente dall'esistenza dell'account o dalla presenza di un'email. Se possibile, invia un'email col link di reset (valido 1 ora). |
| POST | `/reset-password` | pubblica | Body `{ userId, token, newPassword }`. Se il token è valido imposta la nuova password ed esegue login automatico (stesso comportamento del login da badge). |
| PUT | `/theme` | protetta | Body `{ mode, accentColor, radius }`: salva il tema personale sul profilo. |
| PUT | `/password` | protetta | Body `{ currentPassword, newPassword }`: cambio password self-service. |

## Utenti — `/api/users` (richiede ruolo supervisore o admin)

| Metodo | Path | Auth extra | Descrizione |
|---|---|---|---|
| GET | `/` | — | Lista utenti (password e hash badge sempre esclusi). |
| POST | `/` | — | Crea utente (`supervisore`/`operatore`), email opzionale. |
| PUT | `/:id` | blocco su target admin | Aggiorna utente. `email: ""` rimuove l'email esistente. |
| DELETE | `/:id` | solo admin + blocco su target admin | Elimina definitivamente (non è soft delete). Non è possibile eliminare se stessi. |
| PUT | `/:id/status` | blocco su target admin | Body `{ isActive }`: attiva/disattiva (reversibile). Non è possibile disattivare se stessi. |
| PUT | `/:id/password` | blocco su target admin | Reset password di un altro utente. |
| POST | `/:id/badge/regenerate` | blocco su target admin | Come `/api/auth/badge/regenerate` ma per un altro utente (es. operatore senza badge, o badge fisico perso/rubato). |
| PUT | `/:id/badge/status` | blocco su target admin | Abilita/disabilita il badge di un altro utente. |
| DELETE | `/:id/badge` | blocco su target admin | Revoca il badge di un altro utente. |

"Blocco su target admin": un supervisore non può in alcun modo scrivere su un account `admin` (403); un admin può sempre.

## Prodotti — `/api/products` (richiede autenticazione)

| Metodo | Path | Auth extra | Descrizione |
|---|---|---|---|
| GET | `/` | — | Lista con query `search`, `category`, `lowStock=true`, `page`, `limit`, `sort`. `search` nel formato `commessa-posizione` (es. `1684-2`) fa match esatto, altrimenti full-text. |
| GET | `/low-stock` | — | Fino a 50 prodotti con quantità ≤ soglia minima, ordinati per quantità crescente. |
| GET | `/:id` | — | Dettaglio prodotto. `404` se non esiste o è stato eliminato (soft delete). |
| POST | `/` | — | Crea prodotto. Duplicato (`409`) solo se stesso codice sulla stessa pedana/categoria. Genera notifica `low_stock` (+ email) se già sotto soglia alla creazione. |
| PUT | `/:id` | — | Aggiorna prodotto. Traccia una nuova voce in `placementHistory` se cambiano piano/pedana/data arrivo. Genera notifica `low_stock` (+ email) solo alla transizione sopra→sotto soglia. |
| POST | `/:id/cover` | — | `multipart/form-data`, campo file `image`. Carica/sostituisce la foto copertina su Cloudinary (rimuove la precedente). `503` se Cloudinary non è configurato (`ENABLE_CLOUDINARY=false`). |
| DELETE | `/:id/cover` | — | Rimuove la copertina (e il file su Cloudinary). |
| DELETE | `/:id` | solo admin | Soft delete (`isActive: false`). |
| POST | `/import-legacy` | solo admin | Importa `utils/warehouse_inventory.json` (idempotente). Body opzionale `{ reset: true }` per un reimport pulito. |

## Movimenti — `/api/movements` (richiede autenticazione)

| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/` | Lista con query `type` (`IN`/`OUT`), `productId`, `userId`, `from`, `to`, `page`, `limit`. |
| GET | `/product/:productId` | Ultimi 100 movimenti di un prodotto. |
| GET | `/:id` | Dettaglio movimento. |
| POST | `/` | Registra entrata/uscita. Body `{ productId, type: "IN"|"OUT", quantity, reason?, note?, reference? }`. Transazione MongoDB atomica (richiede replica set): per `OUT` rifiuta (`400`) se le scorte sono insufficienti, senza toccare la quantità. Genera notifica `low_stock` (+ email) alla transizione sopra→sotto soglia e una notifica `movement` per ogni operazione. |

## Categorie — `/api/categories` (richiede autenticazione)

| Metodo | Path | Auth extra | Descrizione |
|---|---|---|---|
| GET | `/` | — | Lista categorie attive. |
| POST | `/` | solo admin | Crea categoria (`name`, `color`, `icon`). `409` se duplicata. |
| PUT | `/:id` | solo admin | Aggiorna categoria. |
| DELETE | `/:id` | solo admin | Soft delete. |

## Notifiche — `/api/notifications` (richiede autenticazione)

Le notifiche sono personali (`userId`) o globali (`userId: null`).

| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/` | Lista paginata (`page`, `limit`) + conteggio non lette nella pagina corrente. |
| PATCH | `/:id/read` | Segna come letta. |
| PATCH | `/read-all` | Segna tutte come lette. |
| DELETE | `/:id` | Elimina una notifica. |

Le notifiche scadono automaticamente dopo 90 giorni (indice TTL su `createdAt`).

## Dashboard — `/api/dashboard` (richiede autenticazione)

| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/stats` | KPI: prodotti totali, sotto soglia, movimenti odierni, utenti attivi, valore totale magazzino, notifiche non lette, ultimi 5 movimenti, 5 prodotti più critici. |
| GET | `/charts` | Query `days` (default 30). Movimenti giornalieri IN/OUT, distribuzione per categoria, top 10 prodotti più movimentati. |

## Checklist 5S — `/api/checklist` (richiede autenticazione)

| Metodo | Path | Auth extra | Descrizione |
|---|---|---|---|
| GET | `/` | — | Checklist attiva (la crea con i valori di default al primo utilizzo). |
| PUT | `/` | solo admin | Aggiorna la checklist attiva. |
| GET | `/my-today` | — | Le proprie compilazioni di oggi. |
| GET | `/submissions/today` | supervisore | Tutte le compilazioni di oggi. |
| GET | `/submissions` | supervisore | Storico con filtri `date`, `shift`, `userId`, `month` (`YYYY-MM`), paginato. |
| GET | `/monthly-report` | supervisore | Query `month` (`YYYY-MM`, obbligatoria). Report per utente/giorno: punteggi medi, tasso di completamento, distribuzione tipologie pulizia, andamento giornaliero. |
| POST | `/submit` | — | Compila la checklist per il turno odierno. `409` se già compilata per quel turno/oggi. |

## Vision IA — `/api/vision` (richiede autenticazione, rate limit dedicato)

| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/scan` | Body `{ image: "<base64 o data URL>", mediaType? }`. Estrae codice/quantità/categoria da etichette, bolle DDT o foto tramite il provider IA configurato (`AI_VISION_PROVIDER`: `huggingface` / `gemini` / `ollama` / `mock`). `422` se il modello non restituisce JSON valido (risposta grezza inclusa in `raw`). |
| GET | `/provider` | Info sul provider attivo e se è configurato correttamente (nessuna chiave esposta). |

## Health check

`GET /api/health` (pubblica) — `{ status: "ok", db: "connected"|"disconnected", ts, env }`. Utile per i probe di uptime su Render/Railway.

## Rate limiting

| Limiter | Route | Default |
|---|---|---|
| `loginLimiter` | `POST /api/auth/login` | 10 tentativi / 15 min |
| `badgeLoginLimiter` | `GET /api/auth/badge/:userId/:secret` | 30 tentativi / 15 min (non conta i successi) |
| `forgotPasswordLimiter` | `POST /api/auth/forgot-password` | 5 richieste / 15 min |
| `visionLimiter` | `POST /api/vision/scan` | 20 richieste / 15 min, per utente autenticato (non per IP) |

Valori configurabili via `.env` (`RATE_LIMIT_*`, vedi `.env.example`).

## Autenticazione via QR/NFC — dettagli tecnici

Ogni utente ha un "badge" opzionale: un segreto casuale di 32 byte, di cui il server conserva solo l'hash HMAC-SHA256 (chiave: `JWT_SECRET`), mai il valore in chiaro. L'URL del badge (`GET /api/auth/badge/:userId/:secret`) è pensato per essere aperto direttamente dal browser dopo una scansione QR o un tap NFC: se il segreto è valido, corrisponde a un utente attivo con badge abilitato, il server crea la sessione (stesso `startSession` del login classico, incluso il tracciamento IP/geolocalizzazione e la notifica di accesso) e reindirizza al frontend — non restituisce mai una risposta JSON, per evitare che chi scansiona il codice veda una pagina "rotta" in caso di errore.

Per la programmazione fisica dei tag NFC: è sufficiente scrivere l'URL restituito in `nfcUrl` come singolo record NDEF di tipo URI, con una qualsiasi app per smartphone che supporti la scrittura NFC (es. "NFC Tools"); non serve hardware o software specifico oltre a un telefono con NFC e un tag NFC riscrivibile (NTAG213/215/216 sono più che sufficienti per un URL di questa lunghezza).
