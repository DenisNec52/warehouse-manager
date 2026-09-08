/**
 * tests/db.js
 *
 * Helper di connessione al DB per i test di integrazione.
 * - In CI, MONGODB_URI arriva già impostata dal service container Mongo
 *   del workflow (vedi .github/workflows/ci.yml) e viene usata direttamente.
 * - In locale, se MONGODB_URI non è impostata, viene avviato al volo un
 *   MongoDB in memoria con mongodb-memory-server: non serve installare
 *   Mongo né Docker (richiede solo una connessione a internet normale,
 *   la prima volta, per scaricare il piccolo binario di mongod).
 *
 * Usiamo un replica set a 1 nodo (non un mongod standalone) perché
 * routes/movements.js usa transazioni Mongo (mongoose session +
 * startTransaction), supportate solo su replica set: su un mongod
 * "nudo" quei test fallirebbero con un errore del driver.
 *
 * Ogni test file usa la propria istanza/connessione, isolata dalle altre.
 */
const mongoose = require("mongoose");

let memoryServer = null;

async function connect() {
  if (!process.env.MONGODB_URI) {
    const { MongoMemoryReplSet } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = memoryServer.getUri();
  }
  await mongoose.connect(process.env.MONGODB_URI);
}

async function clearCollections() {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map(c => c.deleteMany({})));
}

async function disconnect() {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.connection.close();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

module.exports = { connect, clearCollections, disconnect };
