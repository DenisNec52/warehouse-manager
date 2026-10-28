# 🏭 Warehouse Pro — Full-Stack

Sistema di gestione magazzino con React + Node.js + MongoDB.

## 📁 Struttura

```
wh-pro/
├── backend/      Node.js + Express + MongoDB
└── frontend/     React + Vite + Tailwind
```

---

## ⚡ Setup rapido (5 minuti)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# → Apri .env e compila MONGODB_URI e JWT_SECRET
npm run seed      # crea admin + dati demo
npm run dev       # avvia su http://localhost:5000
```

**Genera JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env
# VITE_API_URL=http://localhost:5000/api  (già impostato)
npm run dev       # avvia su http://localhost:5173
```

### 3. Accedi

Solo in sviluppo (`npm run seed` con `NODE_ENV` diverso da `production`):

| Username | Password | Ruolo |
|---|---|---|
| admin | valore di `SEED_ADMIN_PASSWORD`, altrimenti `AdminDemo2026!` | Amministratore |
| operatore | `OperatoreDemo1!` | Magazziniere |

In produzione il seed crea solo l'admin e **richiede** `SEED_ADMIN_PASSWORD` (minimo 10 caratteri).

---

## 🔑 Variabili d'ambiente backend

| Variabile | Descrizione |
|---|---|
| `MONGODB_URI` | Stringa connessione MongoDB Atlas |
| `JWT_SECRET` | Stringa casuale 64 caratteri |
| `FRONTEND_URL` | URL frontend (CORS) |
| `ENABLE_EMAIL` | `true/false` — MailerSend |
| `MAILERSEND_API_KEY` | API key MailerSend |

---

## 🚀 Deploy

### Render (backend)
1. Nuovo **Web Service** da GitHub
2. Build: `npm install`
3. Start: `node server.js`
4. Aggiungi tutte le variabili d'ambiente
5. Il backend parte su `https://tuo-app.onrender.com`

### Render (frontend)
1. Nuovo **Static Site** da GitHub
2. Build: `npm run build`
3. Publish dir: `dist`
4. `VITE_API_URL=https://tuo-app.onrender.com/api`

---

## 🗄️ Collections MongoDB

| Collection | Descrizione |
|---|---|
| `users` | Utenti (admin/operatore) con tema |
| `products` | Prodotti con codice, quantità, soglia |
| `movements` | Storico entrate/uscite con snapshot |
| `categories` | Categorie con colore ed emoji |
| `notifications` | Notifiche sistema (TTL 90 giorni) |
| `standardtimes` | Tempi standard di saldatura per tipologia/dimensione custodia |
| `productionentries` | Righe Andon Board con snapshot del tempo standard |
| `auditlogs` | Registro modifiche (chi, cosa, quando, prima/dopo) |
| `apikeys` | Chiavi dell'API di integrazione (solo hash) |
| `reservations` | Prenotazioni di materiale da sistemi esterni (offerte) |
| `webhooksubscriptions` / `webhookdeliveries` | Webhook e storico invii (7 giorni) |
| `idempotencyrecords` | Risposte alle POST dell'API, per i retry (48 ore) |

---

## ⏱️ Produzione saldatura (Andon Board)

Digitalizza due fogli di reparto: la tabella plastificata dei **tempi standard** e il tracciato **Andon Board** compilato a mano.

- **Tempi standard** (`/production/standard-times`): tempo per singola custodia per tipologia e dimensione (IP65, ATEX, NEMA, quadra…). Al primo accesso la tabella si popola con i valori del foglio di reparto; supervisore e admin possono modificarla.
- **Andon Board** (`/production`): ogni riga registra operatore, commessa, posizione, pezzi, tipologia custodia, tempo impiegato, data fine, sospesa/bindello. Il tempo standard si compila da solo dalla tipologia scelta.
- **Confronto**: tempo atteso (STD × pezzi) vs tempo impiegato, con efficienza per riga, per operatore e sul periodo (oggi / settimana / mese / date libere). Efficienza > 100% = più veloce dello standard.
- **Storico stabile**: il tempo standard viene salvato nella riga al momento della registrazione, quindi modificare la tabella non riscrive i dati passati.
- **Permessi**: l'operatore registra e modifica solo le proprie righe; supervisore e admin gestiscono tutto e possono registrare per altri operatori.

