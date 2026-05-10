/**
 * utils/email.js
 *
 * Servizio email via MailerSend con feature flag.
 * Se ENABLE_EMAIL=false non invia nulla (nessun errore).
 */
const ENABLED = process.env.ENABLE_EMAIL === "true";

async function sendEmail({ to, subject, html, text }) {
  if (!ENABLED) {
    console.log(`[email] Disabilitato — skip invio a ${to}`);
    return { skipped: true };
  }
  try {
    const { MailerSend, EmailParams, Sender, Recipient } = require("mailersend");
    const mailer = new MailerSend({ apiKey: process.env.MAILERSEND_API_KEY });
    const params = new EmailParams()
      .setFrom(new Sender(process.env.MAIL_FROM, process.env.MAIL_FROM_NAME))
      .setTo([new Recipient(to)])
      .setSubject(subject)
      .setHtml(html)
      .setText(text || html.replace(/<[^>]+>/g, ""));
    await mailer.email.send(params);
    console.log(`[email] Inviata a ${to}: "${subject}"`);
    return { sent: true };
  } catch (err) {
    console.error("[email] Errore:", err.message);
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
exports.sendLoginNotification = (user, ip) => sendEmail({
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

exports.sendEmail = sendEmail;
