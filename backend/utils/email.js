/**
 * utils/email.js
 *
 * Invio email con provider intercambiabile — stesso principio dello
 * "switchable provider" già usato in routes/vision.js: cambi EMAIL_PROVIDER
 * nel .env, i template sotto e il resto del codice non cambiano mai.
 * Se un provider dà problemi (rate limit, account sospeso, bug della loro
 * API) si passa a un altro senza toccare una riga di codice applicativo.
 *
 * Se ENABLE_EMAIL=false non invia nulla (nessun errore) — comportamento
 * invariato rispetto a prima.
 *
 * ════════════════════════════════════════════
 * PROVIDER DISPONIBILI
 * ════════════════════════════════════════════
 *
 *  resend      → Resend (consigliato, default)
 *                Gratuito: 3.000 email/mese, 100/giorno, 3 domini propri
 *                (o usa il dominio di test di Resend per iniziare subito)
 *                Chiave: https://resend.com/api-keys
 *
 *  smtp        → Qualsiasi provider via SMTP standard (nodemailer)
 *                Funziona con Brevo, Amazon SES, Google Workspace, o
 *                qualunque altro SMTP: è la "via di fuga" universale se
 *                un provider ha problemi, basta cambiare le credenziali,
 *                non il codice.
 *
 *  mailersend  → MailerSend (provider originale di questo progetto)
 *                Tenuto per chi lo ha già configurato e funzionante.
 *
 *  console     → Non invia nulla, stampa solo il contenuto in console.
 *                Utile in sviluppo senza configurare alcun provider reale.
 *
 * ════════════════════════════════════════════
 * CONFIGURAZIONE .env
 * ════════════════════════════════════════════
 *  EMAIL_PROVIDER=resend
 *  RESEND_API_KEY=re_xxxxxxxxxxxx
 *
 *  EMAIL_PROVIDER=smtp
 *  SMTP_HOST=smtp-relay.brevo.com
 *  SMTP_PORT=587
 *  SMTP_SECURE=false          # true se usi la porta 465
 *  SMTP_USER=...
 *  SMTP_PASS=...
 *
 *  EMAIL_PROVIDER=mailersend
 *  MAILERSEND_API_KEY=mlsn.xxxx
 *
 *  EMAIL_PROVIDER=console      (nessuna chiave richiesta)
 *
 * Comuni a tutti i provider: MAIL_FROM, MAIL_FROM_NAME, MAIL_ADMIN.
 */
const ENABLED = process.env.ENABLE_EMAIL === "true";

function currentProvider() {
  return (process.env.EMAIL_PROVIDER || "mailersend").toLowerCase();
}

function plainText(html) {
  return html.replace(/<[^>]+>/g, "");
}

// ── Provider: Resend ────────────────────────────────────────────
async function sendViaResend({ to, subject, html, text }) {
  const { Resend } = require("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from:    `${process.env.MAIL_FROM_NAME || "Warehouse Pro"} <${process.env.MAIL_FROM}>`,
    to:      [to],
    subject,
    html,
    text: text || plainText(html),
  });
  if (error) throw new Error(error.message || "Errore invio Resend");
}

// ── Provider: SMTP generico (nodemailer) ────────────────────────
async function sendViaSmtp({ to, subject, html, text }) {
  const nodemailer  = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from:    `"${process.env.MAIL_FROM_NAME || "Warehouse Pro"}" <${process.env.MAIL_FROM}>`,
    to, subject, html,
    text: text || plainText(html),
  });
}

// ── Provider: MailerSend (storico) ──────────────────────────────
async function sendViaMailerSend({ to, subject, html, text }) {
  const { MailerSend, EmailParams, Sender, Recipient } = require("mailersend");
  const mailer = new MailerSend({ apiKey: process.env.MAILERSEND_API_KEY });
  const params = new EmailParams()
    .setFrom(new Sender(process.env.MAIL_FROM, process.env.MAIL_FROM_NAME))
    .setTo([new Recipient(to)])
    .setSubject(subject)
    .setHtml(html)
    .setText(text || plainText(html));
  await mailer.email.send(params);
}

// ── Provider: console (dev, nessun invio reale) ─────────────────
async function sendViaConsole({ to, subject, html, text }) {
  console.log(`\n[email:console] ─────────────────────────────\nA:       ${to}\nOggetto: ${subject}\n\n${text || plainText(html)}\n──────────────────────────────────────────────\n`);
}

const PROVIDERS = {
  resend:     sendViaResend,
  smtp:       sendViaSmtp,
  mailersend: sendViaMailerSend,
  console:    sendViaConsole,
};

