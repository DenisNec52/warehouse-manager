# 📦 Warehouse Manager — Guida Completa
### Setup locale → Deploy su internet in meno di 30 minuti

---

## Indice
1. [Struttura del progetto](#1-struttura)
2. [MongoDB Atlas — crea il database](#2-mongodb-atlas)
3. [Backend — setup locale](#3-backend-locale)
4. [Frontend — setup locale](#4-frontend-locale)
5. [Deploy Backend su Render](#5-deploy-backend)
6. [Deploy Frontend su Render](#6-deploy-frontend)
7. [Credenziali demo e primi passi](#7-credenziali)
8. [API Reference](#8-api-reference)
9. [Sicurezza — dettagli tecnici](#9-sicurezza)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Struttura

```
warehouse-manager/
├── backend/
│   ├── models/
│   │   ├── User.js         ← Schema utente (bcrypt password hash)
│   │   ├── Movement.js     ← Schema movimenti (IN/OUT)
│   │   └── Category.js     ← Schema reparti
│   ├── routes/
│   │   ├── auth.js         ← POST /login · GET /me
│   │   ├── movements.js    ← GET / · POST / · GET /stats/today
│   │   ├── inventory.js    ← GET / · GET /:code
│   │   └── categories.js   ← GET / · POST / (admin) · DELETE /:name (admin)
│   ├── middleware/
│   │   └── auth.js         ← Guard JWT per tutte le route protette
│   ├── server.js           ← Entry point Express
│   ├── seed.js             ← Popola DB con dati iniziali
│   ├── .env.example        ← Template variabili ambiente
│   └── package.json
└── frontend/
    ├── src/
    │   ├── api.js          ← Layer Axios centralizzato (JWT automatico)
    │   ├── App.jsx         ← SPA React completa
    │   └── main.jsx        ← Entry point React
    ├── index.html
    ├── vite.config.js
    ├── .env.example
    └── package.json
```

**Stack tecnico:**
- Backend: Node.js + Express + Mongoose + bcryptjs + jsonwebtoken
- Frontend: React 18 + Vite + Axios
- Database: MongoDB Atlas (cloud, gratuito)
- Deploy: Render.com (gratuito per progetti personali)

---

## 2. MongoDB Atlas

### 2a. Crea l'account
1. Vai su **https://cloud.mongodb.com** e registrati (gratis)
2. Scegli **"Build a Database"** → seleziona **M0 Free Tier**
3. Scegli provider **AWS** e regione **Frankfurt (eu-central-1)** (più vicina all'Italia)
4. Clicca **"Create"** e aspetta 1-2 minuti

### 2b. Crea l'utente del database
1. Menu sinistro → **Security > Database Access**
2. **"Add New Database User"**
3. Imposta:
   - **Authentication Method:** Password
   - **Username:** `wh_admin`
   - **Password:** genera una password sicura e **COPIALA** da qualche parte
   - **Database User Privileges:** "Read and write to any database"
4. Clicca **"Add User"**

### 2c. Configura l'accesso di rete
1. Menu sinistro → **Security > Network Access**
2. **"Add IP Address"**
3. Clicca **"Allow Access from Anywhere"** (inserisce `0.0.0.0/0`)
   > ⚠️ Va bene per sviluppo e per Render (IP dinamico). In produzione enterprise potresti restringere agli IP fissi del server.
4. Clicca **"Confirm"**

### 2d. Ottieni la Connection String
1. Menu sinistro → **Data Services** → clicca **"Connect"** sul tuo cluster
2. Scegli **"Drivers"**
3. Driver: **Node.js**, Version: **5.5 or later**
4. Copia la stringa, sarà tipo:
   ```
   mongodb+srv://wh_admin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. **Sostituisci `<password>`** con la password che hai copiato al punto 2b
6. **Aggiungi il nome del database** dopo `.net/`:
   ```
   mongodb+srv://wh_admin:TUA_PASSWORD@cluster0.xxxxx.mongodb.net/warehouse?retryWrites=true&w=majority
   ```
   Salvala: ti servirà come `MONGODB_URI`.

---

## 3. Backend — Setup Locale

```bash
# Entra nella cartella backend
cd backend

# Installa le dipendenze
npm install

# Crea il file .env dal template
cp .env.example .env
```

Apri `.env` con un editor e compila tutti i campi:

```env
MONGODB_URI=mongodb+srv://wh_admin:TUA_PASSWORD@cluster0.xxxxx.mongodb.net/warehouse?retryWrites=true&w=majority
JWT_SECRET=<stringa casuale lunga>
JWT_EXPIRES_IN=8h
PORT=5000
FRONTEND_URL=http://localhost:5173
```

**Come generare il JWT_SECRET** (apri un terminale nella cartella backend):
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Copia il risultato e incollalo come valore di `JWT_SECRET`.

### 3a. Esegui il seed (primo avvio)
```bash
npm run seed
```

Output atteso:
```
🌱 Avvio seed...
✅ MongoDB connesso
🗑️  DB svuotato
👤 3 utenti creati
📂 3 reparti creati
📦 Movimenti di esempio creati

✅ Seed completato!
──────────────────────────────────────────────────
  admin          → Admin123!   [Amministratore]
  magazziniere   → Mag123!     [Magazziniere]
  operatore      → Op123!      [Operatore]
──────────────────────────────────────────────────
```

> ⚠️ Il seed **cancella tutto** prima di inserire. Eseguilo solo al primo setup o per resettare i dati demo.

### 3b. Avvia il server
```bash
npm run dev      # sviluppo (con nodemon, si riavvia automaticamente)
npm start        # produzione
```

### 3c. Verifica che funzioni
```bash
curl http://localhost:5000/api/health
# → {"status":"ok","db":"connected","ts":"..."}
```

---

## 4. Frontend — Setup Locale

```bash
# Apri un nuovo terminale, entra nella cartella frontend
cd frontend

# Installa le dipendenze
npm install

# Crea il file .env
cp .env.example .env
```

Il file `.env` in sviluppo va bene così (Vite fa il proxy automaticamente):
```env
VITE_API_URL=http://localhost:5000/api
```

```bash
npm run dev
# → Apri http://localhost:5173
```

Dovresti vedere la schermata di login. Prova con `admin` / `Admin123!`.

---

## 5. Deploy Backend su Render

### 5a. Prepara il repository GitHub
1. Crea un repository su **https://github.com**
2. Carica il progetto (puoi caricare solo la cartella `backend` o l'intero monorepo)

### 5b. Crea il Web Service su Render
1. Vai su **https://render.com** → accedi / registrati
2. **"New" → "Web Service"**
3. Connetti il tuo repository GitHub
4. Configura il servizio:

| Campo | Valore |
|-------|--------|
| **Name** | `warehouse-api` (o come preferisci) |
| **Root Directory** | `backend` (se hai un monorepo) |
| **Environment** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | Free |

5. Nella sezione **"Environment Variables"** aggiungi:

| Chiave | Valore |
|--------|--------|
| `MONGODB_URI` | La tua connection string Atlas completa |
| `JWT_SECRET` | La stringa che hai generato prima |
| `JWT_EXPIRES_IN` | `8h` |
| `FRONTEND_URL` | `https://warehouse-frontend.onrender.com` ← metti l'URL del frontend che creerai dopo |

6. Clicca **"Create Web Service"**
7. Aspetta il primo deploy (2-4 minuti)
8. **Copia l'URL** del servizio, tipo: `https://warehouse-api.onrender.com`
9. Testa: `https://warehouse-api.onrender.com/api/health`

> 💡 **Nota Render Free:** il servizio va in sleep dopo 15 minuti di inattività. Il primo accesso dopo il sleep richiede ~30 secondi. Per evitarlo usa un piano a pagamento o un cron job di "ping".

---

## 6. Deploy Frontend su Render

### 6a. Crea uno Static Site su Render
1. **"New" → "Static Site"**
2. Connetti lo stesso repository (o un repo separato per il frontend)
3. Configura:

| Campo | Valore |
|-------|--------|
| **Name** | `warehouse-frontend` |
| **Root Directory** | `frontend` |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `dist` |

4. In **"Environment Variables"** aggiungi:

| Chiave | Valore |
|--------|--------|
| `VITE_API_URL` | `https://warehouse-api.onrender.com/api` |

5. Clicca **"Create Static Site"**
6. Aspetta il build (2-3 minuti)
7. Apri l'URL generato (tipo `https://warehouse-frontend.onrender.com`)

### 6b. Aggiorna CORS sul backend
Ora che hai l'URL del frontend, torna su Render → backend → Environment Variables:
- Aggiorna `FRONTEND_URL` con il vero URL del frontend: `https://warehouse-frontend.onrender.com`
- Salva → il backend si rideploya automaticamente

---

## 7. Credenziali Demo e Primi Passi

Dopo il seed, questi sono gli utenti disponibili:

| Username | Password | Ruolo | Permessi |
|----------|----------|-------|----------|
| `admin` | `Admin123!` | Amministratore | Tutto + aggiunta reparti |
| `magazziniere` | `Mag123!` | Magazziniere | Movimenti + visualizzazione |
| `operatore` | `Op123!` | Operatore | Movimenti + visualizzazione |

### Cambia le password in produzione
Puoi connetterti direttamente al DB via MongoDB Compass o Atlas Data Explorer e aggiornare le password. Oppure aggiungi una route admin nel backend per cambiarle (non inclusa per semplicità).

### Flusso tipico di utilizzo
1. **Login** con le tue credenziali
2. **Nuovo Movimento** → inserisci codice prodotto, seleziona reparto, inserisci quantità → Entrata o Uscita
3. **Inventario** → vedi lo stock di tutti gli articoli, filtra per reparto, clicca "Storico" per vedere i movimenti di un articolo
4. **Storico** → tutti i movimenti con filtri per tipo e reparto, paginazione

---

## 8. API Reference

Tutte le route (tranne `/api/auth/login`) richiedono header:
```
Authorization: Bearer <JWT_TOKEN>
```

### Auth
| Metodo | Endpoint | Body | Risposta |
|--------|----------|------|----------|
| `POST` | `/api/auth/login` | `{username, password}` | `{token, user}` |
| `GET` | `/api/auth/me` | — | `{user}` |

### Movimenti
| Metodo | Endpoint | Parametri | Risposta |
|--------|----------|-----------|----------|
| `GET` | `/api/movements` | `page, limit, type, category, search` | `{movements[], pagination}` |
| `POST` | `/api/movements` | `{code, qty, type, category, note?}` | `{movement}` |
| `GET` | `/api/movements/stats/today` | — | `{IN:{qty,count}, OUT:{qty,count}}` |

### Inventario
| Metodo | Endpoint | Risposta |
|--------|----------|----------|
| `GET` | `/api/inventory` | `{inventory[], totals}` |
| `GET` | `/api/inventory/:code` | `{item, movements[]}` |

### Reparti (Categorie)
| Metodo | Endpoint | Note |
|--------|----------|------|
| `GET` | `/api/categories` | Tutti gli utenti |
| `POST` | `/api/categories` | Solo Amministratore. Body: `{name}` |
| `DELETE` | `/api/categories/:name` | Solo Amministratore |

---

## 9. Sicurezza — Dettagli Tecnici

### Password (bcrypt)
- Le password vengono hashate con **bcrypt** (salt rounds: 12) tramite un hook `pre-save` sul modello Mongoose
- Il campo `password` non viene mai restituito nelle query (opzione `select: false`)
- Il confronto password usa `bcrypt.compare()` — non è mai possibile "decifrare" una password, solo verificarla

### JWT (JSON Web Token)
- I token scadono dopo 8 ore (configurabile con `JWT_EXPIRES_IN`)
- Il secret deve essere almeno 64 caratteri casuali — non usare stringhe prevedibili
- In caso di token scaduto o invalido, il client viene automaticamente reindirizzato al login
- Il token viene salvato in `localStorage` — per ambienti ad alta sicurezza considera `httpOnly cookie`

### Autorizzazione per ruolo
- L'aggiunta di reparti è verificata **server-side** (`req.user.role !== "Amministratore"` → 403)
- La verifica delle scorte insufficienti avviene **server-side** tramite aggregazione MongoDB
- Ogni movimento salva snapshot di `userId`, `userName`, `userRole` per tracciabilità permanente

### CORS
- Il backend accetta richieste solo dall'URL definito in `FRONTEND_URL`
- In produzione, assicurati che `FRONTEND_URL` corrisponda esattamente all'URL del frontend (no slash finale)

---

## 10. Troubleshooting

### "Cannot connect to MongoDB"
- Controlla che la connection string in `.env` sia corretta
- Verifica che l'IP `0.0.0.0/0` sia nella whitelist di Network Access su Atlas
- Controlla username e password dell'utente MongoDB (non dell'account Atlas)

### "Credenziali non valide" al login
- Assicurati di aver eseguito `npm run seed` dopo aver configurato `.env`
- Le credenziali demo sono case-sensitive: `admin` / `Admin123!`

### Il frontend non riesce a contattare il backend
- Verifica che `VITE_API_URL` in `frontend/.env` punti al backend corretto
- In sviluppo locale: backend su `localhost:5000`, frontend su `localhost:5173`
- Il proxy Vite funziona solo in dev — in produzione usa l'URL completo del backend

### Render: "Service Unavailable" al primo accesso
- Il piano free va in sleep. Aspetta 30-60 secondi e ricarica.

### CORS error nel browser
- Assicurati che `FRONTEND_URL` nel backend corrisponda esattamente all'URL del frontend (incluso `https://`, senza slash finale)
- Dopo aver cambiato variabili d'ambiente su Render, il servizio si rideploya — aspetta che finisca

### Vuoi resettare tutto il database
```bash
cd backend
npm run seed    # ⚠️ cancella tutto e ripopola con i dati demo
```

---

## Comandi di riferimento rapido

```bash
# ── BACKEND ──────────────────────────────────
cd backend
npm install          # installa dipendenze
npm run seed         # resetta e popola il DB
npm run dev          # avvia in modalità sviluppo (nodemon)
npm start            # avvia in produzione

# ── FRONTEND ─────────────────────────────────
cd frontend
npm install          # installa dipendenze
npm run dev          # avvia Vite dev server → localhost:5173
npm run build        # build produzione → cartella dist/
npm run preview      # anteprima del build produzione
```

---

*Warehouse Manager v2.0 — Stack: React + Vite + Express + MongoDB Atlas + bcrypt + JWT*
