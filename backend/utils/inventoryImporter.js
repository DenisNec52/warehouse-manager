/**
 * utils/inventoryImporter.js
 *
 * Logica di import condivisa tra lo script CLI (import_inventory.js)
 * e la route admin POST /api/products/import-legacy — non gestisce
 * la connessione a MongoDB, usa quella già attiva del chiamante.
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

function sanitizeCode(raw) {
  return raw.trim().toUpperCase();
}

function buildLocation(categoria, pedana) {
  const ped = pedana.replace(/\s+/g, "").toUpperCase();
  return `${categoria} / ${ped}`;
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
    const location   = buildLocation(categoria, pedana);
    const categoryId = categoryMap[categoria];

    for (const articolo of articoli) {
      const code  = sanitizeCode(articolo.codice);
      const qty   = Number(articolo.quantita) || 0;
      const unit  = (articolo.unita || "Pz").trim();
      const notes = articolo.note || "";

      const pedNorm = pedana.replace(/[^0-9]/g, "").padStart(2, "0");
      const catNorm = categoria.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8);
      const uniqueCode = `${code}__${catNorm}P${pedNorm}`;

      const existing = await Product.findOne({ code: uniqueCode.toUpperCase() });
      if (existing) {
        stats.prodottiSkippati++;
        continue;
      }

      try {
        await Product.create({
          name:        articolo.codice,
          code:        uniqueCode,
          description: subcategoria || "",
          quantity:    qty,
          minQuantity: 0,
          unit,
          category:    categoryId || null,
          location,
          notes,
          isActive:    true,
          createdBy:   adminId,
        });
        stats.prodottiCreati++;
      } catch (err) {
        stats.errori.push({ code: uniqueCode, error: err.message });
      }
    }
  }

  return stats;
}

module.exports = { importInventory };
