/**
 * pages/DepartmentsPage.jsx — Reparti / postazioni (solo admin)
 *
 * Condivisi da Pulizia 5S, Tempi standard e Andon Board, e usati per i gruppi utenti.
 * Si disattivano invece di eliminarli: lo storico continua a riferirli.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Power, ArrowUp, ArrowDown, X, Factory } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import clsx from "clsx";
import { departmentsAPI } from "@/lib/api";
import { useDepartmentList } from "@/hooks/useDepartments";

const errorMessage = (e) => e.response?.data?.errors?.[0]?.message || e.response?.data?.message || "Errore";

function DepartmentModal({ dept, onClose }) {
  const qc = useQueryClient();
  const [name, setName] = useState(dept?.name || "");
  const mut = useMutation({
    mutationFn: () => dept
      ? departmentsAPI.update(dept._id, { name, order: dept.order, isActive: dept.isActive })
      : departmentsAPI.create({ name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      toast.success(dept ? "Reparto aggiornato" : "Reparto creato");
      onClose();
    },
    onError: e => toast.error(errorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{opacity:0,scale:.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.95}}
        className="relative z-10 w-full max-w-sm bg-white dark:bg-gray-900 rounded-[var(--radius-lg)] shadow-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">{dept ? "Modifica reparto" : "Nuovo reparto"}</h2>
          <button className="btn btn-ghost btn-sm p-1.5" onClick={onClose} aria-label="Chiudi"><X size={16}/></button>
        </div>
        <form className="p-5 space-y-4" onSubmit={e => { e.preventDefault(); if (name.trim()) mut.mutate(); }}>
          <div>
            <label className="form-label" htmlFor="department-name">Nome reparto *</label>
            <input id="department-name" className="form-input" placeholder="es. Verniciatura" autoFocus maxLength={60}
              value={name} onChange={e => setName(e.target.value)}/>
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn btn-md btn-secondary flex-1" onClick={onClose}>Annulla</button>
            <button type="submit" className="btn btn-md btn-primary flex-1" disabled={mut.isPending || !name.trim()}>
              {mut.isPending ? "..." : "Salva"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default function DepartmentsPage() {
  const qc = useQueryClient();
  const { data: departments = [], isLoading } = useDepartmentList();
  const [modal, setModal] = useState(null);

  const upd = useMutation({
    mutationFn: ({ id, data }) => departmentsAPI.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }),
    onError: e => toast.error(errorMessage(e)),
  });

  const save = (d, changes) => upd.mutate({ id: d._id, data: { name: d.name, order: d.order, isActive: d.isActive, ...changes } });

  // Scambia con il vicino; con ordini uguali usa le posizioni in lista, altrimenti lo scambio non cambierebbe nulla.
  const move = (i, direction) => {
    const a = departments[i], b = departments[i + direction];
    if (!b) return;
    const [orderA, orderB] = a.order === b.order ? [i, i + direction] : [a.order, b.order];
    save(a, { order: orderB });
    save(b, { order: orderA });
  };

  const toggle = (d) => {
    if (d.isActive && !confirm(`Disattivare "${d.name}"? Non comparirà più nei menu, lo storico resta.`)) return;
    save(d, { isActive: !d.isActive });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Reparti</h1>
          <p className="text-sm text-gray-500 mt-0.5">Postazioni condivise da Pulizia 5S, Tempi standard e Andon Board</p>
        </div>
        <button className="btn btn-md btn-primary gap-2" onClick={() => setModal("new")}><Plus size={16}/> Nuovo</button>
      </div>

      {isLoading ? (
        <div className="p-8 flex justify-center"><div className="w-6 h-6 border-2 border-[var(--brand-500)] border-t-transparent rounded-full animate-spin"/></div>
      ) : (
        <div className="card divide-y divide-gray-100 dark:divide-gray-800">
          {departments.map((d, i) => (
            <div key={d._id} className={clsx("flex items-center gap-3 px-4 py-3", !d.isActive && "opacity-50")}>
              <Factory size={16} className="text-gray-400 shrink-0"/>
              <span className="flex-1 font-medium text-gray-900 dark:text-white">
                {d.name}
                {!d.isActive && <span className="badge badge-gray ml-2">Disattivato</span>}
              </span>
              <div className="flex gap-1">
                <button className="btn btn-ghost btn-sm p-1.5" aria-label="Sposta su" disabled={i === 0 || upd.isPending} onClick={() => move(i, -1)}><ArrowUp size={14}/></button>
                <button className="btn btn-ghost btn-sm p-1.5" aria-label="Sposta giù" disabled={i === departments.length - 1 || upd.isPending} onClick={() => move(i, 1)}><ArrowDown size={14}/></button>
                <button className="btn btn-ghost btn-sm p-1.5" aria-label="Modifica" onClick={() => setModal(d)}><Edit size={14}/></button>
                <button className={clsx("btn btn-ghost btn-sm p-1.5", d.isActive ? "text-red-500" : "text-green-600")}
                  aria-label={d.isActive ? "Disattiva" : "Riattiva"} onClick={() => toggle(d)}><Power size={14}/></button>
              </div>
            </div>
          ))}
          {!departments.length && <div className="py-12 text-center text-gray-400">Nessun reparto</div>}
        </div>
      )}

      <AnimatePresence>
        {modal && <DepartmentModal dept={modal === "new" ? null : modal} onClose={() => setModal(null)}/>}
      </AnimatePresence>
    </div>
  );
}
