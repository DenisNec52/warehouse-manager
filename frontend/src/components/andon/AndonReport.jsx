/**
 * components/andon/AndonReport.jsx
 *
 * Report dell'Andon Board per giorno / settimana / mese: tre grafici (ore per operatore,
 * pezzi per tipologia, andamento dell'efficienza con trend) e download Excel.
 * Grafici ed Excel usano lo stesso endpoint e lo stesso filtro (GET /production/report
 * e /production/export con period + date): i numeri coincidono sempre.
 * Caricato in lazy dalla pagina: recharts non pesa sul resto dell'app.
 */
import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, Minus, Download, X } from "lucide-react";
import { m as motion } from "framer-motion";
import toast from "react-hot-toast";
import clsx from "clsx";
import { productionAPI } from "@/lib/api";
import { toIsoDay } from "@/lib/duration";

export const PERIODS = [["giorno", "Giornaliero"], ["settimana", "Settimanale"], ["mese", "Mensile"]];
const COLORS = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16"];
const TREND = {
  rialzo:  { Icon: TrendingUp,   text: "In rialzo",  color: "#16a34a", cls: "text-green-600 bg-green-50 dark:bg-green-900/20" },
  ribasso: { Icon: TrendingDown, text: "In ribasso", color: "#dc2626", cls: "text-red-600 bg-red-50 dark:bg-red-900/20" },
  stabile: { Icon: Minus,        text: "Stabile",    color: "#6b7280", cls: "text-gray-500 bg-gray-100 dark:bg-gray-800" },
};
const itDay = (iso) => iso.split("-").reverse().join("/");
const dayMonth = (iso) => itDay(iso).slice(0, 5);
const hours = (min) => Math.round((min / 60) * 10) / 10;
const tooltipStyle = { fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" };

// Percentuale dentro la fetta (in bianco): fuori dalla torta finirebbe tagliata sui telefoni
const RAD = Math.PI / 180;
function pieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.05) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.6;
  return (
    <text x={cx + r * Math.cos(-midAngle * RAD)} y={cy + r * Math.sin(-midAngle * RAD)} fill="#fff"
      textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {Math.round(percent * 100)}%
    </text>
  );
}

/** Selettore periodo condiviso tra report e modale di download */
function PeriodPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PERIODS.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange({ ...value, period: v })}
          className={clsx("btn btn-md", value.period === v ? "btn-primary" : "btn-secondary")}>{l}</button>
      ))}
      <input type="date" className="form-input py-1.5 w-auto" value={value.date} aria-label="Data di riferimento"
        onChange={(e) => e.target.value && onChange({ ...value, date: e.target.value })}/>
    </div>
  );
}

