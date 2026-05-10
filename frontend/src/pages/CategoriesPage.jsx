/**
 * pages/CategoriesPage.jsx
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { categoriesAPI } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";

const COLORS = ["#3b82f6","#10b981","#f97316","#ef4444","#8b5cf6","#06b6d4","#f59e0b","#ec4899"];
const ICONS  = ["📦","🔩","⚡","🔧","🦺","🧪","📋","🏭","🛠️","📐","🔌","💡"];

function CategoryModal({ cat, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: cat?.name||"", description: cat?.description||"", color: cat?.color||"#3b82f6", icon: cat?.icon||"📦" });
  const mut = useMutation({
    mutationFn: d => cat ? categoriesAPI.update(cat._id, d) : categoriesAPI.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey:["categories"] }); toast.success(cat ? "Aggiornata" : "Creata"); onClose(); },
    onError: e => toast.error(e.response?.data?.message || "Errore"),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{opacity:0,scale:.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.95}}
        className="relative z-10 w-full max-w-sm bg-white dark:bg-gray-900 rounded-[var(--radius-lg)] shadow-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">{cat ? "Modifica categoria" : "Nuova categoria"}</h2>
          <button className="btn btn-ghost btn-sm p-1.5" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="form-label">Nome *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="es. Bulloneria"/>
          </div>
          <div>
            <label className="form-label">Icona</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ICONS.map(ic => <button key={ic} type="button" onClick={() => setForm(f=>({...f,icon:ic}))}
                className={`w-9 h-9 rounded text-lg flex items-center justify-center transition-all ${form.icon===ic?"ring-2 ring-[var(--brand-500)] bg-[var(--brand-50)] dark:bg-[var(--brand-500)]/20 scale-110":"hover:bg-gray-100 dark:hover:bg-gray-700"}`}>{ic}</button>)}
            </div>
          </div>
          <div>
            <label className="form-label">Colore</label>
            <div className="flex gap-2 flex-wrap mt-1">
              {COLORS.map(c => <button key={c} type="button" onClick={() => setForm(f=>({...f,color:c}))}
                className={`w-8 h-8 rounded-full transition-all ${form.color===c?"ring-2 ring-offset-2 ring-gray-400 scale-110":"hover:scale-105"}`} style={{background:c}}/>)}
            </div>
          </div>
          <div className="flex gap-3">
            <button className="btn btn-md btn-secondary flex-1" onClick={onClose}>Annulla</button>
            <button className="btn btn-md btn-primary flex-1" disabled={mut.isPending||!form.name} onClick={() => mut.mutate(form)}>
              {mut.isPending ? "..." : "Salva"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function CategoriesPage() {
  const [modal, setModal] = useState(null);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey:["categories"], queryFn: () => categoriesAPI.list().then(r=>r.data.categories) });
  const delMut = useMutation({
    mutationFn: id => categoriesAPI.delete(id),
    onSuccess: () => { qc.invalidateQueries({queryKey:["categories"]}); toast.success("Categoria eliminata"); },
  });
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Categorie</h1><p className="text-sm text-gray-500 mt-0.5">{data?.length||0} categorie</p></div>
        <button className="btn btn-md btn-primary gap-2" onClick={() => setModal("new")}><Plus size={16}/> Nuova</button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data||[]).map(c => (
          <div key={c._id} className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--radius-sm)] flex items-center justify-center text-xl shrink-0" style={{background:c.color+"20"}}>{c.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
              {c.description && <p className="text-xs text-gray-400 truncate mt-0.5">{c.description}</p>}
            </div>
            <div className="flex gap-1">
              <button className="btn btn-ghost btn-sm p-1.5" onClick={() => setModal(c)}><Edit size={13}/></button>
              <button className="btn btn-ghost btn-sm p-1.5 text-red-500" onClick={() => { if(confirm("Elimina?")) delMut.mutate(c._id); }}><Trash2 size={13}/></button>
            </div>
          </div>
        ))}
      </div>
      <AnimatePresence>
        {modal && <CategoryModal cat={modal==="new" ? null : modal} onClose={() => setModal(null)}/>}
      </AnimatePresence>
    </div>
  );
}
