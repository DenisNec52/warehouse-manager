/**
 * utils/import_inventory.js
 *
 * Importa l'inventario da warehouse_inventory.json nel database.
 *
 * Comportamento:
 * - Crea le categorie se non esistono già (upsert per nome)
 * - Ogni articolo è un prodotto separato; se lo stesso codice appare
 *   su più pedane, crea record distinti con location = "CATEGORIA / PEDANA"
 * - I codici con "?" vengono importati così come sono
 * - Le note vengono aggiunte al campo notes del prodotto
 * - Non tocca prodotti già esistenti (skip con log)
 *
 * Uso:
 *   node utils/import_inventory.js
 *   node utils/import_inventory.js --dry-run   ← simula senza scrivere
 */

require("dotenv").config();
const mongoose = require("mongoose");
const path     = require("path");
const fs       = require("fs");

const Category = require("../models/Category");
const Product  = require("../models/Product");

// ── Mappa categoria → emoji + colore ──────────────────────────
const CATEGORY_META = {
  "FLANGE":              { icon: "🔵", color: "#3b82f6", description: "Flange industriali" },
  "FASCE ATEX":         { icon: "⚠️",  color: "#f59e0b", description: "Fasce per ambienti ATEX" },
  "FASCE LASER":        { icon: "🔴", color: "#ef4444", description: "Fasce per applicazioni laser" },
  "SCATOLE NEMA":       { icon: "📦", color: "#8b5cf6", description: "Scatole standard NEMA" },
  "TAPPI & ESAGONI INOX": { icon: "🔩", color: "#10b981", description: "Tappi ed esagoni in acciaio inox" },
};

const DRY_RUN = process.argv.includes("--dry-run");

// ── Sanitizza il codice come fa il model (uppercase, trim) ────
function sanitizeCode(raw) {
  return raw.trim().toUpperCase();
}

// ── Costruisce la location dalla categoria e pedana ───────────
function buildLocation(categoria, pedana) {
  // "PED. 1" → "PED.1", normalizza spazi
  const ped = pedana.replace(/\s+/g, "").toUpperCase();
  return `${categoria} / ${ped}`;
}

