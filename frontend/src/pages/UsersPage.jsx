/**
 * pages/UsersPage.jsx
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, X, ShieldCheck, User } from "lucide-react";
import { usersAPI } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { useAuthStore } from "@/lib/store";
import clsx from "clsx";

function UserModal({ user, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!user;
  const [form, setForm] = useState({ username: user?.username||"", name: user?.name||"", role: user?.role||"operatore", password: "" });
  const mut = useMutation({
    mutationFn: d => isEdit ? usersAPI.update(user._id, d) : usersAPI.create(d),
    onSuccess: () => { qc.invalidateQueries({queryKey:["users"]}); toast.success(isEdit ? "Utente aggiornato" : "Utente creato"); onClose(); },
    onError: e => toast.error(e.response?.data?.message || "Errore"),
  });
  const s = (k,v) => setForm(f=>({...f,[k]:v}));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{opacity:0,scale:.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.95}}
        className="relative z-10 w-full max-w-sm bg-white dark:bg-gray-900 rounded-[var(--radius-lg)] shadow-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">{isEdit ? "Modifica utente" : "Nuovo utente"}</h2>
          <button className="btn btn-ghost btn-sm p-1.5" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="p-5 space-y-3">
          {[["name","Nome completo"],["username","Username"]].map(([k,l]) => (
            <div key={k}><label className="form-label">{l}</label><input className="form-input" value={form[k]} onChange={e=>s(k,e.target.value)}/></div>
          ))}
          {!isEdit && (
            <div><label className="form-label">Password</label><input className="form-input" type="password" value={form.password} onChange={e=>s("password",e.target.value)}/></div>
          )}
          <div>
            <label className="form-label">Ruolo</label>
            <div className="grid grid-cols-2 gap-2">
              {[["admin","Admin"],["operatore","Operatore"]].map(([v,l]) => (
                <button key={v} type="button" onClick={() => s("role",v)}
                  className={clsx("btn btn-md gap-2", form.role===v ? "btn-primary" : "btn-secondary")}>
                  {v==="admin" ? <ShieldCheck size={14}/> : <User size={14}/>}{l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button className="btn btn-md btn-secondary flex-1" onClick={onClose}>Annulla</button>
            <button className="btn btn-md btn-primary flex-1" disabled={mut.isPending} onClick={() => mut.mutate(form)}>
              {mut.isPending ? "..." : "Salva"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function UsersPage() {
  const [modal, setModal] = useState(null);
  const qc = useQueryClient();
  const { user: me } = useAuthStore();
  const { data } = useQuery({ queryKey:["users"], queryFn: () => usersAPI.list().then(r=>r.data.users) });
  const delMut = useMutation({
    mutationFn: id => usersAPI.delete(id),
    onSuccess: () => { qc.invalidateQueries({queryKey:["users"]}); toast.success("Utente disabilitato"); },
  });
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Utenti</h1><p className="text-sm text-gray-500 mt-0.5">{data?.length||0} utenti</p></div>
        <button className="btn btn-md btn-primary gap-2" onClick={() => setModal("new")}><Plus size={16}/> Nuovo utente</button>
      </div>
      <div className="card overflow-hidden">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Utente</th><th>Username</th><th>Ruolo</th><th>Ultimo accesso</th><th>Stato</th><th></th></tr></thead>
            <tbody>
              {(data||[]).map(u => (
                <tr key={u._id}>
                  <td className="font-medium text-gray-900 dark:text-white">{u.name}</td>
                  <td><code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{u.username}</code></td>
                  <td><span className={clsx("badge", u.role==="admin" ? "badge-blue" : "badge-gray")}>{u.role==="admin" ? <ShieldCheck size={10}/> : <User size={10}/>}{u.role}</span></td>
                  <td className="text-gray-400 text-xs">{u.lastLogin ? new Date(u.lastLogin).toLocaleString("it-IT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "Mai"}</td>
                  <td><span className={clsx("badge", u.isActive ? "badge-green" : "badge-red")}>{u.isActive ? "Attivo" : "Disabilitato"}</span></td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn btn-ghost btn-sm p-1.5" onClick={() => setModal(u)}><Edit size={13}/></button>
                      {u._id !== me?._id && <button className="btn btn-ghost btn-sm p-1.5 text-red-500" onClick={() => { if(confirm("Disabilitare l'utente?")) delMut.mutate(u._id); }}><Trash2 size={13}/></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <AnimatePresence>
        {modal && <UserModal user={modal==="new" ? null : modal} onClose={() => setModal(null)}/>}
      </AnimatePresence>
    </div>
  );
}
