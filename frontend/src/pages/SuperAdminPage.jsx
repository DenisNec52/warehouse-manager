/**
 * pages/SuperAdminPage.jsx
 *
 * Pannello riservato al super-admin (rotta protetta da RequireSuperAdmin, e dal
 * requireSuperAdmin lato server). Impostazioni "controllate", senza CSS grezzo:
 * - nome dell'app (mostrato nella sidebar),
 * - fasi di lavorazione (le userà la deduzione automatica del magazzino),
 * - visibilità dei moduli di menu per ruolo (strato UI; i permessi veri restano
 *   applicati sul backend).
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Crown, Plus, X, Save, GripVertical } from "lucide-react";
import toast from "react-hot-toast";
import { settingsAPI } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

const MODULES = [
  { key: "checklist",       label: "Pulizia 5S" },
  { key: "products",        label: "Magazzino" },
  { key: "movements",       label: "Movimenti" },
  { key: "production",      label: "Andon Board" },
  { key: "standard-times",  label: "Tempi standard" },
  { key: "users",           label: "Utenti" },
  { key: "admin-checklist", label: "Gestione 5S" },
  { key: "admin",           label: "Amministrazione" },
  { key: "departments",     label: "Reparti" },
  { key: "categories",      label: "Categorie" },
  { key: "notifications",   label: "Notifiche" },
  { key: "settings",        label: "Impostazioni" },
];
const ROLES = [["admin", "Admin"], ["supervisore", "Supervisore"], ["operatore", "Operatore"]];

export default function SuperAdminPage() {
  const { settings, setSettings } = useAuthStore();

  const [appName, setAppName] = useState(settings?.appName || "Warehouse Manager");
  const [phases, setPhases]   = useState(settings?.workPhases || []);
  const [newPhase, setNewPhase] = useState("");

  // Griglia visibilità: per ogni modulo, quali ruoli lo vedono (default: tutti).
  const [vis, setVis] = useState(() => {
    const mv = settings?.moduleVisibility || {};
    const out = {};
    for (const { key } of MODULES) {
      const allowed = Array.isArray(mv[key]) ? mv[key] : null;
      out[key] = {
        admin:       allowed ? allowed.includes("admin") : true,
        supervisore: allowed ? allowed.includes("supervisore") : true,
        operatore:   allowed ? allowed.includes("operatore") : true,
      };
    }
    return out;
  });

  const toggle = (key, role) => setVis(v => ({ ...v, [key]: { ...v[key], [role]: !v[key][role] } }));
  const addPhase = () => {
    const p = newPhase.trim();
    if (p && !phases.includes(p)) setPhases([...phases, p]);
    setNewPhase("");
  };
  const removePhase = (p) => setPhases(phases.filter(x => x !== p));

  const save = useMutation({
    mutationFn: () => {
      const moduleVisibility = {};
      for (const { key } of MODULES) {
        moduleVisibility[key] = ROLES.map(([r]) => r).filter(r => vis[key][r]);
      }
      return settingsAPI.update({ appName: appName.trim(), workPhases: phases, moduleVisibility }).then(r => r.data.settings);
    },
    onSuccess: (s) => { setSettings(s); toast.success("Impostazioni salvate"); },
    onError: (e) => toast.error(e.response?.data?.message || "Errore salvataggio"),
  });

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 mb-6">
        <Crown size={20} className="text-amber-500"/>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Impostazioni app</h1>
      </div>

      {/* Nome app */}
      <div className="card p-5 mb-4">
        <label className="form-label">Nome dell'app (sidebar)</label>
        <input className="form-input max-w-sm" value={appName} maxLength={60} onChange={e => setAppName(e.target.value)} />
      </div>

      {/* Fasi di lavorazione */}
      <div className="card p-5 mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Fasi di lavorazione</h2>
        <p className="text-xs text-gray-500 mb-3">Usate dalla registrazione produzione e dalla deduzione automatica del magazzino.</p>
        <div className="space-y-2 mb-3">
          {phases.map(p => (
            <div key={p} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-[var(--radius-sm)] px-3 py-2">
              <GripVertical size={14} className="text-gray-300"/>
              <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{p}</span>
              <button className="btn btn-ghost btn-sm p-1 text-red-400" onClick={() => removePhase(p)} aria-label="Rimuovi"><X size={14}/></button>
            </div>
          ))}
          {!phases.length && <p className="text-sm text-gray-400">Nessuna fase. Aggiungine una sotto.</p>}
        </div>
        <div className="flex gap-2 max-w-sm">
          <input className="form-input" placeholder="es. Prima saldatura" value={newPhase}
            onChange={e => setNewPhase(e.target.value)} onKeyDown={e => e.key === "Enter" && addPhase()} />
          <button className="btn btn-md btn-secondary gap-1" onClick={addPhase}><Plus size={15}/> Aggiungi</button>
        </div>
      </div>

      {/* Visibilità moduli */}
      <div className="card p-5 mb-4 overflow-hidden">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Visibilità moduli per ruolo</h2>
        <p className="text-xs text-gray-500 mb-3">Nasconde le voci di menu per un ruolo. Nota: i permessi di sicurezza veri restano comunque applicati sul server; questo controlla solo cosa viene mostrato. Il super-admin vede sempre tutto.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Modulo</th>{ROLES.map(([, l]) => <th key={l} className="text-center">{l}</th>)}</tr></thead>
            <tbody>
              {MODULES.map(({ key, label }) => (
                <tr key={key}>
                  <td className="font-medium text-gray-800 dark:text-gray-200">{label}</td>
                  {ROLES.map(([r]) => (
                    <td key={r} className="text-center">
                      <input type="checkbox" className="accent-[var(--brand-500)] w-4 h-4" checked={vis[key][r]} onChange={() => toggle(key, r)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button className="btn btn-md btn-primary gap-2" disabled={save.isPending} onClick={() => save.mutate()}>
        <Save size={16}/> {save.isPending ? "Salvataggio…" : "Salva impostazioni"}
      </button>
    </div>
  );
}