async function run() {
  const inventoryPath = path.join(__dirname, "warehouse_inventory.json");

  if (!fs.existsSync(inventoryPath)) {
    console.error(`❌  File non trovato: ${inventoryPath}`);
    console.error(`    Copia warehouse_inventory.json in backend/utils/`);
    process.exit(1);
  }

  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf-8"));

  console.log(`\n📦  Warehouse Inventory Import${DRY_RUN ? " [DRY RUN]" : ""}`);
  console.log("─".repeat(50));

  if (!DRY_RUN) {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅  MongoDB connesso\n");
  } else {
    console.log("ℹ️   Dry run — nessuna scrittura su DB\n");
  }

  // ── Trova o crea l'utente admin per createdBy ────────────────
  let adminId = null;
  if (!DRY_RUN) {
    const User = require("../models/User");
    const admin = await User.findOne({ role: "admin" }).lean();
    adminId = admin?._id || null;
  }

  // ── Statistiche ───────────────────────────────────────────────
  const stats = {
    categorieCreate: 0,
    categorieEsistenti: 0,
    prodottiCreati: 0,
    prodottiSkippati: 0,
    errori: [],
  };

  // ── Step 1: crea le categorie ─────────────────────────────────
  console.log("📁  Categorie:");
  const categoryNames = [...new Set(inventory.map(g => g.categoria))];
  const categoryMap   = {}; // nome → _id

  for (const nome of categoryNames) {
    const meta = CATEGORY_META[nome] || { icon: "📦", color: "#6b7280", description: "" };

    if (DRY_RUN) {
      console.log(`    [DRY] Creerebbe: ${meta.icon} ${nome}`);
      categoryMap[nome] = "dry-run-id";
      stats.categorieCreate++;
      continue;
    }

    const existing = await Category.findOne({ name: nome });
    if (existing) {
      console.log(`    ↩️  Già esistente: ${nome}`);
      categoryMap[nome] = existing._id;
      stats.categorieEsistenti++;
    } else {
      const cat = await Category.create({
        name:        nome,
        description: meta.description,
        color:       meta.color,
        icon:        meta.icon,
        createdBy:   adminId,
      });
      console.log(`    ✅  Creata: ${meta.icon} ${nome}`);
      categoryMap[nome] = cat._id;
      stats.categorieCreate++;
    }
  }

  // ── Step 2: importa i prodotti ────────────────────────────────
  console.log("\n📋  Prodotti:");

  for (const gruppo of inventory) {
    const { categoria, pedana, articoli, subcategoria } = gruppo;
    const location   = buildLocation(categoria, pedana);
    const categoryId = categoryMap[categoria];
    const label      = subcategoria ? `${categoria} / ${pedana} (${subcategoria})` : `${categoria} / ${pedana}`;

    console.log(`\n  ▸ ${label}`);

    for (const articolo of articoli) {
      const rawCode = articolo.codice;
      const code    = sanitizeCode(rawCode);
      const qty     = Number(articolo.quantita) || 0;
      const unit    = (articolo.unita || "Pz").trim();
      const notes   = articolo.note || "";

      // Costruisce un codice univoco che includa la location
      // perché lo stesso codice può esistere su pedane diverse
      // Formato: CODE__LOC_HASH (es. "1534-1__FLANGE-PED1")
      // Usa categoria + pedana normalizzata per evitare collisioni tra pedane diverse
      const pedNorm = pedana.replace(/[^0-9]/g, "").padStart(2, "0"); // "PED. 1" → "01"
      const catNorm = categoria.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8);
      const locationSuffix = `${catNorm}P${pedNorm}`;
      const uniqueCode = `${code}__${locationSuffix}`;

      if (DRY_RUN) {
        const noteStr = notes ? ` [note: ${notes}]` : "";
        console.log(`      [DRY] ${uniqueCode}  qty:${qty} ${unit}  loc:${location}${noteStr}`);
        stats.prodottiCreati++;
        continue;
      }

      // Controlla se esiste già (stesso codice univoco)
      const existing = await Product.findOne({ code: uniqueCode.toUpperCase() });
      if (existing) {
        console.log(`      ↩️  Skip (già presente): ${uniqueCode}`);
        stats.prodottiSkippati++;
        continue;
      }

      try {
        await Product.create({
          name:        rawCode,           // nome = codice originale (leggibile)
          code:        uniqueCode,        // codice univoco con location
          description: subcategoria || "",
          quantity:    qty,
          minQuantity: 0,                 // soglia a 0: l'utente la imposta dopo
          unit:        unit,
          category:    categoryId || null,
          location:    location,
          notes:       notes,
          isActive:    true,
          createdBy:   adminId,
        });
        const noteStr = notes ? ` 📝 ${notes}` : "";
        console.log(`      ✅  ${uniqueCode}  (${qty} ${unit})${noteStr}`);
        stats.prodottiCreati++;
      } catch (err) {
        console.error(`      ❌  Errore su ${uniqueCode}: ${err.message}`);
        stats.errori.push({ code: uniqueCode, error: err.message });
      }
    }
  }

  // ── Riepilogo ─────────────────────────────────────────────────
  console.log("\n" + "─".repeat(50));
  console.log("📊  Riepilogo importazione:");
  console.log(`    Categorie create:    ${stats.categorieCreate}`);
  console.log(`    Categorie esistenti: ${stats.categorieEsistenti}`);
  console.log(`    Prodotti creati:     ${stats.prodottiCreati}`);
  console.log(`    Prodotti skippati:   ${stats.prodottiSkippati}`);
  if (stats.errori.length > 0) {
    console.log(`    ❌  Errori:          ${stats.errori.length}`);
    stats.errori.forEach(e => console.log(`        - ${e.code}: ${e.error}`));
  }
  console.log("─".repeat(50));

  if (!DRY_RUN) {
    await mongoose.connection.close();
    console.log("✅  Connessione chiusa.\n");
  }
}

run().catch(err => {
  console.error("❌  Errore fatale:", err);
  process.exit(1);
});
