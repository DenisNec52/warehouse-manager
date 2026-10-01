/**
 * pages/UsersPage.jsx — Gestione utenti (admin e supervisore)
 *
 * Il backend applica gerarchia e permessi (routes/users.js); qui si nascondono
 * soltanto le azioni che verrebbero rifiutate.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Ban, RotateCcw, X, ShieldCheck, User, Eye, EyeOff, MapPin, QrCode, Crown, List, Network, Search } from "lucide-react";
import { usersAPI } from "@/lib/api";
import { m as motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { useAuthStore } from "@/lib/store";
import BadgeManager from "@/components/ui/BadgeManager";
import { useDepartmentList } from "@/hooks/useDepartments";
import UserHierarchy from "@/components/users/UserHierarchy";
import clsx from "clsx";

// Etichette turni, usate anche nel modale e nella tabella
export const SHIFTS = [["turno1", "Turno 1"], ["turno2", "Turno 2"], ["centrale", "Turno centrale"]];
export const shiftLabel = (s) => SHIFTS.find(([v]) => v === s)?.[1] || "Non assegnato";

function BadgeModal({ user, onClose }) {
  const qc = useQueryClient();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .95 }}
        className="relative z-10 w-full max-w-md">
        <div className="flex items-center justify-between px-1 pb-2">
          <h2 className="font-semibold text-gray-900 dark:text-white">Badge di {user.name}</h2>
          <button className="btn btn-ghost btn-sm p-1.5 bg-white dark:bg-gray-900 rounded-full" onClick={onClose}><X size={16}/></button>
        </div>
        <BadgeManager
          badgeEnabled={user.badgeEnabled}
          badgeIssuedAt={user.badgeIssuedAt}
          onRegenerate={() => usersAPI.regenerateBadge(user._id)}
          onToggle={(enabled) => usersAPI.badgeStatus(user._id, enabled)}
          onRevoke={() => usersAPI.revokeBadge(user._id)}
          onInvalidate={() => qc.invalidateQueries({ queryKey: ["users"] })}
        />
      </motion.div>
    </div>
  );
}

/** Caselle di spunta per scegliere più reparti. */
function DepartmentChecks({ departments, value, onChange }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {departments.map(d => (
        <label key={d._id} className={clsx("flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-sm)] border text-sm cursor-pointer transition-colors",
          value.includes(d._id) ? "border-[var(--brand-500)] bg-[var(--brand-50)] dark:bg-[var(--brand-500)]/15 text-gray-900 dark:text-white" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300")}>
          <input type="checkbox" className="accent-[var(--brand-500)]" checked={value.includes(d._id)} onChange={() => toggle(d._id)}/>
          {d.name}
        </label>
      ))}
    </div>
  );
}

function UserModal({ user, me, departments, users = [], onClose }) {
  const qc = useQueryClient();
  const isEdit = !!user;
  const isSuperAdmin = !!user?.isSuperAdmin;
  const [form, setForm] = useState({
    username: user?.username || "",
    name:     user?.name     || "",
    email:    user?.email    || "",
    role:     user?.role     || "operatore",
    password: "",
    departments: (user?.departments || []).map(String),
    shift:      user?.shift || "",
    supervisor: user?.supervisor ? String(user.supervisor) : "",
  });
  // Solo admin/super-admin assegnano il supervisore (il backend rifiuta gli altri)
  const canSetSupervisor = me?.role === "admin";
  const supervisors = users.filter(u => u.role === "supervisore");
  // Visibilità personalizzata: null = come i gruppi
  const [customVisible, setCustomVisible] = useState(Array.isArray(user?.visibleDepartments));
  const [visible, setVisible] = useState((user?.visibleDepartments || user?.departments || []).map(String));
  const [showPw,   setShowPw]   = useState(false);
  const [changePw, setChangePw] = useState(false);

  const roles = [
    ...(me?.role === "admin" ? [["admin", "Admin", ShieldCheck]] : []),
    ["supervisore", "Supervisore", ShieldCheck],
    ["operatore",   "Operatore",   User],
  ];
  const isOperator = form.role === "operatore";

  const mut = useMutation({
    mutationFn: async (d) => {
      const deptFields = {
        departments: d.departments,
        // Solo gli operatori hanno visibilità limitata: per gli altri ruoli si azzera l'eccezione
        visibleDepartments: isOperator && customVisible ? visible : null,
      };
      // Turno e supervisore solo per gli operatori; il supervisore solo se chi modifica è admin
      const staffFields = {};
      if (isOperator) {
        staffFields.shift = d.shift || "";
        if (canSetSupervisor) staffFields.supervisor = d.supervisor || null;
      } else {
        staffFields.shift = "";
        if (canSetSupervisor) staffFields.supervisor = null;
      }
      if (!isEdit) return usersAPI.create({ username: d.username, password: d.password, name: d.name, email: d.email, role: d.role, ...deptFields, ...staffFields });
      await usersAPI.update(user._id, { name: d.name, email: d.email, ...(isSuperAdmin ? {} : { role: d.role }), ...deptFields, ...staffFields });
      if (changePw && d.password) await usersAPI.resetPassword(user._id, { newPassword: d.password });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(isEdit ? "Utente aggiornato" : "Utente creato");
      onClose();
    },
    onError: e => toast.error(e.response?.data?.errors?.[0]?.message || e.response?.data?.message || "Errore"),
  });

  const s = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isSelf = isEdit && String(user._id) === String(me?.id);
  const minPw = isEdit ? 8 : 6;   // il reset password lato server richiede 8 caratteri

  const handleSubmit = () => {
    if (!form.name.trim())     return toast.error("Nome obbligatorio");
    if (!form.username.trim()) return toast.error("Username obbligatorio");
    if (!isEdit && form.password.length < 6) return toast.error("Password minimo 6 caratteri");
    if (changePw && form.password.length < minPw) return toast.error(`Password minimo ${minPw} caratteri`);
    mut.mutate(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .95 }}
        className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-[var(--radius-lg)] shadow-modal">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">{isEdit ? "Modifica utente" : "Nuovo utente"}</h2>
          <button className="btn btn-ghost btn-sm p-1.5" onClick={onClose} aria-label="Chiudi"><X size={16}/></button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="form-label">Nome completo *</label>
            <input className="form-input" value={form.name} onChange={e => s("name", e.target.value)} placeholder="es. Mario Rossi"/>
          </div>

          <div>
            <label className="form-label">Email <span className="text-gray-400 font-normal text-xs">(opzionale — per password dimenticata)</span></label>
            <input className="form-input" type="email" value={form.email} onChange={e => s("email", e.target.value)} placeholder="mario.rossi@azienda.it"/>
          </div>

          <div>
            <label className="form-label">Username *</label>
            <input className={clsx("form-input", isEdit && "opacity-60 cursor-not-allowed")} value={form.username}
              onChange={e => s("username", e.target.value)} disabled={isEdit} placeholder="es. mario.rossi"/>
            {isEdit && <p className="text-xs text-gray-400 mt-1">Lo username non può essere modificato</p>}
          </div>

          {!isEdit ? (
            <div>
              <label className="form-label">Password *</label>
              <div className="relative">
                <input className="form-input pr-10" type={showPw ? "text" : "password"} value={form.password}
                  onChange={e => s("password", e.target.value)} placeholder="Minimo 6 caratteri"/>
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowPw(v => !v)}>
                  {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
            </div>
          ) : isSelf ? (
            <p className="text-xs text-gray-400">La tua password la cambi da Impostazioni.</p>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="form-label mb-0">Password</label>
                <button type="button" className="text-xs text-blue-500 hover:underline" onClick={() => { setChangePw(v => !v); s("password", ""); }}>
                  {changePw ? "Annulla" : "Cambia password"}
                </button>
              </div>
              {changePw && (
                <div className="relative">
                  <input className="form-input pr-10" type={showPw ? "text" : "password"} value={form.password}
                    onChange={e => s("password", e.target.value)} placeholder="Nuova password (min 8 caratteri)"/>
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowPw(v => !v)}>
                    {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
              )}
            </div>
          )}

          {isSuperAdmin ? (
            <p className="text-xs text-gray-500 flex items-center gap-1.5"><Crown size={13} className="text-amber-500"/> Super-admin: il ruolo non è modificabile.</p>
          ) : (
            <div>
              <label className="form-label">Ruolo</label>
              <div className={clsx("grid gap-2", roles.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                {roles.map(([v, l, Icon]) => (
                  <button key={v} type="button" onClick={() => s("role", v)}
                    className={clsx("btn btn-md gap-1.5", form.role === v ? "btn-primary" : "btn-secondary")}>
                    <Icon size={14}/>{l}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="form-label">Reparti (gruppi)</label>
            <DepartmentChecks departments={departments} value={form.departments} onChange={v => s("departments", v)}/>
            <p className="text-xs text-gray-400 mt-1">
              {!isOperator
                ? "Admin e supervisori vedono comunque tutti i reparti: il gruppo serve per il reparto proposto di default."
                : form.departments.length || customVisible
                  ? "L'operatore vede solo i reparti dei suoi gruppi (salvo eccezione qui sotto)."
                  : "Nessun reparto: finché non ne assegni uno, l'operatore vede tutti i reparti."}
            </p>
          </div>

          {isOperator && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Turno</label>
                <select className="form-input" value={form.shift} onChange={e => s("shift", e.target.value)}>
                  <option value="">Non assegnato</option>
                  {SHIFTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Supervisore</label>
                <select className="form-input disabled:opacity-60" value={form.supervisor}
                  disabled={!canSetSupervisor} onChange={e => s("supervisor", e.target.value)}>
                  <option value="">Nessuno</option>
                  {supervisors.map(sv => <option key={sv._id} value={sv._id}>{sv.name}</option>)}
                </select>
                {!canSetSupervisor && <p className="text-xs text-gray-400 mt-1">Solo un admin può assegnarlo.</p>}
              </div>
            </div>
          )}

          {isOperator && (
            <div className="rounded-[var(--radius)] border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" className="accent-[var(--brand-500)]" checked={customVisible}
                  onChange={e => { setCustomVisible(e.target.checked); if (e.target.checked && !visible.length) setVisible(form.departments); }}/>
                Visibilità personalizzata
              </label>
              {customVisible ? (
                <>
                  <DepartmentChecks departments={departments} value={visible} onChange={setVisible}/>
                  {!visible.length && <p className="text-xs text-amber-600">Nessun reparto selezionato: l'operatore non vedrà Tempi standard, Andon Board né 5S.</p>}
                </>
              ) : (
                <p className="text-xs text-gray-400">Vede i reparti dei suoi gruppi. Attiva per un'eccezione solo per questo utente.</p>
              )}
            </div>
          )}

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
  const [badgeUser, setBadgeUser] = useState(null);
  const [view, setView] = useState("list");                 // "list" | "tree"
  const [filters, setFilters] = useState({ search: "", role: "", department: "", shift: "" });
  const qc = useQueryClient();
  const { user: me } = useAuthStore();
  const { data: allDepartments = [] } = useDepartmentList();
  const activeDepartments = allDepartments.filter(d => d.isActive);
  const deptName = (id) => allDepartments.find(d => d._id === String(id))?.name || "?";

  // Stesse regole del backend: il super-admin lo gestisce solo lui, gli admin solo un admin
  const isMe = (u) => String(u._id) === String(me?.id);
  const canManage = (u) => (u.isSuperAdmin ? isMe(u) : u.role !== "admin" || me?.role === "admin");

  const { data } = useQuery({
    queryKey: ["users"],
    queryFn:  () => usersAPI.list().then(r => r.data.users),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, isActive }) => usersAPI.setActive(id, isActive),
    onSuccess:  (_r, { isActive }) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(isActive ? "Utente riattivato" : "Utente disabilitato");
    },
    onError: e => toast.error(e.response?.data?.message || "Errore"),
  });

  const delMut = useMutation({
    mutationFn: id => usersAPI.delete(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("Utente eliminato definitivamente"); },
    onError:    e => toast.error(e.response?.data?.message || "Errore"),
  });

  // Filtri applicati lato client (dataset piccolo, solo admin/supervisori). Il super-admin
  // è già escluso dal backend per chi non è lui.
  const q = filters.search.trim().toLowerCase();
  const filtered = (data || []).filter(u =>
    (!q || u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q)) &&
    (!filters.role || u.role === filters.role) &&
    (!filters.shift || u.shift === filters.shift) &&
    (!filters.department || (u.departments || []).map(String).includes(filters.department))
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Utenti</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.length || 0} utenti nel sistema</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Selettore vista: Elenco / Gerarchia */}
          <div className="inline-flex rounded-[var(--radius)] border border-gray-200 dark:border-gray-700 overflow-hidden" role="tablist">
            <button role="tab" aria-selected={view === "list"} onClick={() => setView("list")}
              className={clsx("btn btn-sm gap-1.5 rounded-none border-0", view === "list" ? "btn-primary" : "btn-ghost")}>
              <List size={15}/> Elenco
            </button>
            <button role="tab" aria-selected={view === "tree"} onClick={() => setView("tree")}
              className={clsx("btn btn-sm gap-1.5 rounded-none border-0", view === "tree" ? "btn-primary" : "btn-ghost")}>
              <Network size={15}/> Gerarchia
            </button>
          </div>
          <button className="btn btn-md btn-primary gap-2" onClick={() => setModal("new")}>
            <Plus size={16}/> Nuovo utente
          </button>
        </div>
      </div>

      {view === "list" && (
        <div className="card p-3 mb-4 flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input className="form-input pl-9 py-2 text-sm" placeholder="Cerca per nome o username..."
              value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}/>
          </div>
          <select className="form-input py-2 text-sm w-auto" value={filters.role} onChange={e => setFilters(f => ({ ...f, role: e.target.value }))}>
            <option value="">Tutti i ruoli</option>
            <option value="admin">Admin</option>
            <option value="supervisore">Supervisore</option>
            <option value="operatore">Operatore</option>
          </select>
          <select className="form-input py-2 text-sm w-auto" value={filters.department} onChange={e => setFilters(f => ({ ...f, department: e.target.value }))}>
            <option value="">Tutti i reparti</option>
            {activeDepartments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
          <select className="form-input py-2 text-sm w-auto" value={filters.shift} onChange={e => setFilters(f => ({ ...f, shift: e.target.value }))}>
            <option value="">Tutti i turni</option>
            {SHIFTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      )}

      {view === "tree" ? (
        <div className="card overflow-hidden">
          <UserHierarchy users={data || []} />
        </div>
      ) : (
      <div className="card overflow-hidden">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Utente</th><th>Username</th><th>Ruolo</th><th>Reparti</th>
                <th>Ultimo accesso</th><th>Accesso da</th><th>Stato</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u._id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ background: u.role === "admin" ? "#3b82f6" : u.role === "supervisore" ? "#8b5cf6" : "#6b7280" }}>
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
                    <span className={clsx("badge", u.role === "admin" ? "badge-blue" : u.role === "supervisore" ? "badge-purple" : "badge-gray")}>
                      {u.role !== "operatore" ? <ShieldCheck size={10}/> : <User size={10}/>}
                      {u.role}
                    </span>
                    {u.isSuperAdmin && (
                      <span className="badge badge-yellow ml-1" title="Nessun altro admin può modificarlo o eliminarlo"><Crown size={10}/> super-admin</span>
                    )}
                  </td>
                  <td className="text-xs">
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {(u.departments || []).map(id => <span key={id} className="badge badge-gray">{deptName(id)}</span>)}
                    </div>
                    {u.role === "operatore" && Array.isArray(u.visibleDepartments) && (
                      <p className="text-amber-600 mt-1" title={u.visibleDepartments.map(deptName).join(", ") || "nessun reparto"}>
                        Visibilità personalizzata ({u.visibleDepartments.length})
                      </p>
                    )}
                    {u.role === "operatore" && !u.departments?.length && !Array.isArray(u.visibleDepartments) && (
                      <p className="text-gray-400">Nessuno: vede tutti</p>
                    )}
                    {u.role !== "operatore" && <p className="text-gray-400 mt-0.5">Vede tutti</p>}
                  </td>
                  <td className="text-gray-400 text-xs">
                    {u.lastLogin
                      ? new Date(u.lastLogin).toLocaleString("it-IT", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })
                      : "Mai effettuato"}
                  </td>
                  <td className="text-gray-400 text-xs">
                    {u.lastLoginIP ? (
                      <>
                        <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{u.lastLoginIP}</code>
                        {u.lastLoginLocation && (
                          <span className="flex items-center gap-1 mt-0.5">
                            <MapPin size={10}/> {u.lastLoginLocation}
                          </span>
                        )}
                      </>
                    ) : "—"}
                  </td>
                  <td>
                    <span className={clsx("badge", u.isActive ? "badge-green" : "badge-red")}>
                      {u.isActive ? "Attivo" : "Disabilitato"}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {canManage(u) && (
                        <button className="btn btn-ghost btn-sm p-1.5" title="Modifica"
                          onClick={() => setModal(u)}>
                          <Edit size={13}/>
                        </button>
                      )}
                      {canManage(u) && (
                        <button className="btn btn-ghost btn-sm p-1.5 text-blue-500" title="Badge QR/NFC"
                          onClick={() => setBadgeUser(u)}>
                          <QrCode size={13}/>
                        </button>
                      )}
                      {!isMe(u) && canManage(u) && (
                        <button className="btn btn-ghost btn-sm p-1.5 text-amber-500" title={u.isActive ? "Disabilita" : "Riattiva"}
                          onClick={() => statusMut.mutate({ id: u._id, isActive: !u.isActive })}>
                          {u.isActive ? <Ban size={13}/> : <RotateCcw size={13}/>}
                        </button>
                      )}
                      {me?.role === "admin" && !isMe(u) && canManage(u) && (
                        <button className="btn btn-ghost btn-sm p-1.5 text-red-500" title="Elimina definitivamente"
                          onClick={() => { if (confirm(`Eliminare DEFINITIVAMENTE ${u.name}? L'azione non è reversibile.`)) delMut.mutate(u._id); }}>
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
        {!filtered.length && (
          <div className="py-12 text-center">
            <User size={32} className="mx-auto text-gray-300 mb-3"/>
            <p className="text-gray-500 font-medium">Nessun utente trovato</p>
          </div>
        )}
      </div>
      )}

      <AnimatePresence>
        {modal && (
          <UserModal
            user={modal === "new" ? null : modal}
            me={me}
            departments={activeDepartments}
            users={data || []}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {badgeUser && (
          <BadgeModal user={badgeUser} onClose={() => setBadgeUser(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
