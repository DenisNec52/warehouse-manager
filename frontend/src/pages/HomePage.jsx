/**
 * pages/HomePage.jsx — Home unica (prima Home + Dashboard magazzino).
 * Tutti: indicatori, movimento rapido, scorte basse, 5S di oggi, ultimi movimenti.
 * Supervisore/admin: grafici (recharts caricato solo per loro). Admin: utilizzo per utente.
 */
import { lazy, Suspense, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { m as motion, AnimatePresence } from "framer-motion";
import {
  Package, AlertTriangle, ArrowLeftRight, Timer, ArrowDown, ArrowUp, Plus, CheckCircle2, CircleDashed, ChevronRight,
} from "lucide-react";
import clsx from "clsx";
import { dashboardAPI, checklistAPI, productionAPI, categoriesAPI } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { movementInfo, fmtTime } from "@/lib/format";
import { toIsoDay, efficiencyBadge } from "@/lib/duration";
import QuickMovement from "@/components/dashboard/QuickMovement";
import DepartmentsOverview from "@/components/dashboard/DepartmentsOverview";

const ManagerInsights = lazy(() => import("@/components/dashboard/ManagerInsights"));
const UserActivity = lazy(() => import("@/components/dashboard/UserActivity"));
// Il form articolo vive nella pagina Articoli: si scarica solo quando serve.
const ProductModal = lazy(() => import("@/pages/ProductsPage").then((m) => ({ default: m.ProductModal })));

const fadeUp = (i) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.04 * i, duration: 0.3 } });

function Kpi({ i, to, icon: Icon, label, value, hint, tone = "brand" }) {
  const tones = {
    brand: "bg-(--brand-50) text-(--brand-600)",
    red: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
    green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  };
  return (
    <motion.div {...fadeUp(i)}>
      <Link to={to} className="card-hover group block p-5 h-full">
        <div className="flex items-center justify-between mb-4">
          <span className={clsx("w-10 h-10 rounded-(--radius) flex items-center justify-center", tones[tone])}>
            <Icon size={19}/>
          </span>
          <ChevronRight size={16} className="text-gray-300 group-hover:text-(--brand-500) group-hover:translate-x-0.5 transition-all"/>
        </div>
        <p className="text-3xl font-bold tracking-tight tabular-nums text-gray-900 dark:text-white">{value ?? <span className="skeleton inline-block w-12 h-8 align-middle"/>}</p>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mt-1">{label}</p>
        {hint && <p className="text-xs text-gray-400 mt-0.5 truncate">{hint}</p>}
      </Link>
    </motion.div>
  );
}

