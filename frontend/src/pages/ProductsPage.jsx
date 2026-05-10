/**
 * pages/ProductsPage.jsx
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Edit, Trash2, Eye, AlertTriangle, X, Package, ArrowDown, ArrowUp } from "lucide-react";
import { productsAPI, categoriesAPI, movementsAPI } from "@/lib/api";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import clsx from "clsx";

export function ProductModal({ product, categories, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!product;
  const [form, setForm] = useState({
    code:        product?.code        || "",
    quantity:    product?.quantity    ?? 0,
    category:    product?.category?._id || product?.category || "",
    notes:       product?.notes       || "",
  });
  const [errors, setErrors] = useState({});

  const mutation = useMutation({
    mutationFn: (d) => isEdit ? productsAPI.update(product._id, d) : productsAPI.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(isEdit ? "Prodotto aggiornato" : "Prodotto creato");
      onClose();
    },
    onError: (err) => {
      const msg = err.response?.data?.message || "Errore";
      if (err.response?.data?.errors) {
        const e = {};
        err.response.data.errors.forEach(er => { e[er.field] = er.message; });
        setErrors(e);
      } else toast.error(msg);
    },
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrors({});
    mutation.mutate({ ...form, category: form.category || null });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        className="relative z-10 w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-[var(--radius-lg)] sm:rounded-[var(--radius-lg)] shadow-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {isEdit ? "Modifica prodotto" : "Nuovo prodotto"}
          </h2>
          <button className="btn btn-ghost btn-sm p-1.5" onClick={onClose}><X size={16}/></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-3">
            {/* Categoria */}
            <div>
              <label className="form-label">Categoria</label>
              <select className="form-input" value={form.category}
                onChange={e => set("category", e.target.value)}>
                <option value="">Nessuna categoria</option>
                {categories?.map(c => (
                  <option key={c._id} value={c._id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
            {/* Codice — diventa anche il nome */}
            <div>
              <label className="form-label">Codice <span className="text-red-400">*</span></label>
              <input className={clsx("form-input", errors.code && "border-red-400")}
                value={form.code} onChange={e => set("code", e.target.value.toUpperCase())}
                placeholder="es. ART-001, VITE-M8..."/>
              {errors.code && <p className="form-error">{errors.code}</p>}
            </div>
            {/* Quantità */}
            <div>
              <label className="form-label">Quantità <span className="text-red-400">*</span></label>
              <input className="form-input" type="number" inputMode="numeric" pattern="[0-9]*" min={0}
                value={form.quantity} onChange={e => set("quantity", Number(e.target.value.replace(/[^0-9]/g,"")))}/>
            </div>
            {/* Note */}
            <div>
              <label className="form-label">Note</label>
              <textarea className="form-input resize-none" rows={2}
                value={form.notes} onChange={e => set("notes", e.target.value)}
                placeholder="Informazioni aggiuntive..."/>
            </div>
          </div>
          <div className="px-5 pb-5 flex gap-3">
            <button type="button" className="btn btn-md btn-secondary flex-1" onClick={onClose}>
              Annulla
            </button>
            <button type="submit" className="btn btn-md btn-primary flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvataggio..." : (isEdit ? "Aggiorna" : "Crea prodotto")}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// Esportato per riuso nella Dashboard
export function MovementModal({ product, onClose, defaultType = "IN" }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ type: defaultType, quantity: "", reason: "" });

  const mutation = useMutation({
    mutationFn: (d) => movementsAPI.create({ productId: product._id, ...d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      toast.success(form.type === "IN" ? "Entrata registrata" : "Uscita registrata");
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || "Errore"),
  });

  const handleSubmit = () => {
    const qty = parseInt(form.quantity);
    if (!qty || qty < 1) return toast.error("Inserisci una quantità valida");
    mutation.mutate({ ...form, quantity: qty });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        className="relative z-10 w-full sm:max-w-sm bg-white dark:bg-gray-900 rounded-t-[var(--radius-lg)] sm:rounded-[var(--radius-lg)] shadow-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">Registra movimento</h2>
          <button className="btn btn-ghost btn-sm p-1.5" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <p className="font-medium text-gray-900 dark:text-white text-sm">{product.name}</p>
            <p className="text-xs text-gray-400">
              {product.code} · Stock: <strong>{product.quantity} {product.unit}</strong>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setForm(f => ({ ...f, type: "IN" }))}
              className={clsx("btn btn-md gap-2", form.type === "IN" ? "bg-green-500 text-white" : "btn-secondary")}>
              <ArrowDown size={14}/> Entrata
            </button>
            <button onClick={() => setForm(f => ({ ...f, type: "OUT" }))}
              className={clsx("btn btn-md gap-2", form.type === "OUT" ? "bg-red-500 text-white" : "btn-secondary")}>
              <ArrowUp size={14}/> Uscita
            </button>
          </div>
          <div>
            <label className="form-label">Quantità *</label>
            <input className="form-input text-lg font-semibold tabular-nums"
              type="number" inputMode="numeric" pattern="[0-9]*" min={1}
              value={form.quantity} placeholder="0"
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value.replace(/[^0-9]/g,"") }))}
              onKeyDown={e => {
                const allowed = ["Backspace","Delete","Tab","Enter","ArrowLeft","ArrowRight","ArrowUp","ArrowDown"];
                if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) e.preventDefault();
                if (e.key === "Enter") handleSubmit();
              }}/>
          </div>
          <div>
            <label className="form-label">Motivazione</label>
            <input className="form-input" placeholder="es. Ordine #123..."
              value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}/>
          </div>
          <div className="flex gap-3">
            <button className="btn btn-md btn-secondary flex-1" onClick={onClose}>Annulla</button>
            <button className="btn btn-md btn-primary flex-1" disabled={mutation.isPending}
              onClick={handleSubmit}>
              {mutation.isPending ? "..." : "Registra"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function ProductsPage() {
  const [search,     setSearch]     = useState("");
  const [category,   setCategory]   = useState("");
  const [lowOnly,    setLowOnly]    = useState(false);
  const [page,       setPage]       = useState(1);
  const [modal,      setModal]      = useState(null);
  const [movModal,   setMovModal]   = useState(null);
  const [frozenCats, setFrozenCats] = useState([]);
  const qc = useQueryClient();
  const [sp] = useSearchParams();

  const params = {
    search:   search   || undefined,
    category: category || undefined,
    lowStock: (lowOnly || sp.get("lowStock") === "true") ? "true" : undefined,
    page,
    limit: 20,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["products", params],
    queryFn:  () => productsAPI.list(params).then(r => r.data),
  });

  const { data: cats } = useQuery({
    queryKey: ["categories"],
    queryFn:  () => categoriesAPI.list().then(r => r.data.categories),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => productsAPI.delete(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["products"] }); toast.success("Prodotto eliminato"); },
    onError:    () => toast.error("Errore eliminazione"),
  });

  const handleDelete = (p) => {
    if (!confirm("Eliminare \"" + p.name + "\"?")) return;
    deleteMutation.mutate(p._id);
  };

  const openModal = (val) => {
    setFrozenCats(cats || []);
    setModal(val);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Prodotti</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.pagination?.total ?? "—"} articoli in magazzino</p>
        </div>
        <button className="btn btn-md btn-primary gap-2" onClick={() => openModal("create")}>
          <Plus size={16}/> Nuovo prodotto
        </button>
      </div>

      <div className="card p-3 mb-4 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input className="form-input pl-9 py-2 text-sm" placeholder="Cerca per nome, codice..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}/>
        </div>
        <select className="form-input py-2 text-sm w-auto" value={category}
          onChange={e => { setCategory(e.target.value); setPage(1); }}>
          <option value="">Tutte le categorie</option>
          {(cats || []).map(c => <option key={c._id} value={c._id}>{c.icon} {c.name}</option>)}
        </select>
        <button
          className={clsx("btn btn-md gap-2", lowOnly ? "bg-yellow-500 text-white" : "btn-secondary")}
          onClick={() => { setLowOnly(v => !v); setPage(1); }}>
          <AlertTriangle size={14}/> Scorte basse
        </button>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-[var(--brand-500)] border-t-transparent rounded-full animate-spin"/>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Codice</th><th>Categoria</th><th>Quantità</th><th>Note</th><th></th>
                </tr>
              </thead>
              <tbody>
                {(data?.products || []).map(p => (
                  <tr key={p._id}>
                    <td>
                      <code className="text-sm font-bold bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                        {p.code}
                      </code>
                      {p.isLowStock && (
                        <div className="flex items-center gap-1 text-xs text-yellow-600 mt-0.5">
                          <AlertTriangle size={10}/> Scorta bassa
                        </div>
                      )}
                    </td>
                    <td>
                      {p.category
                        ? <span className="badge badge-gray gap-1">{p.category.icon} {p.category.name}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td>
                      <span className={clsx("font-semibold tabular-nums text-lg",
                        p.isLowStock ? "text-yellow-600" : "text-gray-900 dark:text-white")}>
                        {p.quantity}
                      </span>
                      <span className="text-gray-400 text-xs ml-1">{p.unit}</span>
                    </td>
                    <td className="text-gray-500 text-sm max-w-[150px] truncate">{p.notes || "—"}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button className="btn btn-ghost btn-sm p-1.5 text-green-600"
                          title="Movimento rapido" onClick={() => setMovModal(p)}>
                          <ArrowDown size={14}/>
                        </button>
                        <Link to={"/products/" + p._id} className="btn btn-ghost btn-sm p-1.5" title="Dettaglio">
                          <Eye size={14}/>
                        </Link>
                        <button className="btn btn-ghost btn-sm p-1.5" title="Modifica"
                          onClick={() => openModal(p)}>
                          <Edit size={14}/>
                        </button>
                        <button className="btn btn-ghost btn-sm p-1.5 text-red-500" title="Elimina"
                          onClick={() => handleDelete(p)}>
                          <Trash2 size={14}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.products?.length && (
              <div className="py-12 text-center">
                <Package size={32} className="mx-auto text-gray-300 mb-3"/>
                <p className="text-gray-500 font-medium">Nessun prodotto trovato</p>
              </div>
            )}
          </div>
        )}
        {data?.pagination?.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-400">Pagina {data.pagination.page} di {data.pagination.pages}</p>
            <div className="flex gap-2">
              <button className="btn btn-sm btn-secondary" disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}>← Prec</button>
              <button className="btn btn-sm btn-secondary" disabled={page >= data.pagination.pages}
                onClick={() => setPage(p => p + 1)}>Succ →</button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {modal && (
          <ProductModal
            key={typeof modal === "string" ? "new" : modal._id}
            product={modal === "create" ? null : modal}
            categories={frozenCats}
            onClose={() => setModal(null)}
          />
        )}
        {movModal && (
          <MovementModal
            key={movModal._id}
            product={movModal}
            onClose={() => setMovModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
