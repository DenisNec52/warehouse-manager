/**
 * pages/DashboardPage.jsx
 * Dashboard con form entrata/uscita identico al modal prodotti.
 */
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Search, Package, ArrowLeftRight, X } from "lucide-react";
import { dashboardAPI, productsAPI, movementsAPI } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import clsx from "clsx";

// ── Form movimento — identico al MovementModal di ProductsPage ─
function MovimentoRapido({ type }) {
  const qc = useQueryClient();
  const isIN = type === "IN";
  const [search,      setSearch]      = useState("");
  const [selected,    setSelected]    = useState(null);
  const [quantity,    setQuantity]    = useState("");
  const [reason,      setReason]      = useState("");
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef();

  const { data: searchData } = useQuery({
    queryKey: ["products-search", type, search],
    queryFn:  () => productsAPI.list({ search, limit: 8 }).then(r => r.data),
    enabled:  search.length > 1,
  });

  const mutation = useMutation({
    mutationFn: (d) => movementsAPI.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(`${isIN ? "Entrata" : "Uscita"} registrata — ${selected.name}`);
      setSelected(null);
      setSearch("");
      setQuantity("");
      setReason("");
      setTimeout(() => searchRef.current?.focus(), 100);
    },
    onError: (err) => toast.error(err.response?.data?.message || "Errore"),
  });

  const handleSubmit = () => {
    if (!selected) return toast.error("Seleziona un prodotto");
    const qty = parseInt(quantity);
    if (!qty || qty < 1) return toast.error("Inserisci una quantità valida");
    mutation.mutate({ productId: selected._id, type, quantity: qty, reason });
  };

  const reset = () => {
    setSelected(null);
    setSearch("");
    setShowResults(false);
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  return (
    <div className="card p-5">
      {/* Preview prodotto selezionato */}
      {selected && (
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded mb-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-white text-sm">{selected.name}</p>
            <p className="text-xs text-gray-400">
              {selected.code} · Stock attuale: <strong>{selected.quantity} {selected.unit}</strong>
            </p>
          </div>
          <button onClick={reset} className="text-gray-400 hover:text-red-500 transition-colors ml-2">
            <X size={14}/>
          </button>
        </div>
      )}

      {/* Ricerca prodotto */}
      {!selected && (
        <div className="mb-4">
          <label className="form-label">Cerca prodotto</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
            <input
              ref={searchRef}
              className="form-input pl-9"
              placeholder="Nome o codice..."
              value={search}
              autoComplete="off"
              onChange={e => { setSearch(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 150)}
            />
            {showResults && search.length > 1 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-[var(--radius)] shadow-modal z-30 max-h-52 overflow-y-auto">
                {searchData?.products?.length > 0 ? (
                  searchData.products.map(p => (
                    <div key={p._id}
                      className="flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                      onMouseDown={() => { setSelected(p); setShowResults(false); setSearch(""); }}>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</p>
                        <p className="text-xs text-gray-400 font-mono">{p.code}</p>
                      </div>
                      <span className={clsx("text-sm font-bold tabular-nums",
                        p.quantity <= p.minQuantity ? "text-red-500" : "text-gray-500")}>
                        {p.quantity} {p.unit}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-3 text-sm text-gray-400 text-center">Nessun prodotto trovato</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pulsanti IN / OUT — identici al modal prodotti */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          className={clsx("btn btn-md gap-2", isIN ? "bg-green-500 text-white" : "btn-secondary")}
          onClick={() => {}}>
          <ArrowDown size={14}/> Entrata
        </button>
        <button
          className={clsx("btn btn-md gap-2", !isIN ? "bg-red-500 text-white" : "btn-secondary")}
          onClick={() => {}}>
          <ArrowUp size={14}/> Uscita
        </button>
      </div>

      {/* Quantità — solo numeri, tastiera numerica mobile */}
      <div className="mb-4">
        <label className="form-label">Quantità *</label>
        <input
          className="form-input text-base font-semibold tabular-nums"
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min={1}
          step={1}
          value={quantity}
          placeholder="0"
          onChange={e => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={e => {
            const allowed = ["Backspace","Delete","Tab","Enter","ArrowLeft","ArrowRight","ArrowUp","ArrowDown"];
            if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) e.preventDefault();
            if (e.key === "Enter") handleSubmit();
          }}
        />
      </div>

      {/* Motivazione */}
      <div className="mb-4">
        <label className="form-label">
          Motivazione <span className="text-gray-400 font-normal text-xs">(opzionale)</span>
        </label>
        <input
          className="form-input"
          placeholder="es. Ordine #123, Riassortimento..."
          value={reason}
          onChange={e => setReason(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
        />
      </div>

      {/* Bottoni azione */}
      <div className="flex gap-3">
        <button
          className="btn btn-md btn-secondary flex-1"
          onClick={reset}
          disabled={!selected && !quantity && !reason}>
          Pulisci
        </button>
        <button
          className={clsx("btn btn-md flex-1 gap-2",
            isIN ? "bg-green-500 hover:bg-green-600 text-white" : "bg-red-500 hover:bg-red-600 text-white")}
          disabled={!selected || mutation.isPending}
          onClick={handleSubmit}>
          {mutation.isPending ? "..." : (isIN ? "↓ Registra Entrata" : "↑ Registra Uscita")}
        </button>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="stat-card">
      <div className="stat-card-accent" style={{ background: color }}/>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{label}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">{value ?? "—"}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-[var(--radius-sm)] flex items-center justify-center"
          style={{ background: color + "20" }}>
          <Icon size={18} style={{ color }}/>
        </div>
      </div>
    </motion.div>
  );
}

// ── Dashboard principale ──────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuthStore();
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn:  () => dashboardAPI.stats().then(r => r.data),
  });

  const stats  = data?.stats;
  const recent = data?.recentMovements || [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Ciao, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Registra un movimento o controlla lo stato del magazzino
        </p>
      </div>

      {/* Stats — senza valore economico e scorte */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Prodotti totali"  value={stats?.totalProducts}  icon={Package}        color="#3b82f6" sub="Articoli registrati"/>
        <StatCard label="Movimenti oggi"   value={stats?.todayMovements} icon={ArrowLeftRight} color="#10b981" sub="Entrate + uscite"/>
      </div>

      {/* Form entrata e uscita */}
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Registra movimento</h2>
        <div className="grid lg:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2 flex items-center gap-1">
              <ArrowDown size={12}/> Entrata
            </p>
            <MovimentoRapido type="IN"/>
          </div>
          <div>
            <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <ArrowUp size={12}/> Uscita
            </p>
            <MovimentoRapido type="OUT"/>
          </div>
        </div>
      </div>

      {/* Ultimi movimenti */}
      <div className="card mt-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Movimenti recenti</h3>
          <Link to="/movements" className="text-xs text-[var(--brand-500)] hover:underline">Vedi tutti →</Link>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Prodotto</th><th>Tipo</th><th>Quantità</th><th>Operatore</th><th>Data</th></tr>
            </thead>
            <tbody>
              {recent.map(m => (
                <tr key={m._id}>
                  <td>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {m.product?.name || m.productSnapshot?.name}
                    </div>
                    <div className="text-xs text-gray-400 font-mono">
                      {m.product?.code || m.productSnapshot?.code}
                    </div>
                  </td>
                  <td>
                    <span className={clsx("badge", m.type === "IN" ? "badge-green" : "badge-red")}>
                      {m.type === "IN" ? <ArrowDown size={10}/> : <ArrowUp size={10}/>}
                      {m.type === "IN" ? "Entrata" : "Uscita"}
                    </span>
                  </td>
                  <td className="font-semibold tabular-nums">
                    {m.quantity} {m.product?.unit || m.productSnapshot?.unit}
                  </td>
                  <td className="text-gray-500 text-sm">{m.performedBy?.name || m.performedByName}</td>
                  <td className="text-gray-400 text-xs">
                    {new Date(m.createdAt).toLocaleString("it-IT", {
                      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!recent.length && (
            <div className="py-10 text-center text-sm text-gray-400">Nessun movimento ancora</div>
          )}
        </div>
      </div>
    </div>
  );
}
