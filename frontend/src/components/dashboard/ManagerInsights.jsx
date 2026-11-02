/**
 * components/dashboard/ManagerInsights.jsx
 *
 * Andamento movimenti (14 giorni) + scorte critiche, solo per supervisore/admin.
 * Recuperati dalla vecchia dashboard (rimossi il 10/05 quando la dashboard è diventata
 * operativa per gli operatori); l'endpoint /dashboard/charts era rimasto senza uso.
 * Caricato in lazy: recharts non finisce nel bundle degli operatori.
 */
import { useQuery } from "@tanstack/react-query";
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

// Colori neutri leggibili sia in chiaro sia in scuro (recharts non legge le classi dark:).
const AXIS = { fontSize: 11, fill: "#9aa2b1" };
const TOOLTIP = { fontSize: 12, borderRadius: 10, border: "none", background: "rgba(23,26,35,.94)", color: "#fff" };

export default function ManagerInsights() {
  const { data: charts, isLoading } = useQuery({
    queryKey: ["dashboard-charts", DAYS],
    queryFn:  () => dashboardAPI.charts({ days: DAYS }).then(r => r.data),
  });
  const chartData = buildChartData(charts?.dailyMovements);
  const hasMovements = chartData.some(d => d.IN || d.OUT);

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Movimenti ultimi {DAYS} giorni</h2>
      {isLoading ? (
        <div className="skeleton h-[220px] w-full"/>
      ) : hasMovements ? (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barSize={10}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.25)" vertical={false}/>
            <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={d => `${d.slice(8)}/${d.slice(5, 7)}`}/>
            <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} width={32}/>
            <Tooltip contentStyle={TOOLTIP} labelStyle={{ color: "#cbd0d9" }} cursor={{ fill: "rgba(148,163,184,.12)" }}
              labelFormatter={d => new Date(d).toLocaleDateString("it-IT", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" })}/>
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle"/>
            <Bar dataKey="IN"  fill="#10b981" radius={[4, 4, 0, 0]} name="Entrate"/>
            <Bar dataKey="OUT" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Uscite"/>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400">Nessun movimento negli ultimi {DAYS} giorni</div>
      )}
    </div>
  );
}
