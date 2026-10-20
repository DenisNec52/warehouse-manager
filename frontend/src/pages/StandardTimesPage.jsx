/**
 * pages/StandardTimesPage.jsx
 *
 * Tabella "Tempi standard" per reparto e tipologia/dimensione custodia.
 * Consultabile da tutti (nei propri reparti), modificabile da supervisore e admin.
 */
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, X, Clock, FileSpreadsheet, AlertTriangle, ArrowRight } from "lucide-react";
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

const importForm = (department, file, dryRun) => {
  const fd = new FormData();
  fd.append("department", department._id);
  if (dryRun) fd.append("dryRun", "1");
  fd.append("file", file);
  return fd;
};

const ACTION_BADGE = {
  create:    { text: "Nuovo",     cls: "badge-green" },
  update:    { text: "Aggiorna",  cls: "badge-blue" },
  unchanged: { text: "Invariato", cls: "badge-gray" },
};

const righeText = (righe) => righe.map(r => r.riga).join(", ");

/**
 * Anteprima dell'import da Excel: mostra cosa verrà creato o aggiornato
 * prima di salvare. Le tipologie in conflitto e le righe illeggibili non vengono importate.
 */
function ImportPreviewModal({ preview, file, department, onClose }) {
  const qc = useQueryClient();
  const counts = preview.items.reduce((acc, i) => ({ ...acc, [i.action]: (acc[i.action] || 0) + 1 }), {});
  const toSave = (counts.create || 0) + (counts.update || 0);

  const mut = useMutation({
    mutationFn: () => productionAPI.importStandardTimes(importForm(department, file, false)),
    onSuccess: ({ data }) => {
      qc.invalidateQueries({ queryKey: ["standard-times"] });
      const { creati, aggiornati, errori } = data.result;
      if (errori.length) toast.error(`${errori.length} tempi non salvati: ${errori.map(e => e.tipologia).join(", ")}`);
      toast.success(`Import completato: ${creati} nuovi, ${aggiornati} aggiornati`);
      onClose();
    },
    onError: e => toast.error(e.response?.data?.message || "Errore durante l'import"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{opacity:0,scale:.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.95}}
        className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-gray-900 rounded-[var(--radius-lg)] shadow-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 dark:text-white">Importa tempi da Excel</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{file.name} → {department.name}</p>
          </div>
          <button className="btn btn-ghost btn-sm p-1.5" onClick={onClose}><X size={16}/></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="badge badge-green">{counts.create || 0} nuovi</span>
            <span className="badge badge-blue">{counts.update || 0} da aggiornare</span>
            <span className="badge badge-gray">{counts.unchanged || 0} invariati</span>
            {!!preview.conflicts.length && <span className="badge badge-red">{preview.conflicts.length} in conflitto</span>}
          </div>

          {!!preview.items.length && (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Tipologia</th><th>Dimensione</th><th>Nome breve</th><th>Tempo STD</th><th/></tr></thead>
                <tbody>
                  {preview.items.map(i => {
                    const badge = ACTION_BADGE[i.action];
                    return (
                      <tr key={`${i.tipologia}|${i.dimensione}`}>
                        <td className="font-medium text-gray-900 dark:text-white">{i.tipologia}</td>
                        <td className="text-gray-500 text-sm">{i.dimensione || "—"}</td>
                        <td className="text-sm">{i.label}</td>
                        <td className="font-semibold tabular-nums whitespace-nowrap">
                          {i.action === "update" && i.minutiPrecedenti !== i.minuti && (
                            <span className="text-gray-400 font-normal inline-flex items-center gap-1 mr-1">
                              {fmtMinutes(i.minutiPrecedenti)}<ArrowRight size={12}/>
                            </span>
                          )}
                          {fmtMinutes(i.minuti)}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          <span className={`badge ${badge.cls}`}>{i.riattivato ? "Riattiva" : badge.text}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!!preview.conflicts.length && (
            <div className="rounded-[var(--radius-sm)] border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-sm">
              <p className="font-medium text-red-700 dark:text-red-300 flex items-center gap-1.5 mb-1">
                <AlertTriangle size={14}/> Stessa tipologia con tempi diversi — non importate
              </p>
              <ul className="space-y-0.5 text-red-700/90 dark:text-red-300/90">
                {preview.conflicts.map(c => (
                  <li key={`${c.tipologia}|${c.dimensione}`}>
                    <b>{c.tipologia}{c.dimensione ? ` ${c.dimensione}` : ""}</b>:{" "}
                    {c.valori.map(v => `${fmtMinutes(v.minuti)} (righe ${righeText(v.righe)})`).join(" · ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!!preview.errors.length && (
            <div className="rounded-[var(--radius-sm)] border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-300 mb-1">Righe ignorate</p>
              <ul className="space-y-0.5 text-amber-800/90 dark:text-amber-300/90">
                {preview.errors.map(e => <li key={`${e.foglio}-${e.riga}`}>{e.foglio}, riga {e.riga}: {e.message}</li>)}
              </ul>
            </div>
          )}

          {!preview.items.length && !preview.conflicts.length && (
            <p className="py-6 text-center text-gray-400">Nessun tempo standard trovato nel file.</p>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
          <button className="btn btn-md btn-secondary flex-1" onClick={onClose}>Annulla</button>
          <button className="btn btn-md btn-primary flex-1" disabled={mut.isPending || !toSave} onClick={() => mut.mutate()}>
            {mut.isPending ? "..." : toSave ? `Importa ${toSave}` : "Niente da importare"}
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

  // Import da Excel: scelta file -> anteprima (dryRun) -> conferma nella modale.
  const fileInput = useRef(null);
  const [importState, setImportState] = useState(null);   // { file, preview }
  const previewMut = useMutation({
    mutationFn: file => productionAPI.importStandardTimes(importForm(department, file, true)).then(r => ({ file, preview: r.data })),
    onSuccess: setImportState,
    onError: e => toast.error(e.response?.data?.message || "File non leggibile"),
  });
  const onFileChosen = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";   // permette di ricaricare lo stesso file dopo averlo corretto
    if (file) previewMut.mutate(file);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Tempi standard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tempo per singola custodia{department ? ` — ${department.name}` : ""}</p>
        </div>
        {canEdit && department && (
          <div className="flex gap-2 shrink-0">
            <input ref={fileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={onFileChosen}/>
            <button className="btn btn-md btn-secondary gap-2" disabled={previewMut.isPending} onClick={() => fileInput.current?.click()}
              title="Carica il foglio Excel: legge Tipologia, Dimensione e Temp standard">
              <FileSpreadsheet size={16}/> <span className="hidden sm:inline">{previewMut.isPending ? "Lettura..." : "Importa Excel"}</span>
            </button>
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
                {canEdit && department && <p className="text-xs mt-1">Aggiungili con "Nuovo" o caricali con "Importa Excel".</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {modal && department && <StandardTimeModal item={modal === "new" ? null : modal} department={department} onClose={() => setModal(null)}/>}
        {importState && department && (
          <ImportPreviewModal preview={importState.preview} file={importState.file} department={department} onClose={() => setImportState(null)}/>
        )}
      </AnimatePresence>
    </div>
  );
}
