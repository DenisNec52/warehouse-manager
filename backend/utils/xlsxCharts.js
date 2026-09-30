/**
 * utils/xlsxCharts.js — grafici NATIVI di Excel (DrawingML) aggiunti a un .xlsx.
 *
 * exceljs scrive dati e stili ma non i grafici: qui il file prodotto da exceljs viene
 * aperto con jszip e gli si aggiungono le parti di un grafico Excel vero (chart XML,
 * drawing, relazioni, content types). I grafici puntano alle celle del foglio, quindi
 * restano modificabili in Excel e si aggiornano se si cambiano i dati; contengono anche
 * una copia dei valori (cache) per i programmi che non ricalcolano.
 *
 * Definizione di un grafico:
 *   { type: "bar" | "pie" | "line", title, titleColor?,
 *     categories: { ref: "'Foglio'!$A$2:$A$5", values: [...] },
 *     series: [{ name, ref: "'Foglio'!$B$2:$B$5", values: [...], color? }],
 *     trendline?: { color },                // solo "line": retta di tendenza lineare di Excel
 *     anchor: { col, row, width, height } } // in celle, 0-based
 */
const JSZip = require("jszip");

const NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL_CHART = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";
const REL_DRAWING = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const CT_CHART = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
const CT_DRAWING = "application/vnd.openxmlformats-officedocument.drawing+xml";
const PIE_COLORS = ["2563EB", "F59E0B", "10B981", "EF4444", "8B5CF6", "06B6D4", "F97316", "84CC16", "EC4899", "64748B"];

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fill = (color) => `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`;

const strCache = (values) =>
  `<c:strCache><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join("")}</c:strCache>`;
const numCache = (values) =>
  `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values
    .map((v, i) => (v == null ? "" : `<c:pt idx="${i}"><c:v>${Number(v)}</c:v></c:pt>`)).join("")}</c:numCache>`;

const title = (text, color = "1F2937") =>
  `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr>` +
  `<a:r><a:rPr lang="it-IT" sz="1200" b="1">${fill(color)}</a:rPr><a:t>${esc(text)}</a:t></a:r></a:p></c:rich></c:tx>` +
  `<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`;

// Parti comuni di una serie: nome, categorie, valori
const serName = (s) => `<c:tx><c:v>${esc(s.name)}</c:v></c:tx>`;
const serCat = (cat) => `<c:cat><c:strRef><c:f>${esc(cat.ref)}</c:f>${strCache(cat.values)}</c:strRef></c:cat>`;
const serVal = (s) => `<c:val><c:numRef><c:f>${esc(s.ref)}</c:f>${numCache(s.values)}</c:numRef></c:val>`;

const axes = (catId, valId, valFormat = "General") =>
  `<c:catAx><c:axId val="${catId}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/>` +
  `<c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/>` +
  `<c:tickLblPos val="nextTo"/><c:crossAx val="${valId}"/><c:crosses val="autoZero"/><c:auto val="1"/>` +
  `<c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
  `<c:valAx><c:axId val="${valId}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/>` +
  `<c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="${esc(valFormat)}" sourceLinked="0"/>` +
  `<c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>` +
  `<c:crossAx val="${catId}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;

function plotArea(chart) {
  const { type, categories, series } = chart;
  if (type === "bar") {
    const sers = series.map((s, i) =>
      `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${serName(s)}` +
      `<c:spPr>${fill(s.color || PIE_COLORS[i % PIE_COLORS.length])}</c:spPr><c:invertIfNegative val="0"/>` +
      `${serCat(categories)}${serVal(s)}</c:ser>`).join("");
    return `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${sers}` +
      `<c:gapWidth val="80"/><c:axId val="500000001"/><c:axId val="500000002"/></c:barChart>${axes(500000001, 500000002)}`;
  }
  if (type === "pie") {
    const s = series[0];
    const points = categories.values.map((_, i) =>
      `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>${fill(PIE_COLORS[i % PIE_COLORS.length])}</c:spPr></c:dPt>`).join("");
    const labels = `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/>` +
      `<c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls>`;
    return `<c:pieChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>${serName(s)}` +
      `${points}${labels}${serCat(categories)}${serVal(s)}</c:ser><c:firstSliceAng val="0"/></c:pieChart>`;
  }
  // line
  const sers = series.map((s, i) => {
    const color = s.color || PIE_COLORS[i % PIE_COLORS.length];
    const trend = chart.trendline && i === 0
      ? `<c:trendline><c:name>Tendenza</c:name><c:spPr><a:ln w="19050">${fill(chart.trendline.color)}<a:prstDash val="dash"/></a:ln></c:spPr>` +
        `<c:trendlineType val="linear"/><c:dispRSqr val="0"/><c:dispEq val="0"/></c:trendline>`
      : "";
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${serName(s)}` +
      `<c:spPr><a:ln w="28575" cap="rnd">${fill(color)}<a:round/></a:ln></c:spPr>` +
      `<c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr>${fill(color)}</c:spPr></c:marker>` +
      `${trend}${serCat(categories)}${serVal(s)}<c:smooth val="0"/></c:ser>`;
  }).join("");
  return `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}` +
    `<c:marker val="1"/><c:axId val="500000003"/><c:axId val="500000004"/></c:lineChart>${axes(500000003, 500000004, '0"%"')}`;
}

