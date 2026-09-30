/**
 * utils/andonExcel.js — file Excel del report Andon.
 *
 * Foglio "Riepilogo": totali, tabelle per operatore / per tipologia / andamento e,
 * se richiesti, i tre grafici nativi (barre, torta, linea con tendenza) che leggono
 * quelle tabelle. Foglio "Dati": tutte le righe del periodo, filtrabili.
 */
const ExcelJS = require("exceljs");
const { addNativeCharts } = require("./xlsxCharts");

const PERIOD_LABEL = { giorno: "giornaliero", settimana: "settimanale", mese: "mensile" };
const TREND = {
  rialzo:  { label: "▲ In rialzo",  color: "16A34A" },
  ribasso: { label: "▼ In ribasso", color: "DC2626" },
  stabile: { label: "▶ Stabile",    color: "6B7280" },
};
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
const itDate = (iso) => iso.split("-").reverse().join("/");
const hours = (min) => Math.round((min / 60) * 100) / 100;
const SHEET = "Riepilogo";
const ref = (col, from, to) => `'${SHEET}'!$${col}$${from}:$${col}$${to}`;

function headerRow(ws, rowNo, labels) {
  const row = ws.getRow(rowNo);
  labels.forEach((l, i) => {
    const c = row.getCell(i + 1);
    c.value = l;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = HEADER_FILL;
    c.alignment = { vertical: "middle" };
  });
}
const sectionTitle = (ws, rowNo, text) => { const c = ws.getCell(`A${rowNo}`); c.value = text; c.font = { bold: true, size: 12 }; };

/**
 * @param report  risultato di buildReport(..., { withRows: true })
 * @param departmentLabel nome del reparto (o "Tutti i reparti visibili")
 * @param withCharts se true aggiunge i grafici nativi
 * @returns Buffer del file .xlsx
 */
