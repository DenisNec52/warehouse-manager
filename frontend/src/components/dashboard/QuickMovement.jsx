/**
 * components/dashboard/QuickMovement.jsx — entrata/uscita in tre tocchi:
 * tipo → articolo → quantità. Invio conferma, il cursore torna sulla ricerca.
 */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import clsx from "clsx";
import toast from "react-hot-toast";
import { movementsAPI, productsAPI } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export default function QuickMovement() {
  const qc = useQueryClient();
  const [type, setType] = useState("IN");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef();
  const qtyRef = useRef();
  const isIN = type === "IN";
  const q = useDebouncedValue(search.trim(), 250);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["products-search", q],
    queryFn: () => productsAPI.list({ search: q, limit: 8 }).then((r) => r.data.products || []),
    enabled: q.length > 1,
  });

  const mutation = useMutation({
    mutationFn: (d) => movementsAPI.create(d),
    onSuccess: () => {
      ["dashboard", "products", "movements"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`${isIN ? "Entrata" : "Uscita"} registrata — ${selected.name}`);
      setSelected(null); setSearch(""); setQuantity(""); setReason("");
      setTimeout(() => searchRef.current?.focus(), 100);
    },
    onError: (err) => toast.error(err.response?.data?.message || "Errore"),
  });

  const pick = (p) => {
    setSelected(p); setShowResults(false); setSearch("");
    setTimeout(() => qtyRef.current?.focus(), 50);
  };
  const reset = () => { setSelected(null); setTimeout(() => searchRef.current?.focus(), 50); };
  const qty = parseInt(quantity, 10);
  const insufficient = !isIN && selected && qty > selected.quantity;

  const submit = () => {
    if (!selected) return toast.error("Seleziona un articolo");
    if (!qty || qty < 1) return toast.error("Inserisci una quantità valida");
    mutation.mutate({ productId: selected._id, type, quantity: qty, reason });
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-white">Movimento rapido</h2>
        <span className="text-xs text-gray-400">Invio per confermare</span>
      </div>

      {/* Selettore tipo: grande, pensato per il pollice */}
      <div className="relative grid grid-cols-2 p-1 mb-4 rounded-(--radius) bg-gray-100 dark:bg-white/5">
        <span aria-hidden className={clsx(
          "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-[calc(var(--radius)-2px)] shadow-sm transition-all duration-300 ease-out",
          isIN ? "left-1 bg-emerald-500" : "left-[calc(50%+3px)] bg-rose-500")}/>
        {[["IN", "Entrata", ArrowDown], ["OUT", "Uscita", ArrowUp]].map(([t, label, Icon]) => (
          <button key={t} onClick={() => setType(t)} aria-pressed={type === t}
            className={clsx("relative z-10 h-11 flex items-center justify-center gap-2 text-sm font-bold transition-colors",
              type === t ? "text-white" : "text-gray-500 dark:text-gray-400")}>
            <Icon size={16}/> {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {selected ? (
          <div className="flex items-center gap-3 p-3 rounded-(--radius) bg-(--brand-50) border border-(--brand-100)">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{selected.name}</p>
              <p className="text-xs text-gray-500 font-mono">{selected.code} · disponibili <strong>{selected.quantity} {selected.unit}</strong></p>
            </div>
            <button onClick={reset} className="btn btn-ghost btn-sm w-8 px-0" aria-label="Cambia articolo"><X size={15}/></button>
          </div>
        ) : (
          <div className="relative">
            <Search size={15} className={clsx("absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none",
              isFetching ? "text-(--brand-500)" : "text-gray-400")}/>
            <input ref={searchRef} className="form-input pl-9 h-12" placeholder="Cerca articolo per nome o codice…"
              value={search} autoComplete="off" aria-label="Cerca articolo"
              onChange={(e) => { setSearch(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 150)}
              onKeyDown={(e) => { if (e.key === "Enter" && results[0]) pick(results[0]); }}/>
            {showResults && q.length > 1 && (
              <div className="absolute top-full inset-x-0 mt-1.5 card shadow-modal z-30 max-h-64 overflow-y-auto p-1">
                {results.length > 0 ? results.map((p) => (
                  <button key={p._id} onMouseDown={() => pick(p)}
                    className="w-full flex items-center justify-between gap-3 px-3 h-12 rounded-(--radius) text-left hover:bg-gray-50 dark:hover:bg-white/5">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</span>
                      <span className="block text-xs text-gray-400 font-mono">{p.code}</span>
                    </span>
                    <span className={clsx("text-sm font-bold tabular-nums shrink-0", p.quantity <= p.minQuantity ? "text-rose-500" : "text-gray-500")}>
                      {p.quantity} {p.unit}
                    </span>
                  </button>
                )) : (
                  <p className="px-3 py-4 text-sm text-gray-400 text-center">{isFetching ? "Ricerca…" : "Nessun articolo trovato"}</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-[120px_1fr] gap-3">
          <input ref={qtyRef} className={clsx("form-input h-12 text-lg font-bold tabular-nums text-center", insufficient && "border-rose-400")}
            inputMode="numeric" placeholder="Q.tà" value={quantity} aria-label="Quantità"
            onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && submit()}/>
          <input className="form-input h-12" placeholder={isIN ? "Nota (es. consegna fornitore)" : "Nota (es. utilizzo reparto)"}
            value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Nota"
            onKeyDown={(e) => e.key === "Enter" && submit()}/>
        </div>
        {insufficient && <p className="form-error">Disponibili solo {selected.quantity} {selected.unit}: il server rifiuterà l'uscita.</p>}

        <button disabled={!selected || !qty || mutation.isPending} onClick={submit}
          className={clsx("btn btn-lg w-full text-white", isIN ? "bg-emerald-500 hover:bg-emerald-600" : "bg-rose-500 hover:bg-rose-600")}>
          {mutation.isPending ? "Registrazione…" : isIN ? "Conferma entrata" : "Conferma uscita"}
        </button>
      </div>
    </div>
  );
}