function chartXml(chart) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/>` +
    `<c:chart>${title(chart.title, chart.titleColor)}<c:plotArea><c:layout/>${plotArea(chart)}</c:plotArea>` +
    `<c:legend><c:legendPos val="${chart.type === "pie" ? "r" : "b"}"/><c:overlay val="0"/></c:legend>` +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

function anchorXml(chart, i) {
  const { col, row, width, height } = chart.anchor;
  const pos = (tag, c, r) => `<xdr:${tag}><xdr:col>${c}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:${tag}>`;
  return `<xdr:twoCellAnchor editAs="oneCell">${pos("from", col, row)}${pos("to", col + width, row + height)}` +
    `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Grafico ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
    `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS_C}">` +
    `<c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame>` +
    `<xdr:clientData/></xdr:twoCellAnchor>`;
}

/** Percorso del file XML del foglio con quel nome, letto da workbook.xml e dalle sue relazioni. */
async function sheetPath(zip, sheetName) {
  const wb = await zip.file("xl/workbook.xml").async("string");
  const m = wb.match(new RegExp(`<sheet [^>]*name="${esc(sheetName)}"[^>]*r:id="([^"]+)"`));
  if (!m) throw new Error(`Foglio "${sheetName}" non trovato`);
  const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const t = rels.match(new RegExp(`<Relationship [^>]*Id="${m[1]}"[^>]*Target="([^"]+)"`)) ||
            rels.match(new RegExp(`<Relationship [^>]*Target="([^"]+)"[^>]*Id="${m[1]}"`));
  return "xl/" + t[1].replace(/^\/?xl\//, "");
}

/**
 * Aggiunge i grafici al foglio `sheetName` del file xlsx in `buffer` e restituisce il nuovo buffer.
 * Il foglio non deve avere già un disegno (immagini o grafici) creato da exceljs.
 */
async function addNativeCharts(buffer, sheetName, charts) {
  if (!charts.length) return buffer;
  const zip = await JSZip.loadAsync(buffer);
  const sheetFile = await sheetPath(zip, sheetName);
  const sheetBase = sheetFile.split("/").pop();
  const drawingNo = Object.keys(zip.files).filter((f) => /^xl\/drawings\/drawing\d+\.xml$/.test(f)).length + 1;
  const chartStart = Object.keys(zip.files).filter((f) => /^xl\/charts\/chart\d+\.xml$/.test(f)).length + 1;

  // 1) grafici e disegno che li posiziona sul foglio
  const drawingRels = [];
  charts.forEach((chart, i) => {
    const n = chartStart + i;
    zip.file(`xl/charts/chart${n}.xml`, chartXml(chart));
    drawingRels.push(`<Relationship Id="rId${i + 1}" Type="${REL_CHART}" Target="../charts/chart${n}.xml"/>`);
  });
  zip.file(`xl/drawings/drawing${drawingNo}.xml`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${NS_A}">` +
    charts.map(anchorXml).join("") + `</xdr:wsDr>`);
  zip.file(`xl/drawings/_rels/drawing${drawingNo}.xml.rels`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRels.join("")}</Relationships>`);

  // 2) relazione foglio -> disegno
  const relsPath = `xl/worksheets/_rels/${sheetBase}.rels`;
  let rels = zip.file(relsPath) ? await zip.file(relsPath).async("string")
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  const used = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  const relId = `rId${Math.max(0, ...used) + 1}`;
  rels = rels.replace("</Relationships>", `<Relationship Id="${relId}" Type="${REL_DRAWING}" Target="../drawings/drawing${drawingNo}.xml"/></Relationships>`);
  zip.file(relsPath, rels);

  // 3) <drawing> nel foglio, nella posizione richiesta dallo schema (prima di questi elementi)
  let sheet = await zip.file(sheetFile).async("string");
  if (sheet.includes("<drawing ")) throw new Error(`Il foglio "${sheetName}" ha già un disegno`);
  if (!/<worksheet[^>]*xmlns:r=/.test(sheet)) sheet = sheet.replace("<worksheet ", `<worksheet xmlns:r="${NS_R}" `);
  const tag = `<drawing r:id="${relId}"/>`;
  const before = sheet.match(/<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)[\s>/]/);
  sheet = before ? sheet.replace(before[0], tag + before[0]) : sheet.replace("</worksheet>", `${tag}</worksheet>`);
  zip.file(sheetFile, sheet);

  // 4) content types delle parti nuove
  let types = await zip.file("[Content_Types].xml").async("string");
  const overrides = [`<Override PartName="/xl/drawings/drawing${drawingNo}.xml" ContentType="${CT_DRAWING}"/>`,
    ...charts.map((_, i) => `<Override PartName="/xl/charts/chart${chartStart + i}.xml" ContentType="${CT_CHART}"/>`)];
  types = types.replace("</Types>", overrides.join("") + "</Types>");
  zip.file("[Content_Types].xml", types);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

module.exports = { addNativeCharts };
