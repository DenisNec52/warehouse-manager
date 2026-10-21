/**
 * pages/StandardTimesPage.jsx
 *
 * Tabella "Tempi standard" per reparto e tipologia/dimensione custodia.
 * Consultabile da tutti (nei propri reparti), modificabile da supervisore e admin.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, X, Clock, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { m as motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { productionAPI } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { fmtMinutes, parseDuration } from "@/lib/duration";
import { useSelectedDepartment } from "@/hooks/useDepartments";
import DepartmentSelector from "@/components/ui/DepartmentSelector";

function StandardTimeModal({ item, department, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    tipologia:  item?.tipologia  || "",
    dimensione: item?.dimensione || "",
    label:      item?.label      || "",
    tempo:      item ? fmtMinutes(item.minuti) : "",
  });
  const minuti = parseDuration(form.tempo);
  const mut = useMutation({
    mutationFn: d => item ? productionAPI.updateStandardTime(item._id, d) : productionAPI.createStandardTime(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["standard-times"] }); toast.success(item ? "Tempo aggiornato" : "Tempo creato"); onClose(); },
    onError: e => toast.error(e.response?.data?.message || "Errore"),
  });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const valid = form.tipologia.trim() && form.label.trim() && minuti > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{opacity:0,scale:.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.95}}
        className="relative z-10 w-full max-w-md bg-white dark:bg-gray-900 rounded-[var(--radius-lg)] shadow-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">{item ? "Modifica tempo standard" : "Nuovo tempo standard"}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Reparto: {department.name}</p>
          </div>
          <button className="btn btn-ghost btn-sm p-1.5" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="form-label">Tipologia custodia *</label>
            <input className="form-input" value={form.tipologia} onChange={set("tipologia")} placeholder="es. Custodia IP65 (calandrata)"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Dimensione</label>
              <input className="form-input" value={form.dimensione} onChange={set("dimensione")} placeholder="es. Piccola (DN80-DN150)"/>
            </div>
            <div>
              <label className="form-label">Nome breve *</label>
              <input className="form-input" value={form.label} onChange={set("label")} placeholder="es. IP65 Piccola"/>
            </div>
          </div>
          <div>
            <label className="form-label">Tempo standard per pezzo (h:mm) *</label>
            <input className="form-input" value={form.tempo} onChange={set("tempo")} placeholder="es. 1:30"/>
            {form.tempo && !minuti && <p className="form-error">Formato non valido: usa ore:minuti, es. 1:30</p>}
          </div>
          <div className="flex gap-3">
            <button className="btn btn-md btn-secondary flex-1" onClick={onClose}>Annulla</button>
            <button className="btn btn-md btn-primary flex-1" disabled={mut.isPending || !valid}
              onClick={() => mut.mutate({ department: department._id, tipologia: form.tipologia, dimensione: form.dimensione, label: form.label, minuti })}>
              {mut.isPending ? "..." : "Salva"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Import da Excel: scegli file → anteprima → conferma ───────────
function ImportModal({ department, onClose }) {
  const qc = useQueryClient();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);   // { rows, errors, summary }

  // Passo 1: anteprima (non salva nulla)
  const previewMut = useMutation({
    mutationFn: (f) => productionAPI.importStandardTimes(department._id, f, false).then(r => r.data),
    onSuccess: (data) => setPreview(data),
    onError: (e) => toast.error(e.response?.data?.message || "File non valido"),
  });
  // Passo 2: conferma e salva (rimanda lo stesso file)
  const commitMut = useMutation({
    mutationFn: () => productionAPI.importStandardTimes(department._id, file, true).then(r => r.data),
    onSuccess: (data) => {
      const s = data.summary || {};
      qc.invalidateQueries({ queryKey: ["standard-times"] });
      toast.success(`Import completato: ${s.created || 0} creati, ${s.updated || 0} aggiornati`);
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || "Errore durante il salvataggio"),
  });

  const onPick = (e) => {
    const f = e.target.files?.[0];
    setPreview(null);
    setFile(f || null);
    if (f) previewMut.mutate(f);
  };

  const s = preview?.summary;
  const canSave = preview && s?.valid > 0 && !commitMut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{opacity:0,scale:.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.95}}
        className="relative z-10 w-full max-w-2xl bg-white dark:bg-gray-900 rounded-[var(--radius-lg)] shadow-modal max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><FileSpreadsheet size={18}/> Importa da Excel</h2>
            <p className="text-xs text-gray-500 mt-0.5">Reparto: {department.name} — solo file .xlsx</p>
          </div>
          <button className="btn btn-ghost btn-sm p-1.5" onClick={onClose}><X size={16}/></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-[var(--radius-md)] py-8 cursor-pointer hover:border-[var(--brand-500)] transition-colors">
            <Upload size={22} className="text-gray-400"/>
            <span className="text-sm text-gray-600 dark:text-gray-300">{file ? file.name : "Scegli un file .xlsx"}</span>
            <span className="text-xs text-gray-400">Colonne attese: Tipologia, Dimensione, Nome breve, Minuti (o Tempo)</span>
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={onPick}/>
          </label>

          {previewMut.isPending && <p className="text-sm text-gray-500 text-center">Lettura del file…</p>}

          {preview && (
            <>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="inline-flex items-center gap-1.5 text-green-600"><CheckCircle2 size={15}/> {s.valid} righe valide</span>
                {s.errors > 0 && <span className="inline-flex items-center gap-1.5 text-amber-600"><AlertTriangle size={15}/> {s.errors} scartate</span>}
                {s.truncated && <span className="text-amber-600">⚠ file troncato al limite righe</span>}
              </div>

              {s.valid > 0 && (
                <div className="table-wrap max-h-56 overflow-y-auto border border-gray-100 dark:border-gray-800 rounded-[var(--radius-md)]">
                  <table className="data-table">
                    <thead><tr><th>Tipologia</th><th>Dimensione</th><th>Nome breve</th><th>Tempo</th></tr></thead>
                    <tbody>
                      {preview.rows.map((r, i) => (
                        <tr key={i}>
                          <td className="font-medium">{r.tipologia}</td>
                          <td className="text-gray-500 text-sm">{r.dimensione || "—"}</td>
                          <td><span className="badge badge-blue">{r.label}</span></td>
                          <td className="tabular-nums">{fmtMinutes(r.minuti)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview.errors?.length > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-400 space-y-1 max-h-28 overflow-y-auto">
                  {preview.errors.slice(0, 20).map((e, i) => (
                    <div key={i}>Riga {e.row}: {e.message}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
          <button className="btn btn-md btn-secondary flex-1" onClick={onClose}>Annulla</button>
          <button className="btn btn-md btn-primary flex-1" disabled={!canSave}
            onClick={() => commitMut.mutate()}>
            {commitMut.isPending ? "Salvataggio…" : `Salva ${s?.valid || 0} righe`}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function StandardTimesPage() {
  const { user } = useAuthStore();
  const canEdit = ["admin", "supervisore"].includes(user?.role);
  const [modal, setModal] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const qc = useQueryClient();
  const { departments, department, departmentId, select } = useSelectedDepartment("production");
  const { data, isLoading } = useQuery({
    queryKey: ["standard-times", departmentId],
    queryFn: () => productionAPI.standardTimes({ department: departmentId }).then(r => r.data.standardTimes),
    enabled: !!departmentId,
  });
  const delMut = useMutation({
    mutationFn: id => productionAPI.deleteStandardTime(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["standard-times"] }); toast.success("Tempo rimosso"); },
    onError: e => toast.error(e.response?.data?.message || "Errore"),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Tempi standard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tempo per singola custodia{department ? ` — ${department.name}` : ""}</p>
        </div>
        {canEdit && department && (
          <div className="flex gap-2">
            <button className="btn btn-md btn-secondary gap-2" onClick={() => setImportOpen(true)}><FileSpreadsheet size={16}/> Importa Excel</button>
            <button className="btn btn-md btn-primary gap-2" onClick={() => setModal("new")}><Plus size={16}/> Nuovo</button>
          </div>
        )}
      </div>

      <DepartmentSelector departments={departments} value={departmentId} onChange={select} className="mb-4"/>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center"><div className="w-6 h-6 border-2 border-[var(--brand-500)] border-t-transparent rounded-full animate-spin"/></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Tipologia custodia</th><th>Dimensione</th><th>Nome breve</th><th>Tempo STD</th>{canEdit && <th/>}</tr></thead>
              <tbody>
                {(data || []).map(t => (
                  <tr key={t._id}>
                    <td className="font-medium text-gray-900 dark:text-white">{t.tipologia}</td>
                    <td className="text-gray-500 text-sm">{t.dimensione || "—"}</td>
                    <td><span className="badge badge-blue">{t.label}</span></td>
                    <td className="font-semibold tabular-nums"><span className="inline-flex items-center gap-1.5"><Clock size={13} className="text-gray-400"/>{fmtMinutes(t.minuti)}</span></td>
                    {canEdit && (
                      <td className="text-right whitespace-nowrap">
                        <button className="btn btn-ghost btn-sm p-1.5" aria-label="Modifica" onClick={() => setModal(t)}><Edit size={13}/></button>
                        <button className="btn btn-ghost btn-sm p-1.5 text-red-500" aria-label="Rimuovi"
                          onClick={() => { if (confirm(`Rimuovere "${t.label}"? Le righe già registrate non cambiano.`)) delMut.mutate(t._id); }}><Trash2 size={13}/></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.length && (
              <div className="py-12 text-center text-gray-400">
                Nessun tempo standard{department ? ` in ${department.name}` : ""}
                {canEdit && department && <p className="text-xs mt-1">Aggiungili con "Nuovo".</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {modal && department && <StandardTimeModal item={modal === "new" ? null : modal} department={department} onClose={() => setModal(null)}/>}
        {importOpen && department && <ImportModal department={department} onClose={() => setImportOpen(false)}/>}
      </AnimatePresence>
    </div>
  );
}
