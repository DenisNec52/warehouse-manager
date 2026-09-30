/**
 * pages/AndonBoardPage.jsx
 *
 * Andon Board per reparto: righe di produzione con tempo standard atteso vs tempo impiegato.
 * Il tempo standard si compila da solo dalla tipologia custodia (tabella Tempi standard).
 */
import { useMemo, useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, X, Timer, PauseCircle, Flag, CheckCircle2 } from "lucide-react";
import { m as motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import clsx from "clsx";
import { productionAPI, usersAPI } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { fmtMinutes, parseDuration, efficiencyBadge, toIsoDay } from "@/lib/duration";

// Report con grafici ed export Excel: recharts si scarica solo quando si apre questa pagina
const AndonReport = lazy(() => import("@/components/andon/AndonReport"));
import { useSelectedDepartment } from "@/hooks/useDepartments";
import DepartmentSelector from "@/components/ui/DepartmentSelector";

const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString("it-IT", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const isoFromDate = (iso) => (iso ? iso.slice(0, 10) : "");

function presetRange(preset) {
  const today = new Date();
  const from = new Date(today);
  if (preset === "week") from.setDate(today.getDate() - ((today.getDay() + 6) % 7));   // lunedì
  if (preset === "month") from.setDate(1);
  return { from: toIsoDay(from), to: toIsoDay(today) };
}

// ── Modale riga ───────────────────────────────────────────────
function EntryModal({ entry, department, standardTimes, operators, onClose }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [form, setForm] = useState({
    data:         isoFromDate(entry?.data) || toIsoDay(new Date()),
    operatore:    entry?.operatore || user?.id || "",
    commessa:     entry?.commessa || "",
    posizione:    entry?.posizione || "",
    quantita:     entry?.quantita ? String(entry.quantita) : "",
    standardTime: entry?.standardTime || "",
    tempo:        entry ? fmtMinutes(entry.tempoImpiegatoMinuti) : "",
    dataFine:     isoFromDate(entry?.dataFine),
    sospesa:      entry?.sospesa || false,
    bindello:     entry?.bindello || false,
    note:         entry?.note || "",
  });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  // In modifica, se la tipologia resta quella, vale lo snapshot della riga (non il valore attuale in tabella).
  const std = standardTimes.find(t => t._id === form.standardTime);
  const stdMinuti = entry && entry.standardTime === form.standardTime ? entry.tempoStdMinuti : std?.minuti;
  const quantita = Number(form.quantita);
  const impiegato = parseDuration(form.tempo);
  const atteso = stdMinuti && quantita > 0 ? stdMinuti * quantita : null;
  const preview = atteso && impiegato ? efficiencyBadge(atteso / impiegato) : null;

  const mut = useMutation({
    mutationFn: d => entry ? productionAPI.updateEntry(entry._id, d) : productionAPI.createEntry(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production"] });
      toast.success(entry ? "Riga aggiornata" : "Riga registrata");
      onClose();
    },
    onError: e => toast.error(e.response?.data?.errors?.[0]?.message || e.response?.data?.message || "Errore"),
  });

  const valid = form.data && form.commessa.trim() && quantita >= 1 && form.standardTime && impiegato > 0;
  const submit = () => mut.mutate({
    department: department._id,
    data: form.data,
    operatore: form.operatore || undefined,
    commessa: form.commessa,
    posizione: form.posizione,
    quantita,
    standardTime: form.standardTime,
    tempoImpiegatoMinuti: impiegato,
    dataFine: form.dataFine || null,
    sospesa: form.sospesa,
    bindello: form.bindello,
    note: form.note,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{opacity:0,scale:.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.95}}
        className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-[var(--radius-lg)] shadow-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">{entry ? "Modifica riga" : "Nuova riga produzione"}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Reparto: {department.name}</p>
          </div>
          <button className="btn btn-ghost btn-sm p-1.5" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Data *</label>
              <input type="date" className="form-input" value={form.data} onChange={set("data")}/>
            </div>
            {operators ? (
              <div>
                <label className="form-label">Operatore *</label>
                <select className="form-input" value={form.operatore} onChange={set("operatore")}>
                  {operators.map(o => <option key={o._id} value={o._id}>{o.name || o.username}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="form-label">Operatore</label>
                <input className="form-input" value={entry?.operatoreNome || user?.name || user?.username || ""} disabled/>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="form-label">N. commessa *</label>
              <input className="form-input" value={form.commessa} onChange={set("commessa")} placeholder="es. 2631"/>
            </div>
            <div>
              <label className="form-label">Posizione</label>
              <input className="form-input" value={form.posizione} onChange={set("posizione")} placeholder="es. 1"/>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="form-label">Tipologia custodia *</label>
              <select className="form-input" value={form.standardTime} onChange={set("standardTime")}>
                <option value="">Seleziona…</option>
                {entry && !std && <option value={entry.standardTime}>{entry.custodiaLabel} (non più in tabella)</option>}
                {standardTimes.map(t => <option key={t._id} value={t._id}>{t.label} — {fmtMinutes(t.minuti)}/pz</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Q.tà pezzi *</label>
              <input type="number" min="1" className="form-input" value={form.quantita} onChange={set("quantita")}/>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Tempo impiegato (h:mm) *</label>
              <input className="form-input" value={form.tempo} onChange={set("tempo")} placeholder="es. 5:00"/>
              {form.tempo && !impiegato && <p className="form-error">Usa ore:minuti, es. 5:00</p>}
            </div>
            <div>
              <label className="form-label">Data commessa finita</label>
              <input type="date" className="form-input" value={form.dataFine} onChange={set("dataFine")}/>
            </div>
          </div>

          {atteso && (
            <div className="rounded-[var(--radius-md)] bg-gray-50 dark:bg-gray-800/60 px-4 py-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-gray-500">STD <strong className="text-gray-900 dark:text-white tabular-nums">{fmtMinutes(stdMinuti)}</strong>/pz</span>
              <span className="text-gray-500">Atteso <strong className="text-gray-900 dark:text-white tabular-nums">{fmtMinutes(atteso)}</strong></span>
              {preview && <span className={clsx("badge", preview.cls)}>Efficienza {preview.text}</span>}
            </div>
          )}

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={form.sospesa} onChange={set("sospesa")}/> Sospesa</label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={form.bindello} onChange={set("bindello")}/> Bindello</label>
          </div>

          <div>
            <label className="form-label">Note</label>
            <input className="form-input" value={form.note} onChange={set("note")} maxLength={500}/>
          </div>

          <div className="flex gap-3">
            <button className="btn btn-md btn-secondary flex-1" onClick={onClose}>Annulla</button>
            <button className="btn btn-md btn-primary flex-1" disabled={mut.isPending || !valid} onClick={submit}>
              {mut.isPending ? "..." : "Salva"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Pagina ────────────────────────────────────────────────────
function StatCard({ label, value, hint }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

export default function AndonBoardPage() {
  const { user } = useAuthStore();
  const isSupervisor = ["admin", "supervisore"].includes(user?.role);
  const { departments, department, departmentId, select } = useSelectedDepartment("production");
  const [preset, setPreset] = useState("week");
  const [range, setRange] = useState(() => presetRange("week"));
  const [modal, setModal] = useState(null);
  const qc = useQueryClient();

  const applyPreset = (p) => { setPreset(p); setRange(presetRange(p)); };
  const setDate = (k) => (e) => { setPreset("custom"); setRange(r => ({ ...r, [k]: e.target.value })); };

  const { data: standardTimes = [] } = useQuery({
    queryKey: ["standard-times", departmentId],
    queryFn: () => productionAPI.standardTimes({ department: departmentId }).then(r => r.data.standardTimes),
    enabled: !!departmentId,
  });
  const { data: operators } = useQuery({
    queryKey: ["users"],
    // Stessa cache della pagina Utenti: il filtro va in select, non nei dati salvati
    queryFn: () => usersAPI.list().then(r => r.data.users || []),
    select: (users) => users.filter(u => u.isActive !== false),
    enabled: isSupervisor,
  });
  const { data: entries, isLoading } = useQuery({
    queryKey: ["production", "entries", range, departmentId],
    queryFn: () => productionAPI.entries({ ...range, department: departmentId }).then(r => r.data.entries),
    enabled: !!departmentId,
  });
  const { data: stats } = useQuery({
    queryKey: ["production", "stats", range, departmentId],
    queryFn: () => productionAPI.stats({ ...range, department: departmentId }).then(r => r.data),
    enabled: !!departmentId,
  });

  const delMut = useMutation({
    mutationFn: id => productionAPI.deleteEntry(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["production"] }); toast.success("Riga eliminata"); },
    onError: e => toast.error(e.response?.data?.message || "Errore"),
  });

  const canEdit = (e) => isSupervisor || e.operatore === user?.id;
  const totale = stats?.totale;
  const maxOperatoreMinuti = useMemo(
    () => Math.max(1, ...(stats?.perOperatore || []).flatMap(o => [o.attesoMinuti, o.impiegatoMinuti])),
    [stats],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Andon Board</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tempo standard atteso vs tempo impiegato{department ? ` — ${department.name}` : ""}</p>
        </div>
        <button className="btn btn-md btn-primary gap-2" onClick={() => setModal("new")} disabled={!department || !standardTimes.length}>
          <Plus size={16}/> Nuova riga
        </button>
      </div>

      <DepartmentSelector departments={departments} value={departmentId} onChange={select} className="mb-4"/>
      {department && !standardTimes.length && (
        <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-[var(--radius)] px-4 py-3 mb-4">
          {department.name} non ha ancora tempi standard: aggiungili in <Link to="/production/standard-times" className="underline font-medium">Tempi standard</Link> per poter registrare righe.
        </p>
      )}

      {departmentId && (
        <Suspense fallback={<div className="card p-4 mb-4 text-sm text-gray-400">Caricamento report…</div>}>
          <AndonReport departmentId={departmentId} departmentName={department?.name}/>
        </Suspense>
      )}

      <div className="card p-3 mb-4 flex gap-3 flex-wrap items-center">
        <div className="flex gap-2">
          {[["today","Oggi"],["week","Settimana"],["month","Mese"]].map(([v,l]) => (
            <button key={v} onClick={() => applyPreset(v)}
              className={clsx("btn btn-md", preset === v ? "btn-primary" : "btn-secondary")}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <input type="date" className="form-input py-1.5" value={range.from} max={range.to} onChange={setDate("from")} aria-label="Dal"/>
          <span>→</span>
          <input type="date" className="form-input py-1.5" value={range.to} min={range.from} onChange={setDate("to")} aria-label="Al"/>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <StatCard label="Righe" value={totale?.righe ?? "—"}/>
        <StatCard label="Pezzi" value={totale?.pezzi ?? "—"}/>
        <StatCard label="Tempo atteso" value={fmtMinutes(totale?.attesoMinuti)} hint="STD × pezzi"/>
        <StatCard label="Tempo impiegato" value={fmtMinutes(totale?.impiegatoMinuti)}/>
        <div className="card p-4">
          <p className="text-xs text-gray-500">Efficienza</p>
          <p className="mt-2"><span className={clsx("badge text-base", efficiencyBadge(totale?.efficienza).cls)}>{efficiencyBadge(totale?.efficienza).text}</span></p>
          <p className="text-xs text-gray-400 mt-1">&gt;100% = più veloce dello standard</p>
        </div>
      </div>

      {stats?.perOperatore?.length > 0 && (
        <div className="card p-4 mb-4">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Per operatore</h2>
          <div className="space-y-3">
            {stats.perOperatore.map(o => {
              const badge = efficiencyBadge(o.efficienza);
              return (
                <div key={o._id} className="grid grid-cols-[8rem_1fr_auto] gap-3 items-center text-sm">
                  <span className="truncate font-medium text-gray-900 dark:text-white">{o.nome}</span>
                  <div className="space-y-1" aria-label={`Atteso ${fmtMinutes(o.attesoMinuti)}, impiegato ${fmtMinutes(o.impiegatoMinuti)}`}>
                    <div className="h-2 rounded-full bg-gray-300 dark:bg-gray-600" style={{ width: `${(o.attesoMinuti / maxOperatoreMinuti) * 100}%` }}/>
                    <div className="h-2 rounded-full bg-[var(--brand-500)]" style={{ width: `${(o.impiegatoMinuti / maxOperatoreMinuti) * 100}%` }}/>
                  </div>
                  <span className="whitespace-nowrap text-xs text-gray-500 tabular-nums">
                    {fmtMinutes(o.impiegatoMinuti)} / {fmtMinutes(o.attesoMinuti)} <span className={clsx("badge ml-1", badge.cls)}>{badge.text}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-3 flex gap-4">
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2 rounded-full bg-gray-300 dark:bg-gray-600"/> Atteso</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2 rounded-full bg-[var(--brand-500)]"/> Impiegato</span>
          </p>
        </div>
      )}

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center"><div className="w-6 h-6 border-2 border-[var(--brand-500)] border-t-transparent rounded-full animate-spin"/></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr>
                <th>Data</th><th>Operatore</th><th>Commessa</th><th>Custodia</th><th>Pz</th>
                <th>STD/pz</th><th>Atteso</th><th>Impiegato</th><th>Eff.</th><th>Stato</th><th/>
              </tr></thead>
              <tbody>
                {(entries || []).map(e => {
                  const badge = efficiencyBadge(e.tempoAttesoMinuti / e.tempoImpiegatoMinuti);
                  return (
                    <tr key={e._id}>
                      <td className="text-sm tabular-nums whitespace-nowrap">{fmtDay(e.data)}</td>
                      <td className="text-sm">{e.operatoreNome}</td>
                      <td className="font-medium text-gray-900 dark:text-white whitespace-nowrap">
                        {e.commessa}{e.posizione && <span className="text-gray-400 font-normal"> / pos. {e.posizione}</span>}
                      </td>
                      <td><span className="badge badge-blue">{e.custodiaLabel}</span></td>
                      <td className="tabular-nums">{e.quantita}</td>
                      <td className="tabular-nums text-gray-500">{fmtMinutes(e.tempoStdMinuti)}</td>
                      <td className="tabular-nums">{fmtMinutes(e.tempoAttesoMinuti)}</td>
                      <td className="tabular-nums font-semibold">{fmtMinutes(e.tempoImpiegatoMinuti)}</td>
                      <td><span className={clsx("badge", badge.cls)}>{badge.text}</span></td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-1.5 text-gray-400">
                          {e.dataFine && <span title={`Finita il ${fmtDay(e.dataFine)}`}><CheckCircle2 size={15} className="text-green-600"/></span>}
                          {e.sospesa && <span title="Sospesa"><PauseCircle size={15} className="text-amber-500"/></span>}
                          {e.bindello && <span title="Bindello"><Flag size={15} className="text-purple-500"/></span>}
                        </div>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {canEdit(e) && <>
                          <button className="btn btn-ghost btn-sm p-1.5" aria-label="Modifica" onClick={() => setModal(e)}><Edit size={13}/></button>
                          <button className="btn btn-ghost btn-sm p-1.5 text-red-500" aria-label="Elimina"
                            onClick={() => { if (confirm("Eliminare questa riga?")) delMut.mutate(e._id); }}><Trash2 size={13}/></button>
                        </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!entries?.length && (
              <div className="py-12 text-center text-gray-400">
                <Timer size={28} className="mx-auto mb-2 opacity-50"/>
                Nessuna riga nel periodo selezionato
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {modal && department && (
          <EntryModal
            entry={modal === "new" ? null : modal}
            department={department}
            standardTimes={standardTimes}
            operators={isSupervisor ? operators : null}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
