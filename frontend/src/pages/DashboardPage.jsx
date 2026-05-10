/**
 * pages/DashboardPage.jsx
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Package, TrendingDown, ArrowLeftRight, Users, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";
import { dashboardAPI } from "@/lib/api";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useAuthStore } from "@/lib/store";
import { Link } from "react-router-dom";
import clsx from "clsx";

function StatCard({ label, value, icon:Icon, color, sub, trend }) {
  return (
    <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} className="stat-card">
      <div className="stat-card-accent" style={{ background: color }}/>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{label}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">{value ?? "—"}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-[var(--radius-sm)] flex items-center justify-center" style={{ background: color + "20" }}>
          <Icon size={18} style={{ color }}/>
        </div>
      </div>
    </motion.div>
  );
}

function SkeletonCard() {
  return <div className="stat-card"><div className="skeleton h-20 w-full"/></div>;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { data, isLoading } = useQuery({ queryKey:["dashboard"], queryFn: () => dashboardAPI.stats().then(r => r.data) });
  const { data: charts }    = useQuery({ queryKey:["dashboard-charts"], queryFn: () => dashboardAPI.charts({ days:30 }).then(r => r.data) });

  const stats = data?.stats;

  // Prepara dati chart movimenti giornalieri
  const movChartData = (() => {
    if (!charts?.dailyMovements) return [];
    const map = {};
    charts.dailyMovements.forEach(d => {
      const date = d._id.date;
      if (!map[date]) map[date] = { date, IN:0, OUT:0 };
      map[date][d._id.type] = d.qty;
    });
    return Object.values(map).slice(-14);
  })();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Buongiorno, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Ecco un riepilogo del tuo magazzino
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {isLoading ? Array(4).fill(0).map((_,i) => <SkeletonCard key={i}/>) : (
          <>
            <StatCard label="Prodotti totali"   value={stats?.totalProducts}   icon={Package}        color="#3b82f6" sub={`€ ${(stats?.totalValue||0).toLocaleString("it-IT",{minimumFractionDigits:2})} valore`}/>
            <StatCard label="Scorte basse"      value={stats?.lowStockCount}   icon={AlertTriangle}  color="#f59e0b" sub="Sotto la soglia minima"/>
            <StatCard label="Movimenti oggi"    value={stats?.todayMovements}  icon={ArrowLeftRight} color="#10b981" sub="Entrate + uscite"/>
            <StatCard label="Utenti attivi"     value={stats?.totalUsers}      icon={Users}          color="#8b5cf6" sub="Admin e operatori"/>
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Chart movimenti */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Movimenti ultimi 14 giorni</h3>
          {movChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={movChartData} barSize={10}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={.5}/>
                <XAxis dataKey="date" tick={{ fontSize:11 }} tickFormatter={d => d.slice(5)}/>
                <YAxis tick={{ fontSize:11 }}/>
                <Tooltip contentStyle={{ fontSize:12, borderRadius:8, border:"1px solid #e5e7eb" }}/>
                <Bar dataKey="IN"  fill="#10b981" radius={[4,4,0,0]} name="Entrate"/>
                <Bar dataKey="OUT" fill="#ef4444" radius={[4,4,0,0]} name="Uscite"/>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-48 flex items-center justify-center text-sm text-gray-400">Nessun dato disponibile</div>}
        </div>

        {/* Prodotti critici */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Scorte critiche</h3>
            <Link to="/products?lowStock=true" className="text-xs text-[var(--brand-500)] hover:underline">Vedi tutti</Link>
          </div>
          <div className="space-y-3">
            {(data?.criticalProducts || []).map(p => (
              <Link to={`/products/${p._id}`} key={p._id}
                className="flex items-center gap-3 p-2 rounded-[var(--radius-sm)] hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <div className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-sm shrink-0"
                  style={{ background:(p.category?.color||"#3b82f6")+"20", color: p.category?.color||"#3b82f6" }}>
                  {p.category?.icon || "📦"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.code}</p>
                </div>
                <span className="text-sm font-bold text-red-500">{p.quantity}</span>
              </Link>
            ))}
            {!data?.criticalProducts?.length && <p className="text-sm text-gray-400 text-center py-4">✅ Nessuna scorta critica</p>}
          </div>
        </div>
      </div>

      {/* Ultimi movimenti */}
      <div className="card mt-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Movimenti recenti</h3>
          <Link to="/movements" className="text-xs text-[var(--brand-500)] hover:underline">Vedi tutti →</Link>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Prodotto</th><th>Tipo</th><th>Quantità</th><th>Operatore</th><th>Data</th></tr></thead>
            <tbody>
              {(data?.recentMovements||[]).map(m => (
                <tr key={m._id}>
                  <td>
                    <div className="font-medium text-gray-900 dark:text-white">{m.product?.name || m.productSnapshot?.name}</div>
                    <div className="text-xs text-gray-400">{m.product?.code || m.productSnapshot?.code}</div>
                  </td>
                  <td>
                    <span className={clsx("badge", m.type==="IN" ? "badge-green" : "badge-red")}>
                      {m.type==="IN" ? <ArrowDown size={10}/> : <ArrowUp size={10}/>}
                      {m.type==="IN" ? "Entrata" : "Uscita"}
                    </span>
                  </td>
                  <td className="font-semibold tabular-nums">{m.quantity} {m.product?.unit || m.productSnapshot?.unit}</td>
                  <td className="text-gray-500">{m.performedBy?.name || m.performedByName}</td>
                  <td className="text-gray-400 text-xs">{new Date(m.createdAt).toLocaleString("it-IT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.recentMovements?.length && <div className="py-8 text-center text-sm text-gray-400">Nessun movimento registrato</div>}
        </div>
      </div>
    </div>
  );
}
