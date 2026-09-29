/** tests/globalTeardown.js — ferma il replica set avviato in globalSetup. */
module.exports = async () => {
  if (globalThis.__MONGO_REPLSET__) await globalThis.__MONGO_REPLSET__.stop();
};
