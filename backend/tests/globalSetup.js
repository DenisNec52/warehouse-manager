/**
 * tests/globalSetup.js
 *
 * Avvia UN replica set in memoria per tutta la suite, fuori dalla sandbox vm di Jest.
 * Creato dentro un test file, il driver interno di mongodb-memory-server genera i
 * metadati di connessione nel contesto vm e mongod li rifiuta
 * ("Missing required sub-document 'driver'"); qui gira nel processo Node normale.
 * Se MONGODB_URI è già impostata (CI con service container), non avvia nulla.
 */
module.exports = async () => {
  if (process.env.MONGODB_URI) return;
  const { MongoMemoryReplSet } = require("mongodb-memory-server");
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  globalThis.__MONGO_REPLSET__ = replSet;
  process.env.MONGODB_URI = replSet.getUri();
};