API: `GET/POST/PUT/DELETE /api/production/standard-times`, `GET/POST/PUT/DELETE /api/production/entries`, `GET /api/production/stats?from&to`.

---

## 🔒 Sicurezza

- JWT in **cookie httpOnly** (SameSite=lax) — non leggibile da JavaScript; solo body JSON contro il CSRF
- **Sessioni revocabili**: cambio/reset password, disattivazione e "Esci da tutti i dispositivi" invalidano subito i token aperti
- **bcrypt** costo 12; password di almeno 10 caratteri, senza lo username
- **Helmet**, **mongoSanitize**, **CORS** solo sul frontend autorizzato
- **Rate limiting**: login per username e per IP, API per utente, API di integrazione per chiave
- **Giacenze tracciate**: la quantità cambia solo con movimenti (le rettifiche di admin/supervisori sono movimenti anche loro)
- **Registro modifiche** consultabile dagli admin (Amministrazione → Registro modifiche)
- **API di integrazione** con chiavi a permessi, idempotenza e webhook firmati: vedi [`backend/docs/INTEGRAZIONE.md`](backend/docs/INTEGRAZIONE.md)
- **Soft delete** per i prodotti

### Checklist prima di usarlo con dati reali

Queste cose non dipendono dal codice e vanno verificate nelle dashboard:

- [ ] **Repository privato** su GitHub (contiene la struttura del sistema; i dati reali non vanno mai committati)
- [ ] **MongoDB Atlas**: piano con **backup automatici** (il piano gratuito M0 non li ha) e restore provato almeno una volta
- [ ] **Atlas Network Access**: niente `0.0.0.0/0` se il piano Render lo consente (IP in uscita statici sui piani a pagamento)
- [ ] **Regione UE** per Atlas e Render (GDPR: dati di clienti e dipendenti)
- [ ] Render: `NODE_ENV=production`, `COOKIE_SECURE=true`, `JWT_SECRET` di 64+ caratteri, `DATA_ENCRYPTION_KEY` impostata
- [ ] Hosting a pagamento (i piani gratuiti si spengono e non hanno garanzie di disponibilità)

**Limite noto**: il backend su `onrender.com` è raggiungibile anche direttamente, non solo tramite Vercel.
Chi lo chiama così può falsificare `X-Forwarded-For` e aggirare i limiti *per IP* (quelli per username, per
utente e per chiave restano validi). Per chiuderlo serve un dominio/proxy davanti al backend che accetti solo
il traffico di Vercel (es. Cloudflare con regola dedicata) oppure un header segreto aggiunto da una funzione edge.

---

## 📦 Aggiungere Cloudinary (futuro)

La struttura è già pronta. Per attivare:

1. `npm install cloudinary multer multer-storage-cloudinary`
2. Aggiungi le variabili `CLOUDINARY_*` nel `.env`
3. Crea `config/cloudinary.js` con `makeUploader()`
4. Aggiungi route `POST /api/products/:id/cover` in `routes/products.js`
5. Il modello `Product.js` ha già i campi `images[]` e `coverImage`

---

## 🎨 Personalizzazione tema

Ogni utente può personalizzare il proprio tema dall'icona 🎨 in topbar:
- **Modalità**: Chiaro / Scuro / Acciaio
- **Colore**: 6 preset + color picker custom
- **Bordi**: 5 stili da quadro a pill
- Il tema è salvato nel profilo sul DB e sincronizzato tra dispositivi

## Proprietà e licenza

Il software **Warehouse Pro** è stato sviluppato da **Denis Alexandru Necula**, che ne è l'unico titolare e proprietario.

La pubblicazione di questo repository su GitHub ha finalità esclusivamente di **consultazione e portfolio professionale**. La disponibilità pubblica del codice sorgente **non conferisce alcuna licenza** di utilizzo, copia, modifica o distribuzione. Qualsiasi uso del software in contesti aziendali, produttivi o commerciali è vietato in assenza di un accordo scritto e firmato con l'autore.

La proprietà intellettuale e i diritti di sfruttamento economico rimangono in capo al titolare anche in caso di consegna del software a terzi, salvo diversi accordi contrattuali. Le librerie di terze parti restano soggette alle rispettive licenze. Testo completo nel file [LICENSE](LICENSE).

Per ottenere una licenza d'uso o per informazioni commerciali, contatta l'autore tramite [GitHub](https://github.com/DenisNec52).
