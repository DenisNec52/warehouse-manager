/**
 * pages/MovementsPage.jsx — Storico movimenti con filtri
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { X, Pencil, Undo2 } from "lucide-react";
import toast from "react-hot-toast";
import { movementsAPI } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { movementInfo, fmtDateTime } from "@/lib/format";
import MovementTypeBadge from "@/components/ui/MovementTypeBadge";
import clsx from "clsx";

// Dati che dipendono dalla giacenza: vanno riletti dopo una correzione/annullamento.
const STOCK_QUERIES = [["movements"], ["dashboard"], ["products"], ["product"]];

// ── Correzione di un movimento (solo admin) ───────────────────
function MovementEditModal({ movement, info, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    type:      movement.type,
    quantity:  String(movement.quantity),
    reason:    movement.reason || "",
    note:      movement.note || "",
    reference: movement.reference || "",
  });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const qty = Number(form.quantity);
  const validQty = Number.isInteger(qty) && qty >= 1;

  const mut = useMutation({
    mutationFn: () => movementsAPI.update(movement._id, { ...form, quantity: qty }),
    onSuccess: (res) => {
      STOCK_QUERIES.forEach(queryKey => qc.invalidateQueries({ queryKey }));
      toast.success(`Movimento corretto — giacenza: ${res.data.quantity} ${info.unit}`);
      onClose();
    },
    onError: e => toast.error(e.response?.data?.errors?.[0]?.message || e.response?.data?.message || "Errore"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{opacity:0,scale:.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.95}}
        className="relative z-10 w-full max-w-sm bg-white dark:bg-gray-900 rounded-[var(--radius-lg)] shadow-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">Correggi movimento</h2>
          <button className="btn btn-ghost btn-sm p-1.5" onClick={onClose} aria-label="Chiudi"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-500">{info.name} <span className="font-mono text-xs">{info.code}</span></p>
          <div className="grid grid-cols-2 gap-2">
            {[["IN","Entrata"],["OUT","Uscita"]].map(([v,l]) => (
              <button key={v} type="button" onClick={() => setForm(f => ({ ...f, type: v }))}
                className={clsx("btn btn-md", form.type === v ? (v === "IN" ? "bg-green-600 text-white" : "bg-red-600 text-white") : "btn-secondary")}>
                {l}
              </button>
            ))}
          </div>
          <div>
            <label className="form-label">Quantità ({info.unit})</label>
            <input type="number" min="1" className="form-input" value={form.quantity} onChange={set("quantity")}/>
          </div>
          <div>
            <label className="form-label">Motivazione</label>
            <input className="form-input" value={form.reason} onChange={set("reason")}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Riferimento</label>
              <input className="form-input" value={form.reference} onChange={set("reference")}/>
            </div>
            <div>
              <label className="form-label">Note</label>
              <input className="form-input" value={form.note} onChange={set("note")}/>
            </div>
          </div>
          <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
            La giacenza del prodotto verrà ricalcolata in base alla correzione.
          </p>
          <div className="flex gap-3">
            <button type="button" className="btn btn-md btn-secondary flex-1" onClick={onClose}>Annulla</button>
            <button type="button" className="btn btn-md btn-primary flex-1" disabled={mut.isPending || !validQty} onClick={() => mut.mutate()}>
              {mut.isPending ? "..." : "Salva"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function MovementsPage() {
  const [type, setType]   = useState("");
  const [page, setPage]   = useState(1);
  const [editing, setEditing] = useState(null);
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["movements", { type, page }],
    queryFn:  () => movementsAPI.list({ type: type||undefined, page, limit:30 }).then(r => r.data),
  });

  const cancelMut = useMutation({
    mutationFn: (m) => movementsAPI.remove(m._id),
    onSuccess: (res, m) => {
      STOCK_QUERIES.forEach(queryKey => qc.invalidateQueries({ queryKey }));
      toast.success(`Movimento annullato — giacenza: ${res.data.quantity} ${movementInfo(m).unit}`);
    },
    onError: e => toast.error(e.response?.data?.message || "Errore"),
  });
  const askCancel = (m) => {
    const info = movementInfo(m);
    const verb = m.type === "IN" ? "l'entrata" : "l'uscita";
    if (confirm(`Annullare ${verb} di ${m.quantity} ${info.unit} di "${info.name}"?\nLa giacenza verrà ripristinata e il movimento eliminato dallo storico.`))
      cancelMut.mutate(m);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Movimenti</h1>
        <p className="text-sm text-gray-500 mt-0.5">Storico completo entrate e uscite</p>
      </div>

      <div className="card p-3 mb-4 flex gap-3 flex-wrap">
        <div className="flex gap-2">
          {[["","Tutti"],["IN","Entrate"],["OUT","Uscite"]].map(([v,l]) => (
            <button key={v} onClick={() => { setType(v); setPage(1); }}
              className={clsx("btn btn-md", type===v ? "btn-primary" : "btn-secondary")}>{l}</button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center"><div className="w-6 h-6 border-2 border-[var(--brand-500)] border-t-transparent rounded-full animate-spin"/></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Prodotto</th><th>Tipo</th><th>Qtà</th><th>Prima/Dopo</th><th>Motivazione</th><th>Operatore</th><th>Data</th>{isAdmin && <th/>}</tr></thead>
              <tbody>
                {(data?.movements||[]).map(m => {
                  const info = movementInfo(m);
                  return (
                    <tr key={m._id}>
                      <td>
                        <div className="font-medium text-gray-900 dark:text-white">{info.name}</div>
                        <code className="text-xs text-gray-400">{info.code}</code>
                      </td>
                      <td><MovementTypeBadge type={m.type}/></td>
                      <td className="font-semibold tabular-nums">{m.quantity} {info.unit}</td>
                      <td className="text-xs tabular-nums text-gray-500">{m.quantityBefore} → <strong className={m.type==="IN"?"text-green-600":"text-red-600"}>{m.quantityAfter}</strong></td>
                      <td className="text-gray-500 text-sm">{m.reason || m.note || "—"}</td>
                      <td className="text-gray-500 text-sm">{info.performer}</td>
                      <td className="text-gray-400 text-xs">
                        {fmtDateTime(m.createdAt)}
                        {m.correctedAt && (
                          <div className="text-amber-600" title={`Corretto il ${fmtDateTime(m.correctedAt)}`}>
                            corretto da {m.correctedByName}
                          </div>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="text-right whitespace-nowrap">
                          <button className="btn btn-ghost btn-sm p-1.5" aria-label="Correggi movimento" title="Correggi"
                            onClick={() => setEditing(m)}><Pencil size={13}/></button>
                          <button className="btn btn-ghost btn-sm p-1.5 text-red-500" aria-label="Annulla movimento" title="Annulla"
                            disabled={cancelMut.isPending} onClick={() => askCancel(m)}><Undo2 size={13}/></button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!data?.movements?.length && <div className="py-12 text-center text-gray-400">Nessun movimento trovato</div>}
          </div>
        )}
        {data?.pagination?.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-400">Pagina {data.pagination.page} di {data.pagination.pages}</p>
            <div className="flex gap-2">
              <button className="btn btn-sm btn-secondary" disabled={page<=1} onClick={() => setPage(p=>p-1)}>← Prec</button>
              <button className="btn btn-sm btn-secondary" disabled={page>=data.pagination.pages} onClick={() => setPage(p=>p+1)}>Succ →</button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {editing && <MovementEditModal movement={editing} info={movementInfo(editing)} onClose={() => setEditing(null)}/>}
      </AnimatePresence>
    </div>
  );
}
