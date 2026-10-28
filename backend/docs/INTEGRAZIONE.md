# Integrazione con sistemi esterni — API v1

Questa API serve a collegare Warehouse Pro al gestionale delle offerte (o a un ERP,
a un foglio di BI...) **senza** dare a quei sistemi un utente dell'app.
Contratto macchina: [`openapi.yaml`](./openapi.yaml), servito anche su
`GET /api/v1/openapi.yaml` (importabile in Postman, Insomnia, Swagger UI).

## 1. Attivazione

1. Un **admin** apre *Integrazioni* nell'app e crea una chiave API:
   - un nome che dica chi la usa (es. "Gestionale offerte");
   - solo i permessi necessari (vedi tabella);
   - se possibile una **scadenza** e l'**IP del server** del gestionale.
2. La chiave (`whk_...`) compare **una sola volta**: va salvata nella configurazione
   segreta del gestionale (variabile d'ambiente, vault), mai nel codice o in un repo.
3. Il gestionale chiama **direttamente il backend** (`https://<backend>.onrender.com/api/v1`),
   non il dominio Vercel: l'allowlist IP si basa sull'IP che si collega al proxy di Render.

| Permesso | Cosa consente |
|---|---|
| `products:read` | anagrafica, giacenze per pedana, disponibilità per codice |
| `movements:read` | feed dei movimenti |
| `movements:write` | registrare entrate/uscite (es. DDT di carico) |
| `reservations:read` | leggere le prenotazioni |
| `reservations:write` | prenotare, rilasciare, consumare |
| `production:read` | stato delle commesse in produzione |

Le operazioni fatte con la chiave risultano nell'app come **"API · <nome chiave>"**
(movimenti, notifiche, registro modifiche). Se l'admin che ha creato la chiave viene
disattivato o non è più admin, la chiave smette di funzionare.

## 2. Regole comuni

- Autenticazione: `Authorization: Bearer whk_...` (oppure `X-API-Key: whk_...`).
- Errori: sempre `{"error": {"code": "...", "message": "...", "details": ...}}`.
  Il `code` è stabile e va usato nella logica; il `message` è per le persone.
- **Ogni POST richiede `Idempotency-Key`**: un valore unico per operazione (UUID).
  Se la rete cade e il gestionale ripete la richiesta con la stessa chiave, riceve
  la stessa risposta (header `Idempotent-Replayed: true`) e niente viene fatto due volte.
  Stessa chiave con body diverso → `422 idempotency_key_reused`. Validità: 48 ore.
- Limite: 1200 richieste ogni 15 minuti per chiave (`RATE_LIMIT_API_KEY_MAX`), poi `429`.
- Versione nell'URL: modifiche incompatibili andranno in `/api/v2`; la v1 resta.

| Codice | Status | Significato |
|---|---|---|
| `unauthorized` | 401 | chiave mancante o errata |
| `key_revoked` | 401 | chiave revocata o scaduta |
| `key_owner_inactive` | 401 | l'admin proprietario non è più attivo |
| `insufficient_scope` | 403 | manca un permesso alla chiave |
| `ip_not_allowed` | 403 | IP non nell'allowlist della chiave |
| `validation_error` | 400 | body/parametri non validi (`details` per campo) |
| `not_found` | 404 | risorsa inesistente |
| `insufficient_stock` | 409 | disponibilità insufficiente (`details` per riga) |
| `ambiguous_code` | 409 | codice su più pedane: indicare `productId` |
| `invalid_state` | 409 | prenotazione non più attiva |
| `idempotency_in_progress` | 409 | stessa richiesta ancora in corso: riprovare |
| `rate_limited` | 429 | troppe richieste |

## 3. Flusso offerta → commessa

```
Offerta in bozza     GET  /stock?codes=A,B           → è evadibile?
Offerta inviata      POST /reservations              → impegna il materiale (tutto o niente)
Offerta accettata    POST /reservations/{id}/consume → uscite FIFO per pedana, legate all'offerta
Offerta persa        POST /reservations/{id}/release → il materiale torna disponibile
```

- **Disponibile = fisico − prenotato**, per codice, sommando tutte le pedane.
- Una prenotazione **non** sposta la merce: riduce solo il disponibile visto dall'API.
- Senza `expiresAt` una prenotazione scade dopo 90 giorni (massimo consentito):
  da scaduta non impegna più nulla e non si può consumare.
- Due prenotazioni contemporanee sullo stesso codice non possono superare il disponibile.
- Un'uscita fatta a mano dalla UI può far scendere il fisico sotto il prenotato:
  `/stock` lo segnala con `overcommitted: true`.

Esempio (Node 18+):

```js
const BASE = process.env.WAREHOUSE_API_URL;      // https://<backend>.onrender.com/api/v1
const KEY  = process.env.WAREHOUSE_API_KEY;      // whk_...
const call = async (method, path, body, idemKey) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(idemKey && { "Idempotency-Key": idemKey }),
    },
    body: body && JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error.message), { code: json.error.code, details: json.error.details });
  return json.data;
};

// Prenotazione legata all'offerta: la Idempotency-Key deriva dall'offerta stessa,
// così un retry non crea mai una seconda prenotazione.
const r = await call("POST", "/reservations", {
  externalRef: "OFF-2026-0012",
  items: [{ code: "1534-1", quantity: 40 }, { code: "1684-2", quantity: 4 }],
}, "reserve-OFF-2026-0012-v1");

// Offerta accettata
await call("POST", `/reservations/${r.id}/consume`, null, `consume-${r.id}`);
```

## 4. Sincronizzazione

Le liste (`/products`, `/movements`, `/reservations`) sono ordinate per `updatedAt`
e paginate con un cursore opaco:

```
GET /products?updatedSince=2026-10-28T00:00:00Z&includeInactive=true&limit=200
→ { data: [...], nextCursor: "...", hasMore: true }
GET /products?cursor=<nextCursor>&limit=200
```

Il gestionale salva l'ultimo `nextCursor` e riparte da lì alla sincronizzazione successiva.
`includeInactive=true` serve a ricevere anche gli articoli eliminati (`active: false`).
La giacenza di un prodotto è sempre quella attuale: se un admin corregge o annulla un
movimento, l'`updatedAt` del prodotto cambia e il prodotto torna nel feed.

## 5. Webhook (notifiche push)

Un admin registra in *Integrazioni* un URL **https** pubblico e sceglie gli eventi:

| Evento | Quando |
|---|---|
| `movement.created` | qualsiasi entrata/uscita (UI, rettifica, API) |
| `stock.low` | un'uscita porta un prodotto sotto la scorta minima |
| `product.created` / `product.updated` | anagrafica creata/modificata/eliminata |
| `reservation.created` / `.released` / `.consumed` | ciclo di vita delle prenotazioni |

Ogni invio è una `POST` JSON `{ id, type, occurredAt, data }` con gli header
`X-Warehouse-Event`, `X-Warehouse-Delivery` (uguale nei tentativi ripetuti: usalo per
scartare i duplicati) e `X-Warehouse-Signature: t=<unix>,v1=<hmac>`.
Il segreto di firma (`whsec_...`) compare **una sola volta** alla creazione.

Verifica della firma (obbligatoria lato ricevente):

```js
const crypto = require("crypto");
function verify(rawBody, header, secret, toleranceSec = 300) {
  const m = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(header || "");
  if (!m) return false;
  const [, t, v1] = m;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;   // anti-replay
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
// Con Express: app.post("/hook", express.raw({ type: "application/json" }), (req, res) => { ... verify(req.body.toString(), ...) })
```

Consegna: 3 tentativi (subito, +5 s, +30 s), timeout 5 s; si considera riuscita con
una risposta 2xx. Dopo 20 fallimenti consecutivi il webhook viene disattivato (si
riattiva dalla UI). È una consegna *best effort*: in caso di riavvio del server un
evento può andare perso, quindi i webhook servono a reagire subito e i feed del punto 4
a riconciliare.

Gli URL verso indirizzi interni/privati (localhost, 10.x, 192.168.x, 169.254.x...)
sono rifiutati, anche se il DNS cambia dopo la registrazione.

## 6. Configurazione del backend

| Variabile | Default | Note |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | derivata da `JWT_SECRET` | cifra i segreti dei webhook. Impostala (64 caratteri casuali) **prima** di creare webhook: se cambia, i webhook esistenti vanno ricreati |
| `RATE_LIMIT_API_KEY_MAX` | 1200 | richieste per chiave ogni `RATE_LIMIT_WINDOW_MS` |
| `AUDIT_RETENTION_DAYS` | — (per sempre) | se impostata, le voci del registro modifiche più vecchie vengono eliminate |
| `WEBHOOK_ALLOW_PRIVATE` | `false` | solo sviluppo/test: consente URL http e indirizzi locali. Ignorata in produzione |

## 7. Buone pratiche

- Una chiave per sistema, con i soli permessi necessari; ruotala (creane una nuova,
  aggiorna il gestionale, revoca la vecchia) almeno una volta l'anno o se trapela.
- Usa la scadenza e l'allowlist IP quando il gestionale ha un IP fisso.
- Ogni operazione dell'integrazione è nel **registro modifiche** (filtrabile per azione
  `reservation`, `movement`, `apiKey`...).
