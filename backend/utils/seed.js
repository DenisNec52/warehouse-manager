/**
 * utils/seed.js
 *
 * Popola il DB con admin + categorie e prodotti di esempio.
 * Non cancella dati esistenti — salta se già presenti.
 * Uso: npm run seed
 */
require("dotenv").config();
const mongoose     = require("mongoose");
const User         = require("../models/User");
const Category     = require("../models/Category");
const Product      = require("../models/Product");
const Notification = require("../models/Notification");

const CATEGORIES = [
  { name:"Bulloneria",    icon:"🔩", color:"#3b82f6", description:"Viti, bulloni, dadi, rondelle" },
  { name:"Elettrico",     icon:"⚡", color:"#f59e0b", description:"Componenti elettrici e cavi" },
  { name:"Utensileria",   icon:"🔧", color:"#10b981", description:"Utensili e attrezzi da lavoro" },
  { name:"Sicurezza",     icon:"🦺", color:"#ef4444", description:"DPI e dispositivi di sicurezza" },
  { name:"Chimici",       icon:"🧪", color:"#8b5cf6", description:"Lubrificanti, solventi, vernici" },
  { name:"Consumabili",   icon:"📦", color:"#06b6d4", description:"Materiali di consumo generico" },
];

const PRODUCTS = [
  { name:"Bulloni M8 x 25mm",  code:"BUL-M8-025",  quantity:450, minQuantity:100, unit:"pz",  location:"A1-S1", categoryIdx:0, supplier:"Ferramenta Rossi", unitPrice:0.15 },
  { name:"Viti M6 x 16mm",     code:"VIT-M6-016",  quantity:820, minQuantity:200, unit:"pz",  location:"A1-S2", categoryIdx:0, supplier:"Ferramenta Rossi", unitPrice:0.08 },
  { name:"Rondelle piatte M8",  code:"RON-M8-PIA",  quantity:12,  minQuantity:50,  unit:"pz",  location:"A1-S3", categoryIdx:0, supplier:"Ferramenta Rossi", unitPrice:0.05 },
  { name:"Cavo elettrico 2.5mm",code:"CAV-EL-2P5",  quantity:180, minQuantity:50,  unit:"m",   location:"B2-S1", categoryIdx:1, supplier:"Elettro SRL",     unitPrice:1.20 },
  { name:"Interruttore diff.",  code:"INT-DIF-32A",  quantity:8,   minQuantity:5,   unit:"pz",  location:"B2-S2", categoryIdx:1, supplier:"Elettro SRL",     unitPrice:28.50 },
  { name:"Chiave a brugola 8mm",code:"CHI-BRU-8MM",  quantity:15,  minQuantity:10,  unit:"pz",  location:"C1-S1", categoryIdx:2, supplier:"Tools & Co",      unitPrice:4.90 },
  { name:"Casco di sicurezza",  code:"DPI-CAS-YEL",  quantity:6,   minQuantity:10,  unit:"pz",  location:"D1-S1", categoryIdx:3, supplier:"Safety First",    unitPrice:18.00 },
  { name:"Guanti antitaglio L", code:"DPI-GUA-ANT",  quantity:24,  minQuantity:20,  unit:"pz",  location:"D1-S2", categoryIdx:3, supplier:"Safety First",    unitPrice:7.50 },
  { name:"Grasso lubrificante", code:"CHI-GRA-500",  quantity:5,   minQuantity:8,   unit:"kg",  location:"E1-S1", categoryIdx:4, supplier:"Chimica Pro",     unitPrice:12.00 },
  { name:"Nastro isolante nero",code:"ELE-NAS-ISO",  quantity:38,  minQuantity:15,  unit:"pz",  location:"B3-S1", categoryIdx:5, supplier:"Elettro SRL",     unitPrice:1.80 },
];

async function seed() {
  console.log("🌱  Avvio seed...");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅  MongoDB connesso");

  // ── Admin ─────────────────────────────────────────────────
  let admin = await User.findOne({ username: process.env.SEED_ADMIN_USERNAME || "admin" });
  if (!admin) {
    admin = await User.create({
      username: process.env.SEED_ADMIN_USERNAME || "admin",
      password: process.env.SEED_ADMIN_PASSWORD || "Admin123!",
      name:     process.env.SEED_ADMIN_NAME     || "Amministratore",
      role:     "admin",
    });
    console.log(`👤  Admin creato: ${admin.username}`);
  } else {
    console.log("👤  Admin già presente — skip");
  }

  // ── Operatore di esempio ──────────────────────────────────
  const opExists = await User.findOne({ username: "operatore" });
  if (!opExists) {
    await User.create({ username:"operatore", password:"Op123!", name:"Mario Rossi", role:"operatore" });
    console.log("👤  Operatore di esempio creato: operatore / Op123!");
  }

  // ── Categorie ─────────────────────────────────────────────
  const catDocs = [];
  for (const cat of CATEGORIES) {
    const existing = await Category.findOne({ name: cat.name });
    if (!existing) {
      const created = await Category.create({ ...cat, createdBy: admin._id });
      catDocs.push(created);
      console.log(`📂  Categoria: ${cat.icon} ${cat.name}`);
    } else {
      catDocs.push(existing);
    }
  }

  // ── Prodotti ──────────────────────────────────────────────
  for (const p of PRODUCTS) {
    const exists = await Product.findOne({ code: p.code });
    if (!exists) {
      await Product.create({
        ...p,
        category:  catDocs[p.categoryIdx]._id,
        createdBy: admin._id,
      });
      console.log(`📦  Prodotto: ${p.code} — ${p.name}`);
    }
  }

  // ── Notifica di benvenuto ─────────────────────────────────
  const notifExists = await Notification.findOne({ type: "system", title: "Benvenuto" });
  if (!notifExists) {
    await Notification.create({
      type:    "system",
      title:   "Benvenuto in Warehouse Pro",
      message: "Il sistema è pronto. Inizia ad aggiungere i tuoi prodotti.",
      userId:  admin._id,
    });
  }

  console.log("\n✅  Seed completato!");
  console.log("─".repeat(50));
  console.log(`  admin     → ${process.env.SEED_ADMIN_PASSWORD || "Admin123!"}`);
  console.log("  operatore → Op123!");
  console.log("─".repeat(50));

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => { console.error("❌", err); process.exit(1); });
