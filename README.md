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

| Username | Password | Ruolo |
|---|---|---|
| admin | Admin123! | Amministratore |
| operatore | Op123! | Magazziniere |

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

---

## 🔒 Sicurezza

- JWT in **cookie httpOnly** — immune a XSS
- **bcrypt** salt 12 per le password
- **Helmet** — header HTTP sicuri
- **mongoSanitize** — no injection MongoDB
- **Rate limiting** — 10 login/15min
- **CORS** — solo frontend autorizzato
- **Soft delete** — prodotti/utenti non vengono mai cancellati fisicamente

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
