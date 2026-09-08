/**
 * utils/validateEnv.js
 *
 * Controlla le variabili d'ambiente all'avvio del server.
 *
 * Senza questo controllo, una .env incompleta fa partire il server
 * comunque e lo fa fallire più tardi in modo oscuro (es. jwt.sign()
 * che lancia un errore criptico alla prima richiesta di login perché
 * JWT_SECRET è undefined). Meglio fermarsi subito con un messaggio
 * chiaro su cosa manca.
 *
 * - Le variabili in REQUIRED sono indispensabili: se mancano, o hanno
 *   ancora il valore segnaposto copiato da .env.example, il processo
 *   si ferma (process.exit(1)).
 * - Le funzionalità opzionali (email, Cloudinary) restano coerenti con
 *   la filosofia "non bloccante" già usata nel resto del backend: se
 *   abilitate ma configurate a metà, il server parte comunque ma stampa
 *   un avviso, invece di impedire l'avvio per una feature secondaria.
 */

const REQUIRED = [
  { key: "MONGODB_URI", hint: "stringa di connessione MongoDB Atlas (vedi backend/.env.example)" },
  { key: "JWT_SECRET",  hint: "genera con: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"" },
];

// Valori segnaposto di .env.example copiati per errore invece di essere sostituiti.
const PLACEHOLDER_VALUES = new Set([
  "SOSTITUISCI_CON_64_CARATTERI_CASUALI",
  "mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/warehouse?retryWrites=true&w=majority",
]);

const EMAIL_PROVIDER_VARS = {
  mailersend: ["MAILERSEND_API_KEY", "MAIL_FROM"],
  resend:     ["RESEND_API_KEY", "MAIL_FROM"],
  smtp:       ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"],
  console:    [],
};

function checkEmailConfig(warnings) {
  if (process.env.ENABLE_EMAIL !== "true") return;
  const provider = (process.env.EMAIL_PROVIDER || "mailersend").toLowerCase();
  const need = EMAIL_PROVIDER_VARS[provider];
  if (!need) {
    warnings.push(`EMAIL_PROVIDER="${provider}" non riconosciuto (valori validi: ${Object.keys(EMAIL_PROVIDER_VARS).join(", ")}). Le email non verranno inviate.`);
    return;
  }
  const missing = need.filter(k => !process.env[k]);
  if (missing.length)
    warnings.push(`ENABLE_EMAIL=true con EMAIL_PROVIDER=${provider} ma manca: ${missing.join(", ")}. Le email falliranno silenziosamente (verrà solo loggato un errore).`);
}

function checkCloudinaryConfig(warnings) {
  if (process.env.ENABLE_CLOUDINARY !== "true") return;
  const missing = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].filter(k => !process.env[k]);
  if (missing.length)
    warnings.push(`ENABLE_CLOUDINARY=true ma manca: ${missing.join(", ")}. L'upload immagini prodotto non funzionerà.`);
}

module.exports = function validateEnv() {
  const missing     = REQUIRED.filter(({ key }) => !process.env[key]);
  const placeholder = REQUIRED.filter(({ key }) => PLACEHOLDER_VALUES.has(process.env[key]));

  if (missing.length || placeholder.length) {
    console.error("\n❌  Configurazione .env incompleta — il server non parte.\n");
    missing.forEach(({ key, hint }) => console.error(`   • ${key} mancante — ${hint}`));
    placeholder.forEach(({ key, hint }) => console.error(`   • ${key} ha ancora il valore d'esempio, va cambiato — ${hint}`));
    console.error("\nControlla il tuo file .env (parti da backend/.env.example) e riavvia.\n");
    process.exit(1);
  }

  const warnings = [];
  if (process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "true")
    warnings.push("NODE_ENV=production ma COOKIE_SECURE non è 'true': i cookie di sessione non saranno marcati Secure/SameSite=None (rischioso dietro HTTPS con frontend su dominio diverso).");
  checkEmailConfig(warnings);
  checkCloudinaryConfig(warnings);

  if (warnings.length) {
    console.warn("\n⚠️  Avvisi di configurazione (il server parte comunque):");
    warnings.forEach(w => console.warn(`   • ${w}`));
    console.warn("");
  }
};
