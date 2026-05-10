/**
 * pages/DashboardPage.jsx
 * Dashboard con:
 * - Creazione prodotto rapida
 * - Entrata/uscita con stesso modal di ProductsPage
 * - Ultimi movimenti
 */
import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDown, ArrowUp, Search, Package, ArrowLeftRight, Plus, X } from "lucide-react";
import { dashboardAPI, productsAPI, categoriesAPI } from "@/lib/api";
import { MovementModal, ProductModal } from "@/pages/ProductsPage";
import { useAuthStore } from "@/lib/store";
import { Link } from "react-router-dom";
import clsx from "clsx";

// ── Ricerca prodotto per movimento ────────────────────────────
function MovimentoRapido({ type, onOpen }) {
  const isIN = type === "IN";
  const [search,      setSearch]      = useState("");
  const [selected,    setSelected]    = useState(null);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef();

  const { data: searchData } = useQuery({
    queryKey: ["products-search", type, search],
    queryFn:  () => productsAPI.list({ search, limit: 8 }).then(r => r.data),
    enabled:  search.length > 1,
  });

  const reset = () => {
    setSelected(null);
    setSearch("");
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  return (
    <div className={clsx("card p-5 border-t-2", isIN ? "border-t-green-500" : "border-t-red-500")}>
      <div className="flex items-center gap-2 mb-4">
        <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
          isIN
            ? "bg-green-100 text-green-600 dark:bg-green-900/30"
            : "bg-red-100 text-red-600 dark:bg-red-900/30")}>
          {isIN ? "↓" : "↑"}
        </div>
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
          {isIN ? "Entrata in magazzino" : "Uscita dal magazzino"}
        </h3>
      </div>

      {selected ? (
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded mb-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-white text-sm">{selected.name}</p>
            <p className="text-xs text-gray-400">
              {selected.code} · Stock: <strong>{selected.quantity} {selected.unit}</strong>
            </p>
          </div>
          <button onClick={reset} className="text-gray-400 hover:text-red-500 transition-colors ml-2">
            <X size={14}/>
          </button>
        </div>
      ) : (
        <div className="relative mb-4">
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

      <button
        className={clsx(
          "btn btn-lg w-full gap-2",
          isIN ? "bg-green-500 hover:bg-green-600 text-white" : "bg-red-500 hover:bg-red-600 text-white",
          !selected && "opacity-50 cursor-not-allowed"
        )}
        disabled={!selected}
        onClick={() => onOpen(selected, type)}
      >
        {isIN ? "↓ Registra Entrata" : "↑ Registra Uscita"}
      </button>
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

// ── Dashboard ─────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [movModal,     setMovModal]     = useState(null); // { product, type }
  const [productModal, setProductModal] = useState(false);
  const [frozenCats,   setFrozenCats]   = useState([]);

  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn:  () => dashboardAPI.stats().then(r => r.data),
  });

  const { data: cats } = useQuery({
    queryKey: ["categories"],
    queryFn:  () => categoriesAPI.list().then(r => r.data.categories),
  });

  const openProductModal = () => {
    setFrozenCats(cats || []);
    setProductModal(true);
  };

  const openMovModal = (product, type) => {
    setMovModal({ product, type });
  };

  const stats  = data?.stats;
  const recent = data?.recentMovements || [];

  return (
    <div>
      {/* Header con bottone nuovo prodotto */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Ciao, {user?.name?.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Gestisci il magazzino direttamente da qui
          </p>
        </div>
        <button className="btn btn-md btn-primary gap-2" onClick={openProductModal}>
          <Plus size={16}/> Nuovo prodotto
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Prodotti totali" value={stats?.totalProducts}  icon={Package}        color="#3b82f6" sub="Articoli registrati"/>
        <StatCard label="Movimenti oggi"  value={stats?.todayMovements} icon={ArrowLeftRight} color="#10b981" sub="Entrate + uscite"/>
      </div>

      {/* Entrata / Uscita rapida */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <MovimentoRapido type="IN"  onOpen={openMovModal}/>
        <MovimentoRapido type="OUT" onOpen={openMovModal}/>
      </div>

      {/* Ultimi movimenti */}
      <div className="card">
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

      {/* Modal nuovo prodotto — stesso di ProductsPage */}
      <AnimatePresence>
        {productModal && (
          <ProductModal
            key="new-product"
            product={null}
            categories={frozenCats}
            onClose={() => {
              setProductModal(false);
              qc.invalidateQueries({ queryKey: ["dashboard"] });
            }}
          />
        )}
        {/* Modal movimento — stesso di ProductsPage */}
        {movModal && (
          <MovementModal
            key={movModal.product._id + movModal.type}
            product={movModal.product}
            defaultType={movModal.type}
            onClose={() => setMovModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
