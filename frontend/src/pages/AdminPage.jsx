/**
 * pages/AdminPage.jsx — Amministrazione
 *
 * Punto unico da cui l'admin raggiunge tutto ciò che è modificabile.
 * I conteggi riusano le stesse query (e la stessa cache) delle altre pagine.
 */
import { Link } from "react-router-dom";
import { m as motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Package, ArrowLeftRight, Tag, Users, ClipboardList, Timer, Clock, Settings, Bell, Factory } from "lucide-react";
import { dashboardAPI, categoriesAPI, productionAPI } from "@/lib/api";
import { useDepartmentList } from "@/hooks/useDepartments";
import { toIsoDay } from "@/lib/duration";

const AREAS = [
  { to: "/products",                   icon: Package,        title: "Magazzino",      desc: "Crea, modifica, elimina prodotti, soglie e foto", countKey: "products" },
  { to: "/movements",                  icon: ArrowLeftRight, title: "Movimenti",      desc: "Correggi o annulla entrate e uscite: la giacenza si riallinea da sola", countKey: "movements" },
  { to: "/categories",                 icon: Tag,            title: "Categorie",      desc: "Nomi, colori e icone delle categorie", countKey: "categories" },
  { to: "/admin/departments",          icon: Factory,        title: "Reparti",        desc: "Postazioni per 5S, Tempi standard e Andon Board: aggiungi, rinomina, ordina, disattiva", countKey: "departments" },
  { to: "/users",                      icon: Users,          title: "Utenti",         desc: "Ruoli, reparti e visibilità, password, attivazione e badge QR/NFC", countKey: "users" },
  { to: "/admin/checklist",            icon: ClipboardList,  title: "Pulizia 5S",     desc: "Configurazione checklist e turni, correzione delle compilazioni", countKey: null },
  { to: "/production",                 icon: Timer,          title: "Andon Board",    desc: "Modifica ed elimina qualsiasi riga di produzione", countKey: "production" },
  { to: "/production/standard-times",  icon: Clock,          title: "Tempi standard", desc: "Tempi di saldatura per tipologia di custodia", countKey: "standardTimes" },
  { to: "/notifications",              icon: Bell,           title: "Notifiche",      desc: "Storico eventi, incluse correzioni e annullamenti", countKey: null },
  { to: "/settings",                   icon: Settings,       title: "Impostazioni",   desc: "Il tuo profilo, email, tema e badge", countKey: null },
];

function useCounts() {
  const today = toIsoDay(new Date());
  const { data: dash } = useQuery({ queryKey: ["dashboard"], queryFn: () => dashboardAPI.stats().then(r => r.data) });
  const { data: cats } = useQuery({ queryKey: ["categories"], queryFn: () => categoriesAPI.list().then(r => r.data.categories) });
  const { data: std }  = useQuery({ queryKey: ["standard-times"], queryFn: () => productionAPI.standardTimes().then(r => r.data.standardTimes) });
  const { data: andon } = useQuery({
    queryKey: ["production", "stats", { from: today, to: today }],
    queryFn:  () => productionAPI.stats({ from: today, to: today }).then(r => r.data.totale),
  });
  const { data: depts } = useDepartmentList();
  const s = dash?.stats;
  return {
    products:      s ? `${s.totalProducts}` : null,
    movements:     s ? `${s.todayMovements} oggi` : null,
    users:         s ? `${s.totalUsers} attivi` : null,
    categories:    cats ? `${cats.length}` : null,
    departments:   depts ? `${depts.filter(d => d.isActive).length} attivi` : null,
    standardTimes: std ? `${std.length}` : null,
    production:    andon ? `${andon.righe} oggi` : null,
  };
}

export default function AdminPage() {
  const counts = useCounts();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Amministrazione</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tutto ciò che puoi modificare, in un unico posto</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {AREAS.map((a, i) => (
          <motion.div key={a.to} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }}>
            <Link to={a.to} className="card p-5 flex gap-4 items-start h-full hover:shadow-lg hover:-translate-y-0.5 transition-all group">
              <div className="w-10 h-10 rounded-[var(--radius)] bg-[var(--brand-50)] dark:bg-[var(--brand-500)]/15 text-[var(--brand-500)] flex items-center justify-center shrink-0">
                <a.icon size={18}/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-semibold text-gray-900 dark:text-white group-hover:text-[var(--brand-500)] transition-colors">{a.title}</h2>
                  {a.countKey && counts[a.countKey] != null && (
                    <span className="text-xs font-semibold text-gray-400 tabular-nums whitespace-nowrap">{counts[a.countKey]}</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{a.desc}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
