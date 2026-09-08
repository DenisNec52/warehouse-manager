const { parseCode } = require("../../utils/codeParser");

// Ogni caso qui è preso direttamente dal commento di documentazione in
// utils/codeParser.js — se il comportamento cambia, va aggiornato anche lì.
describe("parseCode", () => {
  test.each([
    ["1684-2",  { commessa: "1684",   posizione: 2 }],
    ["1684/2",  { commessa: "1684",   posizione: 2 }],
    ["4526",    { commessa: "4526",   posizione: 1 }],
    ["GR100",   { commessa: "GR100",  posizione: 1 }],
    ["3842-?",  { commessa: "3842-?", posizione: 1 }],
  ])("parseCode(%j) => %j", (input, expected) => {
    expect(parseCode(input)).toEqual(expected);
  });

  test("normalizza spazi e maiuscole", () => {
    expect(parseCode("  1684-2  ")).toEqual({ commessa: "1684", posizione: 2 });
    expect(parseCode("gr100")).toEqual({ commessa: "GR100", posizione: 1 });
  });

  test("codici con più trattini prende l'ultimo numero come posizione", () => {
    expect(parseCode("C.O-856-3")).toEqual({ commessa: "C.O-856", posizione: 3 });
  });
});
