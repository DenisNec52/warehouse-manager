/**
 * utils/codeParser.js
 *
 * Scompone un codice prodotto in commessa + posizione.
 *   "1684-2"  -> { commessa: "1684", posizione: 2 }
 *   "1684/2"  -> { commessa: "1684", posizione: 2 }
 *   "4526"    -> { commessa: "4526", posizione: 1 }   ← nessuna posizione esplicita = /1
 *   "GR100"   -> { commessa: "GR100", posizione: 1 }
 *   "3842-?"  -> { commessa: "3842-?", posizione: 1 } ← suffisso non numerico, non è una posizione
 */
function parseCode(rawCode) {
  const code = rawCode.trim().toUpperCase();
  const match = code.match(/^(.+?)[-/](\d+)$/);
  if (match) {
    return { commessa: match[1], posizione: parseInt(match[2], 10) };
  }
  return { commessa: code, posizione: 1 };
}

module.exports = { parseCode };
