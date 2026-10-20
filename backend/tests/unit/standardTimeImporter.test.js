const { parseDurationText, cellMinutes } = require("../../utils/standardTimeImporter");

describe("lettura del tempo standard", () => {
  test.each([
    ["1:30", 90], ["0:45", 45], ["1.30", 90], ["1h30", 90], ["2h", 120],
    ["1,5", 90], ["45'", 45], ["45 min", 45], ["1", 60], ["90", 90],
    ["1:75", null], ["abc", null], ["", null],
  ])("%s -> %s", (input, expected) => {
    expect(parseDurationText(input)).toBe(expected);
  });

  test("in una colonna \"Minuti\" i numeri sono minuti", () => {
    expect(parseDurationText("20", { minutesColumn: true })).toBe(20);
    expect(cellMinutes({ value: 20, numFmt: "General" }, { minutesColumn: true })).toBe(20);
  });

  test("celle Excel: ora h:mm, frazione di giorno, formula", () => {
    expect(cellMinutes({ value: new Date(Date.UTC(1899, 11, 30, 1, 0)) })).toBe(60);
    expect(cellMinutes({ value: 0.03125, numFmt: "General" })).toBe(45);
    expect(cellMinutes({ value: 1.25, numFmt: "[h]:mm" })).toBe(1800);
    expect(cellMinutes({ value: { formula: "A1", result: "0:30" } })).toBe(30);
    expect(cellMinutes({ value: null })).toBeNull();
  });
});
