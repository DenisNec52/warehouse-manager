/**
 * routes/vision.js
 *
 * Sistema IA Vision con provider switchabile.
 * Cambia AI_VISION_PROVIDER nel .env per usare un provider diverso
 * senza toccare nessun altro file.
 *
 * POST /api/vision/scan
 *
 * ════════════════════════════════════════════
 * PROVIDER DISPONIBILI
 * ════════════════════════════════════════════
 *
 *  huggingface  → Hugging Face Inference API (default)
 *                 Gratuito, open source, no tracking commerciale
 *                 Chiave: https://huggingface.co/settings/tokens
 *                 Limite: ~1000 req/giorno piano free
 *
 *  gemini       → Google Gemini 1.5 Flash
 *                 Gratuito, 1500 req/giorno
 *                 Chiave: https://aistudio.google.com/app/apikey
 *
 *  ollama       → Modello locale via Ollama (massima privacy)
 *                 Nessun dato esce dalla rete locale
 *                 Richiede Ollama installato: https://ollama.com
 *                 Modello consigliato: ollama pull llava
 *
 *  mock         → Risposta fissa per test/sviluppo (no AI)
 *
 * ════════════════════════════════════════════
 * CONFIGURAZIONE .env
 * ════════════════════════════════════════════
 *  AI_VISION_PROVIDER=huggingface
 *  HF_API_KEY=hf_xxxxxxxxxxxxxxxxxxxx
 *  HF_MODEL=Salesforce/blip-image-captioning-large   (opzionale)
 *
 *  AI_VISION_PROVIDER=gemini
 *  GEMINI_API_KEY=AIzaSy_xxxxxxxxxxxx
 *
 *  AI_VISION_PROVIDER=ollama
 *  OLLAMA_URL=http://localhost:11434   (opzionale, default locale)
 *  OLLAMA_MODEL=llava                  (opzionale)
 *
 *  AI_VISION_PROVIDER=mock             (per sviluppo)
 */

const express = require("express");
const { protect } = require("../middleware/auth");

const router = express.Router();
router.use(protect);

// ─────────────────────────────────────────────────────────────
// PROMPT — identico per tutti i provider che lo supportano.
// Calibrato sui codici e categorie reali del magazzino.
// ─────────────────────────────────────────────────────────────
const WAREHOUSE_PROMPT = [
  "Sei l'assistente IA di un magazzino industriale italiano.",
  "Analizza l'immagine (etichetta, cartellino, bolla DDT, fattura, foto articolo) ed estrai i dati.",
  "",
  "=== SCHEMI CODICI ARTICOLO ===",
  "  NUMERICO CON VARIANTE  -> numero-numero   es: 1534-1 | 1849-3 | 4792-9 | 282-1",
  "  SOLO NUMERICO          -> numero           es: 1796 | 2259 | 987 | 3941",
  "  ALFANUMERICO           -> lettere+numero   es: GR100 | GR80",
  "  DESCRITTIVO            -> parole+misura    es: FE SABB. 10 pollici | FLANGGETTE STILMAS",
  "  CODICE CON ?           -> numero-?         es: 738-? | 3842-? (trascrivilo esattamente)",
  "  COMMESSA               -> C.O + numero     es: C.O 856 | C.O. 3237",
  "",
  "=== CATEGORIE ===",
  "  FLANGE | FASCE ATEX | FASCE LASER | SCATOLE NEMA | TAPPI & ESAGONI INOX",
  "",
  "=== INTERPRETAZIONE DOCUMENTO ===",
  "  ETICHETTA  -> codice + quantita + categoria",
  "  BOLLA DDT  -> codici tabella + quantita + numero DDT/commessa + tipo (fornitore=IN, reparto=OUT)",
  "  FOTO FISICO -> identifica dalla forma (flangia circolare=FLANGE, scatola NEMA=SCATOLE NEMA)",
  "",
  "=== OUTPUT — solo JSON valido, nessun testo extra, nessun backtick ===",
  "{",
  '  "codice": "codice esatto come appare oppure null",',
  '  "quantita": numero intero oppure null,',
  '  "tipo": "IN" oppure "OUT" oppure null,',
  '  "riferimento": "C.O., DDT, numero ordine oppure null",',
  '  "categoria": "categoria oppure null",',
  '  "note": "info extra max 80 caratteri oppure null",',
  '  "confidenza": "alta oppure media oppure bassa",',
  '  "motivo_confidenza": "max 10 parole sul perche di questa confidenza"',
  "}",
  "",
  "REGOLE: trascrivi i codici ESATTAMENTE, non inventare dati mancanti, metti null se incerto.",
].join("\n");

