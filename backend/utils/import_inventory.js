/**
 * utils/import_inventory.js
 *
 * Importa l'inventario da warehouse_inventory.json nel database.
 * Usa la logica condivisa in inventoryImporter.js (stessa usata
 * dalla route admin POST /api/products/import-legacy).
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
 */

require("dotenv").config();
const mongoose = require("mongoose");
const path     = require("path");
const fs       = require("fs");
const { importInventory } = require("./inventoryImporter");

async function run() {
  const inventoryPath = path.join(__dirname, "warehouse_inventory.json");

  if (!fs.existsSync(inventoryPath)) {
    console.error(`❌  File non trovato: ${inventoryPath}`);
    console.error(`    Copia warehouse_inventory.json in backend/utils/`);
    process.exit(1);
  }

  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf-8"));

  console.log("\n📦  Warehouse Inventory Import");
  console.log("─".repeat(50));

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅  MongoDB connesso\n");

  const User  = require("../models/User");
  const admin = await User.findOne({ role: "admin" }).lean();
  const adminId = admin?._id || null;

  const stats = await importInventory(inventory, { adminId });

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

  await mongoose.connection.close();
  console.log("✅  Connessione chiusa.\n");
}

run().catch(err => {
  console.error("❌  Errore fatale:", err);
  process.exit(1);
});
