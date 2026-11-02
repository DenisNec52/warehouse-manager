/**
 * components/dashboard/DepartmentsOverview.jsx — "Andamento reparti" nella Home.
 *
 * Mix di tutti i reparti visibili (Prima Saldatura, Seconda Saldatura, ...) per vedere
 * l'andamento generale del lavoro: totali, poi una scheda per reparto con pezzi di oggi,
 * efficienza della settimana, linea degli ultimi 14 giorni e commesse aperte.
 * Tocco su una scheda = Andon Board già filtrata su quel reparto.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { m as motion } from "framer-motion";
import { Factory, PlayCircle, Hourglass, Sparkles, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { productionAPI } from "@/lib/api";
import { efficiencyBadge } from "@/lib/duration";
import { rememberDepartment } from "@/hooks/useDepartments";

/** Linea dei pezzi giornalieri (SVG leggero: niente libreria grafici per tutti i ruoli). */
function Sparkline({ points }) {
  const W = 160, H = 40, pad = 3;
  const max = Math.max(...points.map((p) => p.pezzi), 1);
  const xy = points.map((p, i) => [
    pad + (i * (W - pad * 2)) / Math.max(points.length - 1, 1),
    H - pad - (p.pezzi / max) * (H - pad * 2),
  ]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${xy.at(-1)[0].toFixed(1)},${H} L${xy[0][0].toFixed(1)},${H} Z`;
  const [lx, ly] = xy.at(-1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10" preserveAspectRatio="none" aria-hidden>
      <path d={area} fill="var(--brand-500)" opacity="0.12"/>
      <path d={line} fill="none" stroke="var(--brand-500)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
      <circle cx={lx} cy={ly} r="2.8" fill="var(--brand-500)"/>
    </svg>
  );
}

function Total({ icon: Icon, label, value, tone = "text-gray-900 dark:text-white", className = "" }) {
  return (
    <div className={clsx("flex items-center gap-3 px-4 py-3", className)}>
      <Icon size={17} className="text-gray-400 shrink-0"/>
      <div className="min-w-0">
        <p className={clsx("text-lg font-bold tabular-nums leading-tight", tone)}>{value}</p>
        <p className="text-[11px] text-gray-400 truncate">{label}</p>
      </div>
    </div>
  );
}

export default function DepartmentsOverview() {
  const nav = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["production", "overview"],
    queryFn: () => productionAPI.overview().then((r) => r.data),
    refetchInterval: 60_000,   // la Home resta aperta in reparto: si aggiorna da sola ogni minuto
  });

  if (isLoading) return <div className="skeleton h-56 w-full"/>;
  if (!data?.reparti?.length) return null;

  const t = data.totale;
  const effToday = efficiencyBadge(t.efficienzaOggi);
  const open = (id) => { rememberDepartment("production", id); nav("/production"); };

  return (
    <section aria-labelledby="andamento-reparti">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 id="andamento-reparti" className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">Andamento reparti</h2>
          <p className="text-xs text-gray-400">Tutti i reparti · ultimi 14 giorni · si aggiorna da solo</p>
        </div>
      </div>

      <div className="card grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-gray-100 dark:divide-white/6 mb-4 overflow-hidden">
        <Total icon={Factory} label="Pezzi oggi" value={t.pezziOggi}/>
        <Total icon={Sparkles} label="Efficienza oggi" value={t.efficienzaOggi == null ? "—" : effToday.text}/>
        <Total icon={PlayCircle} label="In lavorazione" value={t.inLavorazione} tone="text-(--brand-600)"/>
        <Total icon={Hourglass} label="Da avviare" value={t.daAvviare} tone={t.daAvviare ? "text-amber-600" : undefined}/>
        {/* 5 totali in 2 colonne su telefono: l'ultimo occupa la riga intera invece di restare spaiato */}
        <Total icon={Sparkles} label="5S oggi" value={t.fiveSOggi} className="col-span-2 sm:col-span-1"/>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.reparti.map((r, i) => {
          const week = efficiencyBadge(r.settimana.efficienza);
          const quiet = !r.settimana.righe && !r.inLavorazione && !r.daAvviare;
          return (
            <motion.button key={r.id} type="button" onClick={() => open(r.id)}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}
              className="card-hover group p-4 text-left">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-gray-900 dark:text-white">{r.name}</p>
                <ChevronRight size={16} className="text-gray-300 group-hover:text-(--brand-500) group-hover:translate-x-0.5 transition-all mt-0.5"/>
              </div>
              <div className="flex items-end justify-between gap-3 mt-2">
                <div>
                  <p className="text-3xl font-bold tabular-nums tracking-tight text-gray-900 dark:text-white leading-none">{r.oggi.pezzi}</p>
                  <p className="text-[11px] text-gray-400 mt-1">pezzi oggi · {r.settimana.pezzi} in 7 gg</p>
                </div>
                {r.settimana.efficienza != null
                  ? <span className={clsx("badge", week.cls)} title="Efficienza ultimi 7 giorni">{week.text}</span>
                  : <span className="badge badge-gray">—</span>}
              </div>
              <div className="mt-3">
                {quiet
                  ? <p className="h-10 flex items-center text-xs text-gray-400">Nessuna attività negli ultimi 14 giorni</p>
                  : <Sparkline points={r.andamento}/>}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-white/6 text-center">
                <div><p className="text-sm font-bold tabular-nums text-(--brand-600)">{r.inLavorazione}</p><p className="text-[10px] text-gray-400">in lavoraz.</p></div>
                <div><p className={clsx("text-sm font-bold tabular-nums", r.daAvviare ? "text-amber-600" : "text-gray-500")}>{r.daAvviare}</p><p className="text-[10px] text-gray-400">da avviare</p></div>
                <div><p className="text-sm font-bold tabular-nums text-gray-700 dark:text-gray-200">{r.fiveSOggi}</p><p className="text-[10px] text-gray-400">5S oggi</p></div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