export default function HomePage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const nav = useNavigate();
  const isManager = ["admin", "supervisore"].includes(user?.role);
  const isAdmin = user?.role === "admin";
  const [productModal, setProductModal] = useState(false);
  const today = toIsoDay(new Date());

  const { data: dash } = useQuery({ queryKey: ["dashboard"], queryFn: () => dashboardAPI.stats().then((r) => r.data) });
  const { data: myToday } = useQuery({ queryKey: ["checklist-my-today"], queryFn: () => checklistAPI.myToday().then((r) => r.data.submissions) });
  const { data: andon } = useQuery({
    queryKey: ["production", "stats", { from: today, to: today }],
    queryFn: () => productionAPI.stats({ from: today, to: today }).then((r) => r.data.totale),
  });
  const { data: cats } = useQuery({
    queryKey: ["categories"], queryFn: () => categoriesAPI.list().then((r) => r.data.categories), enabled: productModal,
  });

  const stats = dash?.stats || {};
  const critical = dash?.criticalProducts || [];
  const recent = dash?.recentMovements || [];
  const shifts = myToday?.length ?? null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buongiorno" : hour < 18 ? "Buon pomeriggio" : "Buonasera";

  return (
    <div className="space-y-6">
      {/* Intestazione */}
      <motion.div {...fadeUp(0)} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-gray-400 capitalize">
            {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {greeting}, {user?.name?.split(" ")[0]}
          </h1>
        </div>
        <button className="btn btn-md btn-primary" onClick={() => setProductModal(true)}>
          <Plus size={16}/> Nuovo articolo
        </button>
      </motion.div>

      {/* Indicatori */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi i={1} to="/products" icon={Package} label="Articoli" value={dash ? stats.totalProducts : undefined} hint="in magazzino"/>
        <Kpi i={2} to="/products?lowStock=true" icon={AlertTriangle} label="Sotto scorta"
          value={dash ? stats.lowStockCount : undefined} tone={stats.lowStockCount > 0 ? "red" : "green"}
          hint={stats.lowStockCount > 0 ? "da riordinare" : "tutto in regola"}/>
        <Kpi i={3} to="/movements" icon={ArrowLeftRight} label="Movimenti oggi" value={dash ? stats.todayMovements : undefined} hint="entrate + uscite"/>
        <Kpi i={4} to="/production" icon={Timer} label="Righe Andon oggi" value={andon ? andon.righe : undefined} tone="amber"
          hint={andon?.righe ? `efficienza ${efficiencyBadge(andon.efficienza).text}` : "nessuna registrazione"}/>
      </div>

      {/* Mix di tutti i reparti: andamento generale del lavoro */}
      <motion.div {...fadeUp(5)}>
        <DepartmentsOverview/>
      </motion.div>

      {/* Lavoro di tutti i giorni */}
      <div className="grid lg:grid-cols-5 gap-6">
        <motion.div {...fadeUp(5)} className="lg:col-span-3">
          <QuickMovement/>
        </motion.div>

        <motion.div {...fadeUp(6)} className="lg:col-span-2 space-y-6">
          {/* 5S di oggi */}
          <Link to="/checklist" className={clsx("card-hover flex items-center gap-4 p-5",
            shifts === 0 && "ring-1 ring-amber-300/60 dark:ring-amber-400/30")}>
            <span className={clsx("w-11 h-11 rounded-full flex items-center justify-center shrink-0",
              shifts > 0 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15" : "bg-amber-50 text-amber-600 dark:bg-amber-500/15")}>
              {shifts > 0 ? <CheckCircle2 size={21}/> : <CircleDashed size={21}/>}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white">Pulizia 5S</p>
              <p className="text-sm text-gray-500">
                {shifts == null ? "…" : shifts > 0 ? `${shifts} ${shifts === 1 ? "turno compilato" : "turni compilati"} oggi` : "Da compilare a fine turno"}
              </p>
            </div>
            <ChevronRight size={18} className="text-gray-300"/>
          </Link>

          {/* Scorte basse */}
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 px-5 h-14 border-b border-gray-100 dark:border-white/6">
              <AlertTriangle size={16} className="text-rose-500"/>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Scorte basse</h2>
              <Link to="/products?lowStock=true" className="ml-auto text-xs font-medium text-(--brand-500) hover:underline">Vedi tutte</Link>
            </div>
            {critical.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gray-400 text-center">{dash ? "Nessun articolo sotto scorta 👍" : "…"}</p>
            ) : critical.slice(0, 5).map((p) => (
              <button key={p._id} onClick={() => nav(`/products/${p._id}`)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left border-b last:border-0 border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{p.code}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-rose-500 tabular-nums">{p.quantity} <span className="font-normal text-gray-400">{p.unit}</span></p>
                  <p className="text-[11px] text-gray-400">min {p.minQuantity}</p>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </div>

      {isManager && (
        <Suspense fallback={<div className="skeleton h-[280px] w-full"/>}>
          <ManagerInsights/>
        </Suspense>
      )}

      <div className={clsx("grid gap-6", isAdmin && "lg:grid-cols-2")}>
        {/* Ultimi movimenti */}
        <div className="card overflow-hidden">
          <div className="flex items-center px-5 h-14 border-b border-gray-100 dark:border-white/6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Ultimi movimenti</h2>
            <Link to="/movements" className="ml-auto text-xs font-medium text-(--brand-500) hover:underline">Vedi tutti</Link>
          </div>
          {recent.length === 0 && <p className="px-5 py-8 text-sm text-gray-400 text-center">{dash ? "Nessun movimento" : "…"}</p>}
          {recent.map((m) => {
            const info = movementInfo(m);
            const isIn = m.type === "IN";
            return (
              <div key={m._id} className="flex items-center gap-3 px-5 py-3 border-b last:border-0 border-gray-100 dark:border-white/5">
                <span className={clsx("w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                  isIn ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15" : "bg-rose-50 text-rose-500 dark:bg-rose-500/15")}>
                  {isIn ? <ArrowDown size={15}/> : <ArrowUp size={15}/>}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{info.name}</p>
                  <p className="text-xs text-gray-400 truncate">{info.performer}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={clsx("text-sm font-bold tabular-nums", isIn ? "text-emerald-600" : "text-rose-500")}>
                    {isIn ? "+" : "−"}{m.quantity} <span className="font-normal text-gray-400">{info.unit}</span>
                  </p>
                  <p className="text-[11px] text-gray-400">{fmtTime(m.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>

        {isAdmin && (
          <Suspense fallback={<div className="skeleton h-[280px] w-full"/>}>
            <UserActivity/>
          </Suspense>
        )}
      </div>

      <AnimatePresence>
        {productModal && (
          <Suspense fallback={null}>
            <ProductModal key="new-product" product={null} categories={cats || []}
              onClose={() => { setProductModal(false); qc.invalidateQueries({ queryKey: ["dashboard"] }); }}/>
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