async function buildAndonWorkbook(report, departmentLabel, withCharts) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Warehouse Pro";
  wb.created = new Date();
  const ws = wb.addWorksheet(SHEET, { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 26 }, { width: 12 }, { width: 13 }, { width: 15 }, { width: 13 }];

  // ── Intestazione e totali ──
  ws.getCell("A1").value = `Andon Board — ${departmentLabel}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = `Periodo ${PERIOD_LABEL[report.period]}: ${itDate(report.from)}${report.from !== report.to ? " – " + itDate(report.to) : ""}`;
  ws.getCell("A3").value = `Generato il ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })}`;
  ws.getCell("A3").font = { color: { argb: "FF6B7280" } };

  headerRow(ws, 5, ["Totale", "Pezzi", "Ore attese", "Ore impiegate", "Efficienza"]);
  const t = report.totale;
  ws.getRow(6).values = [`${t.righe} righe`, t.pezzi, hours(t.attesoMinuti), hours(t.impiegatoMinuti), t.efficienza];

  // ── Per operatore ──
  let r = 8;
  sectionTitle(ws, r, "Per operatore");
  headerRow(ws, r + 1, ["Operatore", "Pezzi", "Ore attese", "Ore impiegate", "Efficienza"]);
  const opFirst = r + 2;
  report.perOperatore.forEach((o, i) => {
    ws.getRow(opFirst + i).values = [o.nome, o.pezzi, hours(o.attesoMinuti), hours(o.impiegatoMinuti), o.efficienza];
  });
  const opLast = opFirst + Math.max(report.perOperatore.length, 1) - 1;
  if (!report.perOperatore.length) ws.getCell(`A${opFirst}`).value = "Nessuna riga nel periodo";

  // ── Per tipologia ──
  r = opLast + 2;
  sectionTitle(ws, r, "Per tipologia di custodia");
  headerRow(ws, r + 1, ["Tipologia", "Pezzi", "Righe"]);
  const tyFirst = r + 2;
  report.perTipologia.forEach((ty, i) => { ws.getRow(tyFirst + i).values = [ty.tipologia, ty.pezzi, ty.righe]; });
  const tyLast = tyFirst + Math.max(report.perTipologia.length, 1) - 1;
  if (!report.perTipologia.length) ws.getCell(`A${tyFirst}`).value = "Nessuna riga nel periodo";

  // ── Andamento ──
  r = tyLast + 2;
  sectionTitle(ws, r, `Andamento efficienza (${itDate(report.trendRange.from)} – ${itDate(report.trendRange.to)})`);
  headerRow(ws, r + 1, ["Giorno", "Efficienza", "Pezzi"]);
  const trFirst = r + 2;
  report.andamento.forEach((d, i) => {
    ws.getRow(trFirst + i).values = [itDate(d.giorno).slice(0, 5), d.efficienza ?? null, d.pezzi];
  });
  const trLast = trFirst + report.andamento.length - 1;
  const trend = TREND[report.trend.direction];
  const trendCell = ws.getCell(`A${trLast + 2}`);
  trendCell.value = `Tendenza: ${trend.label}${report.trend.direction !== "stabile" ? ` (${report.trend.slope > 0 ? "+" : ""}${report.trend.slope} punti % al giorno)` : ""}`;
  trendCell.font = { bold: true, color: { argb: "FF" + trend.color } };

  // Formati numerici
  for (const row of [6, ...Array.from({ length: opLast - opFirst + 1 }, (_, i) => opFirst + i)]) {
    ws.getCell(`C${row}`).numFmt = "0.00";   // ore
    ws.getCell(`D${row}`).numFmt = "0.00";
    ws.getCell(`E${row}`).numFmt = '0.0"%"'; // efficienza
  }
  for (let row = trFirst; row <= trLast; row++) { ws.getCell(`B${row}`).numFmt = '0.0"%"'; ws.getCell(`C${row}`).numFmt = "0"; }

  // ── Foglio Dati ──
  const data = wb.addWorksheet("Dati", { views: [{ state: "frozen", ySplit: 1 }] });
  data.columns = [
    { header: "Data", key: "data", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Reparto", key: "reparto", width: 18 },
    { header: "Operatore", key: "operatore", width: 22 },
    { header: "Commessa", key: "commessa", width: 12 },
    { header: "Posizione", key: "posizione", width: 10 },
    { header: "Tipologia", key: "tipologia", width: 26 },
    { header: "Pezzi", key: "pezzi", width: 8 },
    { header: "Tempo std/pezzo (h)", key: "std", width: 18, style: { numFmt: "0.00" } },
    { header: "Tempo atteso (h)", key: "atteso", width: 16, style: { numFmt: "0.00" } },
    { header: "Tempo impiegato (h)", key: "impiegato", width: 18, style: { numFmt: "0.00" } },
    { header: "Efficienza", key: "efficienza", width: 11, style: { numFmt: '0.0"%"' } },
    { header: "Data fine", key: "dataFine", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Sospesa", key: "sospesa", width: 9 },
    { header: "Bindello", key: "bindello", width: 9 },
    { header: "Note", key: "note", width: 30 },
  ];
  for (const e of report.righe || []) {
    const atteso = e.tempoStdMinuti * e.quantita;
    data.addRow({
      data: e.data, reparto: e.departmentName, operatore: e.operatoreNome, commessa: e.commessa, posizione: e.posizione,
      tipologia: e.custodiaLabel, pezzi: e.quantita, std: hours(e.tempoStdMinuti), atteso: hours(atteso),
      impiegato: hours(e.tempoImpiegatoMinuti), efficienza: Math.round((atteso / e.tempoImpiegatoMinuti) * 1000) / 10,
      dataFine: e.dataFine || null, sospesa: e.sospesa ? "Sì" : "", bindello: e.bindello ? "Sì" : "", note: e.note,
    });
  }
  data.getRow(1).eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = HEADER_FILL; });
  data.autoFilter = { from: "A1", to: "O1" };

  let buffer = await wb.xlsx.writeBuffer();
  if (!withCharts) return Buffer.from(buffer);

  // ── Grafici nativi sul Riepilogo (a destra delle tabelle) ──
  const ops = report.perOperatore, types = report.perTipologia;
  const charts = [];
  if (ops.length) charts.push({
    type: "bar", title: "Ore attese e impiegate per operatore",
    categories: { ref: ref("A", opFirst, opLast), values: ops.map((o) => o.nome) },
    series: [
      { name: "Ore attese", ref: ref("C", opFirst, opLast), values: ops.map((o) => hours(o.attesoMinuti)), color: "2563EB" },
      { name: "Ore impiegate", ref: ref("D", opFirst, opLast), values: ops.map((o) => hours(o.impiegatoMinuti)), color: "F59E0B" },
    ],
  });
  if (types.length) charts.push({
    type: "pie", title: "Pezzi per tipologia",
    categories: { ref: ref("A", tyFirst, tyLast), values: types.map((x) => x.tipologia) },
    series: [{ name: "Pezzi", ref: ref("B", tyFirst, tyLast), values: types.map((x) => x.pezzi) }],
  });
  charts.push({
    type: "line", title: `Andamento efficienza — ${trend.label}`, titleColor: trend.color,
    categories: { ref: ref("A", trFirst, trLast), values: report.andamento.map((d) => itDate(d.giorno).slice(0, 5)) },
    series: [{ name: "Efficienza %", ref: ref("B", trFirst, trLast), values: report.andamento.map((d) => d.efficienza), color: trend.color }],
    trendline: { color: trend.color },
  });
  charts.forEach((c, i) => { c.anchor = { col: 6, row: 1 + i * 18, width: 9, height: 17 }; });

  buffer = await addNativeCharts(Buffer.from(buffer), SHEET, charts);
  return buffer;
}

module.exports = { buildAndonWorkbook };
