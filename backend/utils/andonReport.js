/**
 * utils/andonReport.js — dati del report Andon, usati sia dai grafici della dashboard
 * (GET /api/production/report) sia dall'export Excel (GET /api/production/export):
 * stessi numeri e stesso filtro di periodo nei due posti.
 */
const ProductionEntry = require("../models/ProductionEntry");
const { dateRangeFilter, trendDirection, eachDay } = require("./reportPeriod");

const SUMS = {
  righe:           { $sum: 1 },
  pezzi:           { $sum: "$quantita" },
  attesoMinuti:    { $sum: { $multiply: ["$tempoStdMinuti", "$quantita"] } },
  impiegatoMinuti: { $sum: "$tempoImpiegatoMinuti" },
};

// Efficienza in % (100 = in linea con lo standard, >100 = più veloce): stessa formula di /stats
const efficiency = (r) => (r.impiegatoMinuti > 0 ? Math.round((r.attesoMinuti / r.impiegatoMinuti) * 1000) / 10 : null);
const clean = ({ _id, ...r }) => ({ ...r, efficienza: efficiency(r) });

/**
 * @param scope   filtro reparto/visibilità (da departmentFilter)
 * @param range   risultato di resolvePeriod
 * @param withRows se true include le righe di dettaglio (per l'Excel)
 * @param hideUserId id operatore da mascherare (super-admin invisibile): il suo nome diventa "Altro operatore"
 */
async function buildReport(scope, range, { withRows = false, hideUserId = null } = {}) {
  const match = { ...scope, ...dateRangeFilter(range) };
  const [agg] = await ProductionEntry.aggregate([
    { $match: match },
    { $facet: {
      totale:       [{ $group: { _id: null, ...SUMS } }],
      perOperatore: [{ $group: { _id: "$operatore", nome: { $last: "$operatoreNome" }, ...SUMS } }, { $sort: { nome: 1 } }],
      perTipologia: [{ $group: { _id: "$custodiaLabel", ...SUMS } }, { $sort: { pezzi: -1, _id: 1 } }],
    } },
  ]);

  // Andamento: sull'intervallo del trend (per il giorno sono gli ultimi 7 giorni)
  const perGiorno = await ProductionEntry.aggregate([
    { $match: { ...scope, ...dateRangeFilter(range.trend) } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$data" } }, ...SUMS } },
  ]);
  const byDay = new Map(perGiorno.map((d) => [d._id, d]));
  const andamento = eachDay(range.trend).map((giorno) => {
    const d = byDay.get(giorno);
    return { giorno, pezzi: d?.pezzi || 0, efficienza: d ? efficiency(d) : null };
  });

  // Super-admin invisibile: il suo nome diventa "Altro operatore" (l'id resta solo come riferimento tecnico)
  const HIDDEN = "Altro operatore";
  const perOperatore = agg.perOperatore.map((r) => {
    const c = clean(r);
    if (hideUserId && String(r._id) === String(hideUserId)) c.nome = HIDDEN;
    return c;
  });

  const empty = { righe: 0, pezzi: 0, attesoMinuti: 0, impiegatoMinuti: 0 };
  const report = {
    period: range.period, from: range.from, to: range.to, trendRange: range.trend,
    totale:       clean(agg.totale[0] || { _id: null, ...empty }),
    perOperatore,
    perTipologia: agg.perTipologia.map((r) => ({ tipologia: r._id, ...clean(r) })),
    andamento,
    trend: trendDirection(andamento.map((d) => d.efficienza)),
  };
  if (withRows) {
    report.righe = await ProductionEntry.find(match).sort({ data: 1, operatoreNome: 1 }).lean();
    if (hideUserId) report.righe.forEach((r) => { if (String(r.operatore) === String(hideUserId)) r.operatoreNome = HIDDEN; });
  }
  return report;
}

module.exports = { buildReport };