// ─────────────────────────────────────────────────────────────
// PROVIDER: Hugging Face Inference API
// Gratuito, open source — https://huggingface.co/settings/tokens
// ─────────────────────────────────────────────────────────────
async function scanWithHuggingFace(base64, mediaType) {
  const apiKey = process.env.HF_API_KEY;
  if (!apiKey) throw new Error("HF_API_KEY non configurata nel .env");

  // Florence-2: miglior modello HF per document understanding, gratuito
  const model = process.env.HF_MODEL || "microsoft/Florence-2-base";
  const url    = `https://api-inference.huggingface.co/models/${model}`;

  // Converti base64 in Buffer per inviarlo come binary
  const imageBuffer = Buffer.from(base64, "base64");

  const response = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  mediaType || "image/jpeg",
      "X-Wait-For-Model": "true",  // aspetta se il modello è in cold start
    },
    body: imageBuffer,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 503) throw new Error("Modello HF in avvio (cold start) — riprova tra 20 secondi");
    if (response.status === 429) throw new Error("Limite giornaliero HF raggiunto — riprova domani");
    throw new Error("Errore HF: " + (err?.error || response.statusText));
  }

  // HF caption models restituiscono testo descrittivo — lo passiamo a un secondo
  // step di estrazione strutturata con un modello text HF gratuito
  const captionData = await response.json();
  const caption = Array.isArray(captionData)
    ? captionData[0]?.generated_text || captionData[0]?.label || JSON.stringify(captionData[0])
    : captionData?.generated_text || JSON.stringify(captionData);

  // Secondo step: estrazione strutturata da testo con zephyr (gratuito)
  const extractUrl = "https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta";
  const extractRes = await fetch(extractUrl, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Wait-For-Model": "true" },
    body: JSON.stringify({
      inputs: `${WAREHOUSE_PROMPT}\n\nDescrizione immagine rilevata: "${caption}"\n\nJSON:`,
      parameters: { max_new_tokens: 300, temperature: 0.05, return_full_text: false },
    }),
  });

  if (!extractRes.ok) throw new Error("Errore estrazione HF: " + extractRes.statusText);
  const extractData = await extractRes.json();
  const raw = Array.isArray(extractData)
    ? extractData[0]?.generated_text || ""
    : extractData?.generated_text || "";

  return raw;
}

// ─────────────────────────────────────────────────────────────
// PROVIDER: Google Gemini 1.5 Flash
// Gratuito, 1500 req/giorno — https://aistudio.google.com/app/apikey
// ─────────────────────────────────────────────────────────────
async function scanWithGemini(base64, mediaType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY non configurata nel .env");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [
        { inline_data: { mime_type: mediaType, data: base64 } },
        { text: WAREHOUSE_PROMPT },
      ]}],
      generationConfig: { temperature: 0.05, maxOutputTokens: 400 },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 429) throw new Error("Limite giornaliero Gemini raggiunto (1500/giorno)");
    throw new Error("Errore Gemini: " + (err?.error?.message || response.statusText));
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ─────────────────────────────────────────────────────────────
// PROVIDER: Ollama locale
// Privacy totale — https://ollama.com — nessun dato esce dalla rete
// Setup: ollama pull llava  (o moondream per PC meno potenti)
// ─────────────────────────────────────────────────────────────
async function scanWithOllama(base64) {
  const baseUrl = process.env.OLLAMA_URL  || "http://localhost:11434";
  const model   = process.env.OLLAMA_MODEL || "llava";

  const response = await fetch(`${baseUrl}/api/generate`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: WAREHOUSE_PROMPT,
      images: [base64],
      stream: false,
      options: { temperature: 0.05 },
    }),
  });

  if (!response.ok) {
    if (response.status === 404) throw new Error(`Modello Ollama '${model}' non trovato. Esegui: ollama pull ${model}`);
    throw new Error("Errore Ollama: " + response.statusText);
  }

  const data = await response.json();
  return data?.response || "";
}

// ─────────────────────────────────────────────────────────────
// PROVIDER: Mock (sviluppo/test — nessuna chiamata AI)
// ─────────────────────────────────────────────────────────────
async function scanWithMock() {
  await new Promise(r => setTimeout(r, 800)); // simula latenza
  return JSON.stringify({
    codice:             "1534-1",
    quantita:           4,
    tipo:               "IN",
    riferimento:        "C.O 856",
    categoria:          "FLANGE",
    note:               "Mock provider attivo — nessuna AI reale",
    confidenza:         "alta",
    motivo_confidenza:  "risposta simulata per sviluppo",
  });
}

// ─────────────────────────────────────────────────────────────
// ROUTER — seleziona il provider dal .env e normalizza l'output
// ─────────────────────────────────────────────────────────────
router.post("/scan", async (req, res) => {
  const { image, mediaType = "image/jpeg" } = req.body;
  if (!image) return res.status(400).json({ message: "Immagine obbligatoria (base64)." });

  const provider = (process.env.AI_VISION_PROVIDER || "huggingface").toLowerCase();
  const base64   = image.replace(/^data:image\/\w+;base64,/, "");

  let raw = "";
  try {
    switch (provider) {
      case "huggingface": raw = await scanWithHuggingFace(base64, mediaType); break;
      case "gemini":      raw = await scanWithGemini(base64, mediaType);      break;
      case "ollama":      raw = await scanWithOllama(base64);                 break;
      case "mock":        raw = await scanWithMock();                         break;
      default:
        return res.status(500).json({ message: `Provider '${provider}' non riconosciuto. Valori validi: huggingface, gemini, ollama, mock` });
    }

    // Parsing JSON robusto
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new SyntaxError("Nessun JSON trovato nella risposta");

    const parsed = JSON.parse(jsonMatch[0]);
    res.json({ result: parsed, provider });

  } catch (err) {
    console.error(`[vision/scan][${provider}]`, err.message);

    // Errori di parsing → risposta parziale invece di 500
    if (err instanceof SyntaxError) {
      return res.status(422).json({
        message: "Il modello non ha restituito JSON valido. Riprova con una foto più nitida.",
        raw,
        provider,
      });
    }
    res.status(500).json({ message: err.message, provider });
  }
});

// ── GET /api/vision/provider — info sul provider attivo (debug) ─
router.get("/provider", (req, res) => {
  const provider = process.env.AI_VISION_PROVIDER || "huggingface";
  const configured = {
    huggingface: !!process.env.HF_API_KEY,
    gemini:      !!process.env.GEMINI_API_KEY,
    ollama:      true, // non richiede chiave
    mock:        true,
  };
  res.json({
    active:      provider,
    configured:  configured[provider] ?? false,
    all:         configured,
  });
});

module.exports = router;
