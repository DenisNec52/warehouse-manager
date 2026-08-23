/**
 * utils/inventoryImporter.js
 *
 * Logica di import condivisa tra lo script CLI (import_inventory.js)
 * e la route admin POST /api/products/import-legacy — non gestisce
 * la connessione a MongoDB, usa quella già attiva del chiamante.
 *
 * Il codice prodotto viene salvato ESATTAMENTE come scritto sul foglio
 * (es. "1849-1"): la cifra dopo il trattino è la posizione della
 * commessa, non un dettaglio da normalizzare o nascondere. Codici
 * identici possono comparire su più pedane (stock fisicamente
 * separato) — per questo "code" non è univoco a livello DB.
 */
const Category = require("../models/Category");
const Product  = require("../models/Product");

const CATEGORY_META = {
  "FLANGE":               { icon: "🔵", color: "#3b82f6", description: "Flange industriali" },
  "FASCE ATEX":           { icon: "⚠️",  color: "#f59e0b", description: "Fasce per ambienti ATEX" },
  "FASCE LASER":          { icon: "🔴", color: "#ef4444", description: "Fasce per applicazioni laser" },
  "SCATOLE NEMA":         { icon: "📦", color: "#8b5cf6", description: "Scatole standard NEMA" },
  "TAPPI & ESAGONI INOX": { icon: "🔩", color: "#10b981", description: "Tappi ed esagoni in acciaio inox" },
};

// "PED. 1" / "PED. 01" / "PED.4" → 1 / 1 / 4
function parsePallet(pedana) {
  const n = parseInt(pedana.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

async function importInventory(inventory, { adminId = null } = {}) {
  const stats = {
    categorieCreate: 0,
    categorieEsistenti: 0,
    prodottiCreati: 0,
    prodottiSkippati: 0,
    errori: [],
  };

  const categoryNames = [...new Set(inventory.map(g => g.categoria))];
  const categoryMap   = {};

  for (const nome of categoryNames) {
    const meta = CATEGORY_META[nome] || { icon: "📦", color: "#6b7280", description: "" };
    const existing = await Category.findOne({ name: nome });
    if (existing) {
      categoryMap[nome] = existing._id;
      stats.categorieEsistenti++;
    } else {
      const cat = await Category.create({
        name: nome, description: meta.description, color: meta.color, icon: meta.icon, createdBy: adminId,
      });
      categoryMap[nome] = cat._id;
      stats.categorieCreate++;
    }
  }

  for (const gruppo of inventory) {
    const { categoria, pedana, articoli, subcategoria } = gruppo;
    const categoryId = categoryMap[categoria];
    const pallet      = parsePallet(pedana);

    for (const articolo of articoli) {
      const code  = articolo.codice.trim();
      const qty   = Number(articolo.quantita) || 0;
      const unit  = (articolo.unita || "Pz").trim();
      const notes = articolo.note || "";

      // Idempotenza: stesso codice + stessa pedana + stessa categoria = stesso articolo
      const existing = await Product.findOne({
        code: code.toUpperCase(), category: categoryId || null, pallet,
      });
      if (existing) {
        stats.prodottiSkippati++;
        continue;
      }

      try {
        await Product.create({
          name:        code,
          code,
          description: subcategoria || "",
          quantity:    qty,
          minQuantity: 0,
          unit,
          category:    categoryId || null,
          pallet,
          floor:       null,  // sconosciuto dal foglio — da compilare via UI
          notes,
          isActive:    true,
          createdBy:   adminId,
        });
        stats.prodottiCreati++;
      } catch (err) {
        stats.errori.push({ code, error: err.message });
      }
    }
  }

  return stats;
}

// Rimuove i prodotti creati dal vecchio formato di import (codice con
// suffisso "__CATEGORIAPNN"), per permettere un reimport pulito.
async function resetLegacyImport() {
  const { deletedCount } = await Product.deleteMany({ code: /__[A-Z0-9]+P\d+$/ });
  return deletedCount;
}

module.exports = { importInventory, resetLegacyImport };
