/**
 * SEED SCRIPT
 * Popola il DB con 3 utenti demo + reparti di default.
 * Uso: npm run seed
 * ⚠️  Cancella tutto prima di inserire.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const User     = require("./models/User");
const Category = require("./models/Category");
const Movement = require("./models/Movement");

const USERS = [
  { username:"admin",        password:"Admin123!",  name:"Admin",          role:"Amministratore" },
  { username:"magazziniere", password:"Mag123!",    name:"Marco Rossi",    role:"Magazziniere"   },
  { username:"operatore",    password:"Op123!",     name:"Giulia Ferrari", role:"Operatore"      },
];

const CATS = ["Prima Saldatura","Seconda Saldatura","Ponticellatura"];

async function seed() {
  console.log("🌱 Avvio seed...");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ MongoDB connesso");

  await User.deleteMany({});
  await Category.deleteMany({});
  await Movement.deleteMany({});
  console.log("🗑️  DB svuotato");

  const users = await User.create(USERS);   // bcrypt via pre-save hook
  console.log(`👤 ${users.length} utenti creati`);

  await Category.insertMany(CATS.map(name => ({ name, createdBy:"seed" })));
  console.log(`📂 ${CATS.length} reparti creati`);

  const [admin, marco, giulia] = users;
  const now = Date.now();
  await Movement.collection.insertMany([
    { code:"ART-001", description:"Bulloni M8 x 25mm",  qty:200,  type:"IN",  category:"Prima Saldatura",   note:"Arrivo fornitore A", userId:admin._id,  userName:admin.name,  userRole:admin.role,  createdAt:new Date(now-86400000*3), updatedAt:new Date(now-86400000*3) },
    { code:"ART-002", description:"Viti M6 x 16mm",     qty:500,  type:"IN",  category:"Ponticellatura",    note:"",                   userId:marco._id,  userName:marco.name,  userRole:marco.role,  createdAt:new Date(now-86400000*2), updatedAt:new Date(now-86400000*2) },
    { code:"ART-001", description:"Bulloni M8 x 25mm",  qty:50,   type:"OUT", category:"Prima Saldatura",   note:"Ordine #445",        userId:marco._id,  userName:marco.name,  userRole:marco.role,  createdAt:new Date(now-86400000*1), updatedAt:new Date(now-86400000*1) },
    { code:"ART-003", description:"Rondelle piatte",     qty:1000, type:"IN",  category:"Seconda Saldatura", note:"",                   userId:giulia._id, userName:giulia.name, userRole:giulia.role, createdAt:new Date(now-3600000*5),  updatedAt:new Date(now-3600000*5)  },
    { code:"ART-002", description:"Viti M6 x 16mm",     qty:120,  type:"OUT", category:"Ponticellatura",    note:"Ordine #448",        userId:giulia._id, userName:giulia.name, userRole:giulia.role, createdAt:new Date(now-3600000*2),  updatedAt:new Date(now-3600000*2)  },
  ]);
  console.log("📦 Movimenti di esempio creati");

  console.log("\n✅ Seed completato!");
  console.log("─".repeat(50));
  USERS.forEach(u => console.log(`  ${u.username.padEnd(14)} → ${u.password}  [${u.role}]`));
  console.log("─".repeat(50));

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => { console.error("❌", err); process.exit(1); });
