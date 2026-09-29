/**
 * components/dashboard/ManagerInsights.jsx
 *
 * Andamento movimenti (14 giorni) + scorte critiche, solo per supervisore/admin.
 * Recuperati dalla vecchia dashboard (rimossi il 10/05 quando la dashboard è diventata
 * operativa per gli operatori); l'endpoint /dashboard/charts era rimasto senza uso.
 * Caricato in lazy: recharts non finisce nel bundle degli operatori.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { dashboardAPI } from "@/lib/api";

const DAYS = 14;

/** Ultimi DAYS giorni di calendario (anche quelli senza movimenti, a zero). */
function buildChartData(dailyMovements = []) {
  const byDate = {};
  dailyMovements.forEach(d => {
    byDate[d._id.date] ??= { IN: 0, OUT: 0 };
    byDate[d._id.date][d._id.type] = d.qty;
  });
  return Array.from({ length: DAYS }, (_, i) => {
    const day = new Date();
    day.setUTCDate(day.getUTCDate() - (DAYS - 1 - i));
    const date = day.toISOString().slice(0, 10);   // stesso formato UTC del $dateToString lato server
    return { date, IN: byDate[date]?.IN || 0, OUT: byDate[date]?.OUT || 0 };
  });
}

export default function ManagerInsights({ criticalProducts = [] }) {
  const { data: charts, isLoading } = useQuery({
    queryKey: ["dashboard-charts", DAYS],
    queryFn:  () => dashboardAPI.charts({ days: DAYS }).then(r => r.data),
  });
  const chartData = buildChartData(charts?.dailyMovements);
  const hasMovements = chartData.some(d => d.IN || d.OUT);

  return (
    <div className="grid lg:grid-cols-3 gap-4 mt-6">
      <div className="card p-5 lg:col-span-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Movimenti ultimi {DAYS} giorni</h3>
        {isLoading ? (
          <div className="skeleton h-[200px] w-full"/>
        ) : hasMovements ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barSize={10}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={.5}/>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => `${d.slice(8)}/${d.slice(5, 7)}`}/>
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false}/>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                labelFormatter={d => new Date(d).toLocaleDateString("it-IT", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" })}/>
              <Legend wrapperStyle={{ fontSize: 12 }}/>
              <Bar dataKey="IN"  fill="#10b981" radius={[4, 4, 0, 0]} name="Entrate"/>
              <Bar dataKey="OUT" fill="#ef4444" radius={[4, 4, 0, 0]} name="Uscite"/>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-48 flex items-center justify-center text-sm text-gray-400">Nessun movimento negli ultimi {DAYS} giorni</div>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Scorte critiche</h3>
          <Link to="/products?lowStock=true" className="text-xs text-[var(--brand-500)] hover:underline">Vedi tutti</Link>
        </div>
        <div className="space-y-3">
          {criticalProducts.map(p => (
            <Link to={`/products/${p._id}`} key={p._id}
              className="flex items-center gap-3 p-2 rounded-[var(--radius-sm)] hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
              <div className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-sm shrink-0"
                style={{ background: (p.category?.color || "#3b82f6") + "20", color: p.category?.color || "#3b82f6" }}>
                {p.category?.icon || "📦"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                <p className="text-xs text-gray-400">{p.code}</p>
              </div>
              <span className="text-sm font-bold text-red-500 tabular-nums">{p.quantity}<span className="text-xs text-gray-400 font-normal">/{p.minQuantity}</span></span>
            </Link>
          ))}
          {!criticalProducts.length && <p className="text-sm text-gray-400 text-center py-4">✅ Nessuna scorta critica</p>}
        </div>
      </div>
    </div>
  );
}
