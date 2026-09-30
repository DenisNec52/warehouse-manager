/**
 * pages/HomePage.jsx — Pannello rapido con live stats
 */
import { useNavigate } from "react-router-dom";
import { m as motion } from "framer-motion";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { dashboardAPI, checklistAPI, productionAPI } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { movementInfo, fmtTime } from "@/lib/format";
import { toIsoDay, efficiencyBadge } from "@/lib/duration";
import clsx from "clsx";

function QuickTiles({ tiles }) {
  const nav = useNavigate();
  return (
    <div className="grid sm:grid-cols-2 gap-4 mb-6">
      {tiles.map((tile, i) => (
        <motion.button key={tile.to} initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay: .05 * (i + 1) }}
          onClick={() => nav(tile.to)}
          className="card p-5 text-left hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group cursor-pointer">
          <div className="flex items-start justify-between mb-3">
            <div className={`w-11 h-11 rounded-[var(--radius)] ${tile.iconBg} flex items-center justify-center text-2xl group-hover:scale-110 transition-transform`}>
              {tile.emoji}
            </div>
            <ArrowRight size={16} className={`text-gray-300 ${tile.hoverText} group-hover:translate-x-0.5 transition-all mt-1`}/>
          </div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">{tile.title}</h2>
          <p className="text-xs text-gray-500 leading-relaxed">{tile.desc}</p>
          {tile.info && <p className={`text-xs font-semibold mt-2 ${tile.infoClass}`}>{tile.info}</p>}
        </motion.button>
      ))}
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuthStore();
  const nav = useNavigate();
  const isAdmin = user?.role === "admin";

  const { data: dash } = useQuery({
    queryKey: ["dashboard"],
    queryFn:  () => dashboardAPI.stats().then(r => r.data),
  });

  const { data: myToday } = useQuery({
    queryKey: ["checklist-my-today"],
    queryFn:  () => checklistAPI.myToday().then(r => r.data.submissions),
  });

  const today = toIsoDay(new Date());
  const { data: andonToday } = useQuery({
    queryKey: ["production", "stats", { from: today, to: today }],
    queryFn:  () => productionAPI.stats({ from: today, to: today }).then(r => r.data.totale),
  });

  const { data: standardTimes } = useQuery({
    queryKey: ["standard-times"],
    queryFn:  () => productionAPI.standardTimes().then(r => r.data.standardTimes),
  });

  const stats        = dash?.stats || {};
  const recent       = dash?.recentMovements?.slice(0, 3) || [];
  const critical     = dash?.criticalProducts?.slice(0, 3) || [];
  const todayShifts  = (myToday || []).length;

  const tiles = [
    {
      to: "/movements", emoji: "🔄", title: "Movimenti",
      desc: "Storico di entrate e uscite di magazzino",
      iconBg: "bg-blue-50 dark:bg-blue-900/20", hoverText: "group-hover:text-[var(--brand-500)]",
      info: stats.todayMovements != null ? `${stats.todayMovements} movimenti oggi` : null,
      infoClass: "text-blue-500",
    },
    {
      to: "/production", emoji: "⏱️", title: "Andon Board",
      desc: "Registra la produzione di saldatura",
      iconBg: "bg-orange-50 dark:bg-orange-900/20", hoverText: "group-hover:text-orange-500",
      info: andonToday
        ? (andonToday.righe
            ? `${andonToday.righe} righe oggi · efficienza ${efficiencyBadge(andonToday.efficienza).text}`
            : "Nessuna riga registrata oggi")
        : null,
      infoClass: andonToday?.righe ? "text-orange-500" : "text-gray-400",
    },
    {
      to: "/production/standard-times", emoji: "📋", title: "Tempi standard",
      desc: "Tempi di saldatura per tipologia di custodia",
      iconBg: "bg-purple-50 dark:bg-purple-900/20", hoverText: "group-hover:text-purple-500",
      info: standardTimes ? `${standardTimes.length} tipologie` : null,
      infoClass: "text-purple-500",
    },
    {
      to: "/checklist", emoji: "🧹", title: "Pulizia 5S",
      desc: "Autovalutazione a fine turno",
      iconBg: "bg-green-50 dark:bg-green-900/20", hoverText: "group-hover:text-green-500",
      info: myToday
        ? (todayShifts > 0
            ? `✅ ${todayShifts} ${todayShifts === 1 ? "turno compilato" : "turni compilati"} oggi`
            : "⚠ Nessuna compilazione oggi")
        : null,
      infoClass: todayShifts > 0 ? "text-green-500" : "text-amber-500",
    },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buongiorno" : hour < 18 ? "Buon pomeriggio" : "Buonasera";

  return (
    <div className="max-w-2xl mx-auto">
      {/* Saluto */}
      <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {greeting}, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString("it-IT", { weekday:"long", day:"numeric", month:"long" })}
        </p>
      </motion.div>

      {/* Accesso rapido */}
      <QuickTiles tiles={tiles}/>

      {/* Scorte basse — visibile a tutti */}
      {critical.length > 0 && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.15 }}
          className="card mb-5 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-red-50 dark:bg-red-900/10">
            <AlertTriangle size={14} className="text-red-500"/>
            <span className="text-sm font-semibold text-red-600 dark:text-red-400">Scorte basse — {stats.lowStockCount ?? critical.length} prodotti</span>
            <button onClick={() => nav("/products?lowStock=true")} className="ml-auto text-xs text-red-500 hover:underline">Vedi tutti →</button>
          </div>
          {critical.map(p => (
            <div key={p._id} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0 border-gray-100 dark:border-gray-700">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</p>
                <p className="text-xs text-gray-400 font-mono">{p.code}</p>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-red-500">{p.quantity}</span>
                <span className="text-xs text-gray-400 ml-1">{p.unit}</span>
                <p className="text-xs text-gray-400">min {p.minQuantity}</p>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Ultimi movimenti */}
      {recent.length > 0 && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.2 }}
          className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Ultimi movimenti</span>
            <button onClick={() => nav("/movements")} className="text-xs text-[var(--brand-500)] hover:underline">Vedi tutti →</button>
          </div>
          {recent.map(m => {
            const info = movementInfo(m);
            return (
              <div key={m._id} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-0 border-gray-100 dark:border-gray-700">
                <div className={clsx("w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                  m.type === "IN" ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30")}>
                  {m.type === "IN"
                    ? <ArrowDown size={13} className="text-green-600"/>
                    : <ArrowUp size={13} className="text-red-500"/>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{info.name}</p>
                  <p className="text-xs text-gray-400">{info.performer}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums text-gray-700 dark:text-gray-300">
                    {m.type === "IN" ? "+" : "-"}{m.quantity} {info.unit}
                  </p>
                  <p className="text-xs text-gray-400">{fmtTime(m.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