export default function AndonReport({ departmentId, departmentName }) {
  const [filter, setFilter] = useState({ period: "settimana", date: toIsoDay(new Date()) });
  const [exporting, setExporting] = useState(false);

  const { data, isPending, isError } = useQuery({
    queryKey: ["production", "report", filter.period, filter.date, departmentId],
    queryFn: () => productionAPI.report({ ...filter, department: departmentId }).then((r) => r.data),
    enabled: !!departmentId,
    placeholderData: keepPreviousData,   // cambiando periodo i grafici restano finché arrivano i nuovi dati
  });

  const trend = TREND[data?.trend?.direction || "stabile"];
  const ops = (data?.perOperatore || []).map((o) => ({ nome: o.nome, attese: hours(o.attesoMinuti), impiegate: hours(o.impiegatoMinuti) }));

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">Report e grafici</h2>
          {data && (
            <p className="text-xs text-gray-500 mt-0.5">
              {data.from === data.to ? itDay(data.from) : `${itDay(data.from)} – ${itDay(data.to)}`} · {data.totale.pezzi} pezzi
              {data.totale.efficienza != null && ` · efficienza ${data.totale.efficienza}%`}
            </p>
          )}
        </div>
        <button className="btn btn-md btn-secondary gap-2" onClick={() => setExporting(true)} disabled={!departmentId}>
          <Download size={15}/> Scarica Excel
        </button>
      </div>

      <PeriodPicker value={filter} onChange={setFilter}/>

      <div className="mt-4">
        {isError ? (
          <p className="text-sm text-red-600 py-8 text-center">Impossibile caricare il report.</p>
        ) : isPending ? (
          <p className="text-sm text-gray-400 py-8 text-center">Caricamento…</p>
        ) : !data.perOperatore.length ? (
          <p className="text-sm text-gray-400 py-8 text-center">Nessuna riga nel periodo.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <section>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Ore attese e impiegate per operatore</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={ops}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5}/>
                  <XAxis dataKey="nome" tick={{ fontSize: 11 }} interval={0}/>
                  <YAxis tick={{ fontSize: 11 }} width={32}/>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v} h`}/>
                  <Legend wrapperStyle={{ fontSize: 12 }}/>
                  <Bar dataKey="attese" name="Ore attese" fill="#2563eb" radius={[4, 4, 0, 0]}/>
                  <Bar dataKey="impiegate" name="Ore impiegate" fill="#f59e0b" radius={[4, 4, 0, 0]}/>
                </BarChart>
              </ResponsiveContainer>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Pezzi per tipologia</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={data.perTipologia} dataKey="pezzi" nameKey="tipologia" outerRadius={75}
                    label={pieLabel} labelLine={false}>
                    {data.perTipologia.map((t, i) => <Cell key={t.tipologia} fill={COLORS[i % COLORS.length]}/>)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v} pezzi`}/>
                  <Legend wrapperStyle={{ fontSize: 12 }}/>
                </PieChart>
              </ResponsiveContainer>
            </section>

            <section>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Andamento efficienza</h3>
                <span className={clsx("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full", trend.cls)}>
                  <trend.Icon size={13}/> {trend.text}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.andamento}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5}/>
                  <XAxis dataKey="giorno" tickFormatter={dayMonth} tick={{ fontSize: 11 }}/>
                  <YAxis tick={{ fontSize: 11 }} width={40} unit="%" domain={["auto", "auto"]}/>
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={itDay} formatter={(v) => [`${v}%`, "Efficienza"]}/>
                  <Line type="monotone" dataKey="efficienza" name="Efficienza" stroke={trend.color} strokeWidth={2.5}
                    dot={{ r: 3, fill: trend.color }} connectNulls/>
                </LineChart>
              </ResponsiveContainer>
              {filter.period === "giorno" && <p className="text-xs text-gray-400">Ultimi 7 giorni fino alla data scelta</p>}
            </section>
          </div>
        )}
      </div>

      {exporting && (
        <ExportModal initial={filter} departmentId={departmentId} departmentName={departmentName} onClose={() => setExporting(false)}/>
      )}
    </div>
  );
}

/** Modale di download: periodo (precompilato con quello del report) e contenuto del file */
function ExportModal({ initial, departmentId, departmentName, onClose }) {
  const [filter, setFilter] = useState(initial);
  const [withCharts, setWithCharts] = useState(true);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const res = await productionAPI.exportExcel({ ...filter, department: departmentId, charts: withCharts ? 1 : 0 });
      const name = res.headers["content-disposition"]?.match(/filename="([^"]+)"/)?.[1] || "andon.xlsx";
      const url = URL.createObjectURL(res.data);
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Excel scaricato");
      onClose();
    } catch {
      toast.error("Impossibile generare l'Excel");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }}
        role="dialog" aria-modal="true" aria-labelledby="export-title"
        className="relative z-10 w-full max-w-md bg-white dark:bg-gray-900 rounded-[var(--radius-lg)] shadow-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 id="export-title" className="font-semibold text-gray-900 dark:text-white">Scarica Excel</h2>
          <button className="btn btn-ghost btn-sm p-1.5" onClick={onClose} aria-label="Chiudi"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-5">
          {departmentName && <p className="text-xs text-gray-500">Reparto: {departmentName}</p>}
          <div>
            <p className="form-label">Periodo</p>
            <PeriodPicker value={filter} onChange={setFilter}/>
          </div>
          <fieldset>
            <legend className="form-label">Contenuto del file</legend>
            <div className="grid gap-2">
              {[[false, "Solo dati", "Riepilogo e tabella con tutte le righe"], [true, "Dati + grafici", "In più barre, torta e andamento come grafici di Excel"]].map(([v, l, d]) => (
                <label key={l} className={clsx("flex gap-3 p-3 rounded-[var(--radius)] border cursor-pointer",
                  withCharts === v ? "border-[var(--brand-500)] bg-[var(--brand-50)] dark:bg-[var(--brand-500)]/15" : "border-gray-200 dark:border-gray-700")}>
                  <input type="radio" name="contenuto" className="mt-1 accent-[var(--brand-500)]" checked={withCharts === v} onChange={() => setWithCharts(v)}/>
                  <span>
                    <span className="block text-sm font-medium text-gray-900 dark:text-white">{l}</span>
                    <span className="block text-xs text-gray-500">{d}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-3">
            <button className="btn btn-md btn-secondary flex-1" onClick={onClose}>Annulla</button>
            <button className="btn btn-md btn-primary flex-1 gap-2" onClick={download} disabled={busy}>
              <Download size={15}/> {busy ? "Preparazione…" : "Scarica"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
