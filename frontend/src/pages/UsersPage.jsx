/**
 * pages/UsersPage.jsx — Gestione utenti (solo admin)
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, X, ShieldCheck, User, Eye, EyeOff } from "lucide-react";
import { usersAPI } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { useAuthStore } from "@/lib/store";
import clsx from "clsx";

function UserModal({ user, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!user;
  const [form, setForm] = useState({
    username: user?.username || "",
    name:     user?.name     || "",
    role:     user?.role     || "operatore",
    password: "",
  });
  const [showPw,   setShowPw]   = useState(false);
  const [changePw, setChangePw] = useState(false);

  const mut = useMutation({
    mutationFn: async (d) => {
      if (!isEdit) return usersAPI.create(d);
      await usersAPI.update(user._id, { name: d.name, role: d.role });
      if (changePw && d.password) {
        await usersAPI.resetPassword(user._id, { newPassword: d.password });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(isEdit ? "Utente aggiornato" : "Utente creato");
      onClose();
    },
    onError: e => toast.error(e.response?.data?.message || "Errore"),
  });

  const s = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.name.trim())     return toast.error("Nome obbligatorio");
    if (!form.username.trim()) return toast.error("Username obbligatorio");
    if (!isEdit && !form.password) return toast.error("Password obbligatoria");
    if (changePw && form.password.length < 6) return toast.error("Password minimo 6 caratteri");
    mut.mutate(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .95 }}
        className="relative z-10 w-full max-w-sm bg-white dark:bg-gray-900 rounded-[var(--radius-lg)] shadow-modal">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {isEdit ? "Modifica utente" : "Nuovo utente"}
          </h2>
          <button className="btn btn-ghost btn-sm p-1.5" onClick={onClose}><X size={16}/></button>
        </div>

        <div className="p-5 space-y-3">
          {/* Nome */}
          <div>
            <label className="form-label">Nome completo *</label>
            <input className="form-input" value={form.name}
              onChange={e => s("name", e.target.value)} placeholder="es. Mario Rossi"/>
          </div>

          {/* Username */}
          <div>
            <label className="form-label">Username *</label>
            <input
              className={clsx("form-input", isEdit && "opacity-60 cursor-not-allowed")}
              value={form.username}
              onChange={e => s("username", e.target.value)}
              disabled={isEdit}
              placeholder="es. mario.rossi"
            />
            {isEdit && <p className="text-xs text-gray-400 mt-1">Lo username non può essere modificato</p>}
          </div>

          {/* Password */}
          {!isEdit ? (
            <div>
              <label className="form-label">Password *</label>
              <div className="relative">
                <input className="form-input pr-10" type={showPw ? "text" : "password"}
                  value={form.password} onChange={e => s("password", e.target.value)}
                  placeholder="Minimo 6 caratteri"/>
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  onClick={() => setShowPw(v => !v)}>
                  {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="form-label mb-0">Password</label>
                <button type="button" className="text-xs text-blue-500 hover:underline"
                  onClick={() => { setChangePw(v => !v); s("password", ""); }}>
                  {changePw ? "Annulla" : "Cambia password"}
                </button>
              </div>
              {changePw && (
                <div className="relative">
                  <input className="form-input pr-10" type={showPw ? "text" : "password"}
                    value={form.password} onChange={e => s("password", e.target.value)}
                    placeholder="Nuova password (min 6 caratteri)"/>
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    onClick={() => setShowPw(v => !v)}>
                    {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Ruolo */}
          <div>
            <label className="form-label">Ruolo</label>
            <div className="grid grid-cols-2 gap-2">
              {[["admin","Admin"],["operatore","Operatore"]].map(([v,l]) => (
                <button key={v} type="button" onClick={() => s("role", v)}
                  className={clsx("btn btn-md gap-2", form.role === v ? "btn-primary" : "btn-secondary")}>
                  {v === "admin" ? <ShieldCheck size={14}/> : <User size={14}/>}{l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button className="btn btn-md btn-secondary flex-1" onClick={onClose}>Annulla</button>
            <button className="btn btn-md btn-primary flex-1" disabled={mut.isPending} onClick={handleSubmit}>
              {mut.isPending ? "Salvataggio..." : (isEdit ? "Aggiorna" : "Crea utente")}
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

  const { data } = useQuery({
    queryKey: ["users"],
    queryFn:  () => usersAPI.list().then(r => r.data.users),
  });

  const delMut = useMutation({
    mutationFn: id => usersAPI.delete(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("Utente disabilitato"); },
    onError:    () => toast.error("Errore"),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Utenti</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.length || 0} utenti nel sistema</p>
        </div>
        <button className="btn btn-md btn-primary gap-2" onClick={() => setModal("new")}>
          <Plus size={16}/> Nuovo utente
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Utente</th><th>Username</th><th>Ruolo</th>
                <th>Ultimo accesso</th><th>Stato</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(data || []).map(u => (
                <tr key={u._id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ background: u.role === "admin" ? "#3b82f6" : "#6b7280" }}>
                        {u.name?.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900 dark:text-white">{u.name}</span>
                    </div>
                  </td>
                  <td>
                    <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                      {u.username}
                    </code>
                  </td>
                  <td>
                    <span className={clsx("badge", u.role === "admin" ? "badge-blue" : "badge-gray")}>
                      {u.role === "admin" ? <ShieldCheck size={10}/> : <User size={10}/>}
                      {u.role}
                    </span>
                  </td>
                  <td className="text-gray-400 text-xs">
                    {u.lastLogin
                      ? new Date(u.lastLogin).toLocaleString("it-IT", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })
                      : "Mai effettuato"}
                  </td>
                  <td>
                    <span className={clsx("badge", u.isActive ? "badge-green" : "badge-red")}>
                      {u.isActive ? "Attivo" : "Disabilitato"}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn btn-ghost btn-sm p-1.5" title="Modifica"
                        onClick={() => setModal(u)}>
                        <Edit size={13}/>
                      </button>
                      {u._id !== me?._id && u.role !== "admin" && (
                        <button className="btn btn-ghost btn-sm p-1.5 text-red-500" title="Disabilita"
                          onClick={() => { if (confirm("Disabilitare " + u.name + "?")) delMut.mutate(u._id); }}>
                          <Trash2 size={13}/>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.length && (
          <div className="py-12 text-center">
            <User size={32} className="mx-auto text-gray-300 mb-3"/>
            <p className="text-gray-500 font-medium">Nessun utente trovato</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {modal && (
          <UserModal
            user={modal === "new" ? null : modal}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