async function sendEmail({ to, subject, html, text }) {
  if (!ENABLED) {
    console.log(`[email] Disabilitato (ENABLE_EMAIL=false) — skip invio a ${to}`);
    return { skipped: true };
  }
  if (!to) {
    console.warn("[email] Nessun destinatario (manca MAIL_ADMIN o l'email dell'utente?) — skip invio.");
    return { skipped: true };
  }

  const provider = currentProvider();
  const send = PROVIDERS[provider];
  try {
    if (!send) throw new Error(`EMAIL_PROVIDER "${provider}" non riconosciuto (valori validi: ${Object.keys(PROVIDERS).join(", ")})`);
    await send({ to, subject, html, text });
    console.log(`[email:${provider}] Inviata a ${to}: "${subject}"`);
    return { sent: true };
  } catch (err) {
    console.error(`[email:${provider}] Errore:`, err.message);
    return { error: err.message };
  }
}

// ── Template: scorta prodotto bassa ───────────────────────────
exports.sendLowStockAlert = (product) => sendEmail({
  to:      process.env.MAIL_ADMIN,
  subject: `⚠️ Scorta bassa — ${product.name}`,
  html: `
    <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:20px">
      <h2 style="color:#ef4444">⚠️ Scorta bassa</h2>
      <p>Il prodotto <strong>${product.name}</strong> (${product.code}) ha raggiunto la soglia minima.</p>
      <table style="width:100%;margin-top:12px;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#64748b">Quantità attuale:</td><td><strong>${product.quantity} ${product.unit}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Soglia minima:</td><td><strong>${product.minQuantity} ${product.unit}</strong></td></tr>
        ${product.location ? `<tr><td style="padding:6px 0;color:#64748b">Posizione:</td><td>${product.location}</td></tr>` : ""}
      </table>
    </div>
  `,
});

// ── Template: nuovo movimento importante ──────────────────────
exports.sendMovementAlert = (movement, product) => sendEmail({
  to:      process.env.MAIL_ADMIN,
  subject: `📦 Movimento ${movement.type === "IN" ? "entrata" : "uscita"} — ${product.name}`,
  html: `
    <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:20px">
      <h2 style="color:#3b82f6">Nuovo movimento magazzino</h2>
      <p><strong>${movement.type === "IN" ? "Entrata" : "Uscita"}</strong> di
         <strong>${movement.quantity} ${product.unit}</strong> per ${product.name} (${product.code}).</p>
      <p style="color:#64748b;margin-top:8px">Operatore: ${movement.performedByName}</p>
      ${movement.note ? `<p style="color:#64748b">Note: ${movement.note}</p>` : ""}
    </div>
  `,
});

// ── Template: notifica login ──────────────────────────────────
exports.sendLoginNotification = (user) => sendEmail({
  to:      process.env.MAIL_ADMIN,
  subject: `🔐 Nuovo accesso — ${user.name}`,
  html: `
    <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:20px">
      <h2 style="color:#10b981">Nuovo accesso al sistema</h2>
      <p>L'utente <strong>${user.name}</strong> (${user.username}) ha effettuato l'accesso.</p>
      <p style="color:#64748b;margin-top:8px">Ruolo: ${user.role}</p>
      <p style="color:#64748b">Data: ${new Date().toLocaleString("it-IT")}</p>
    </div>
  `,
});

// ── Template: recupero password ───────────────────────────────
// Va all'email personale dell'utente (non a MAIL_ADMIN): richiede quindi
// che gli utenti abbiano un campo email valorizzato (vedi models/User.js).
exports.sendPasswordReset = (user, resetUrl) => sendEmail({
  to:      user.email,
  subject: "Reimposta la tua password — Warehouse Pro",
  html: `
    <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:20px">
      <h2 style="color:#3b82f6">Reimposta la password</h2>
      <p>Ciao ${user.name}, abbiamo ricevuto una richiesta di reset password per il tuo account
         (<strong>${user.username}</strong>).</p>
      <p style="margin:20px 0">
        <a href="${resetUrl}" style="background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
          Scegli una nuova password
        </a>
      </p>
      <p style="color:#64748b;font-size:13px">Il link scade tra 1 ora. Se non hai richiesto tu il reset, ignora questa email: la tua password attuale resta valida.</p>
      <p style="color:#94a3b8;font-size:12px;margin-top:16px">Se il pulsante non funziona, copia questo link nel browser:<br>${resetUrl}</p>
    </div>
  `,
});

exports.sendEmail = sendEmail;
