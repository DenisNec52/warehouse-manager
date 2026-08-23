/**
 * pages/ChecklistAdminPage.jsx — Pannello admin 5S
 * Vista mensile tabellare + grafici andamento + configurazione
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { CheckCircle, XCircle, Minus, ChevronDown, ChevronUp, Plus, Trash2, Save } from "lucide-react";
import { checklistAPI } from "@/lib/api";
import { scoreColor, fmtTime } from "@/lib/format";
import ScoreCircle from "@/components/ui/ScoreCircle";
import { useAuthStore } from "@/lib/store";
import toast from "react-hot-toast";
import clsx from "clsx";

// ── Helper date ───────────────────────────────────────────────
const today   = new Date();
const fmtMonth = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const monthLabel = (m) => { const [y,mo] = m.split("-"); return new Date(y, mo-1).toLocaleDateString("it-IT", { month:"long", year:"numeric" }); };

// ── Tab Vista Mensile ─────────────────────────────────────────
function TabMonthly() {
  const [month, setMonth] = useState(fmtMonth(today));
  const [expanded, setExpanded] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["checklist-monthly", month],
    queryFn:  () => checklistAPI.monthlyReport(month).then(r => r.data),
  });

  const days       = data?.days || [];
  const users      = data?.users || [];
  const stats      = data?.stats || {};
  const dailyTrend = data?.dailyTrend || [];
  const cleaningDist = data?.cleaningDist || {};

  const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6"];

  const pieData = Object.entries(cleaningDist).map(([name, value]) => ({ name, value }));

  return (
    <div>
      {/* Selettore mese */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div>
          <label className="form-label">Mese</label>
          <input type="month" className="form-input w-auto" value={month} onChange={e => setMonth(e.target.value)}/>
        </div>
        <div className="mt-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white capitalize">{monthLabel(month)}</h2>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-[var(--brand-500)] border-t-transparent rounded-full animate-spin"/></div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label:"Compilate",       value: stats.totalCompiled,  color:"#10b981" },
              { label:"Mancanti",        value: stats.totalMissing,   color:"#ef4444" },
              { label:"Completamento",   value: `${stats.completionRate}%`, color:"#3b82f6" },
              { label:"Operatori",       value: users.length,         color:"#8b5cf6" },
            ].map(k => (
              <div key={k.label} className="card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{k.label}</p>
                <p className="text-2xl font-bold" style={{ color: k.color }}>{k.value ?? "—"}</p>
              </div>
            ))}
          </div>

          {/* Tabella mensile */}
          <div className="card mb-6 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Presenze giornaliere</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: `${Math.max(600, days.length * 36 + 160)}px` }}>
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-4 py-2 font-semibold text-gray-500 sticky left-0 bg-gray-50 dark:bg-gray-800 z-10 min-w-[140px]">Operatore</th>
                    {days.map(d => (
                      <th key={d} className="text-center px-1 py-2 font-semibold text-gray-500 min-w-[32px]">
                        {parseInt(d.slice(8))}
                      </th>
                    ))}
                    <th className="text-center px-3 py-2 font-semibold text-gray-500 min-w-[60px]">Tot.</th>
                    <th className="text-center px-3 py-2 font-semibold text-gray-500 min-w-[60px]">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.user._id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                      <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800 z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[var(--brand-500)] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                            {u.user.name?.charAt(0).toUpperCase()}
                          </div>
                          <span className="truncate max-w-[100px]">{u.user.name}</span>
                        </div>
                      </td>
                      {days.map(d => {
                        const dayData = u.days[d];
                        const isFuture = d > today.toISOString().slice(0, 10);
                        return (
                          <td key={d} className="text-center px-1 py-2">
                            {isFuture ? (
                              <Minus size={12} className="mx-auto text-gray-200 dark:text-gray-700"/>
                            ) : dayData ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <CheckCircle size={14} className="text-green-500"/>
                                {dayData.length > 1 && <span className="text-[9px] text-gray-400">{dayData.length}</span>}
                              </div>
                            ) : (
                              <XCircle size={14} className="mx-auto text-red-400"/>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-center px-3 py-2 font-bold tabular-nums text-gray-900 dark:text-white">{u.total}</td>
                      <td className="text-center px-3 py-2 font-bold tabular-nums"
                        style={{ color: scoreColor(u.avgScore) }}>
                        {u.avgScore}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && (
                <div className="py-10 text-center text-sm text-gray-400">Nessun dato per questo mese</div>
              )}
            </div>
          </div>

          {/* Grafici */}
          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            {/* Andamento giornaliero */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Compilazioni giornaliere</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dailyTrend} barSize={8}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={.5}/>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => parseInt(d.slice(8))}/>
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false}/>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelFormatter={d => `Giorno ${parseInt(d?.slice(8))}`}/>
                  <Bar dataKey="count" fill="var(--brand-500)" radius={[3,3,0,0]} name="Compilazioni"/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Distribuzione tipologie */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Tipologie di pulizia</h3>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" label={({ name, percent }) => `${Math.round(percent*100)}%`} labelLine={false}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }}/>
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }}/>
                  </PieChart>
                </ResponsiveContainer>
              ) : <div className="flex items-center justify-center h-40 text-sm text-gray-400">Nessun dato</div>}
            </div>
          </div>

          {/* Score medio giornaliero */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Score medio giornaliero (%)</h3>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={dailyTrend.filter(d => d.score > 0)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={.5}/>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => parseInt(d.slice(8))}/>
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]}/>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={v => [`${v}%`]} labelFormatter={d => `Giorno ${parseInt(d?.slice(8))}`}/>
                <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Score medio"/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab Compilazioni ──────────────────────────────────────────
function TabSubmissions() {
  const [date, setDate] = useState(today.toISOString().slice(0,10));
  const [expanded, setExpanded] = useState(null);

  const { data } = useQuery({
    queryKey: ["checklist-submissions", date],
    queryFn:  () => checklistAPI.submissions({ date, limit: 50 }).then(r => r.data),
  });

  const subs = data?.submissions || [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div>
          <label className="form-label">Data</label>
          <input type="date" className="form-input w-auto" value={date} onChange={e => setDate(e.target.value)}/>
        </div>
        <div className="mt-5 text-sm text-gray-500">{subs.length} compilazioni</div>
      </div>

      <div className="space-y-3">
        {subs.length === 0 && (
          <div className="card p-10 text-center">
            <p className="text-gray-500">Nessuna compilazione per questa data</p>
          </div>
        )}
        {subs.map(sub => (
          <div key={sub._id} className="card overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
              onClick={() => setExpanded(expanded === sub._id ? null : sub._id)}>
              <div className="flex items-center gap-3">
                <ScoreCircle score={sub.score} size={36}/>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-white text-sm">
                      {sub.submittedBy?.name || sub.submittedByName}
                    </span>
                    <span className={clsx("badge", sub.allChecked ? "badge-green" : "badge-yellow")}>
                      {sub.allChecked ? "Completa" : "Parziale"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {sub.shift} · {sub.cleaningType} · {fmtTime(sub.createdAt)}
                  </p>
                </div>
              </div>
              {expanded === sub._id ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
            </div>
            {expanded === sub._id && (
              <div className="px-5 pb-4 border-t border-gray-100 dark:border-gray-800">
                <div className="grid sm:grid-cols-2 gap-1.5 mt-3">
                  {sub.responses.map((r, i) => (
                    <div key={i} className={clsx("flex items-start gap-2 p-2 rounded text-xs",
                      r.checked ? "text-green-700 dark:text-green-400" : "text-red-500 dark:text-red-400")}>
                      {r.checked ? <CheckCircle size={13} className="shrink-0 mt-0.5"/> : <XCircle size={13} className="shrink-0 mt-0.5"/>}
                      <span>{r.label}</span>
                    </div>
                  ))}
                </div>
                {sub.generalNote && (
                  <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium">Note: </span>{sub.generalNote}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab Configurazione ────────────────────────────────────────
function TabConfig() {
  const qc = useQueryClient();
  const { data: cl } = useQuery({ queryKey:["checklist"], queryFn: () => checklistAPI.get().then(r=>r.data.checklist) });
  const [title, setTitle]  = useState(cl?.title || "");
  const [desc,  setDesc]   = useState(cl?.description || "");
  const [area,  setArea]   = useState(cl?.workArea || "");
  const [shifts,    setShifts]    = useState(cl?.shifts    || []);
  const [ctypes,    setCtypes]    = useState(cl?.cleaningTypes || []);

  useEffect(() => {
    if (!cl) return;
    setTitle(cl.title); setDesc(cl.description); setArea(cl.workArea);
    setShifts(cl.shifts); setCtypes(cl.cleaningTypes);
  }, [cl]);

  const mut = useMutation({
    mutationFn: d => checklistAPI.update(d),
    onSuccess: () => { qc.invalidateQueries({queryKey:["checklist"]}); toast.success("Salvato"); },
    onError: () => toast.error("Errore salvataggio"),
  });

  return (
    <div className="space-y-5 max-w-xl">
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Intestazione</h3>
        <div><label className="form-label">Titolo</label><input className="form-input" value={title} onChange={e=>setTitle(e.target.value)}/></div>
        <div><label className="form-label">Area di lavoro</label><input className="form-input" value={area} onChange={e=>setArea(e.target.value)}/></div>
        <div><label className="form-label">Descrizione</label><textarea className="form-input resize-none" rows={2} value={desc} onChange={e=>setDesc(e.target.value)}/></div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Turni</h3>
          <button className="btn btn-sm btn-secondary gap-1" onClick={() => setShifts(s=>[...s,{name:"",startTime:"06:00",endTime:"14:00",active:true}])}><Plus size={13}/> Aggiungi</button>
        </div>
        {shifts.map((s,i) => (
          <div key={i} className="flex gap-2 mb-2 flex-wrap items-center">
            <input className="form-input flex-1 min-w-[140px]" value={s.name} placeholder="Nome turno" onChange={e=>setShifts(sh=>sh.map((x,j)=>j===i?{...x,name:e.target.value}:x))}/>
            <input type="time" className="form-input w-24" value={s.startTime} onChange={e=>setShifts(sh=>sh.map((x,j)=>j===i?{...x,startTime:e.target.value}:x))}/>
            <span className="text-gray-400">—</span>
            <input type="time" className="form-input w-24" value={s.endTime} onChange={e=>setShifts(sh=>sh.map((x,j)=>j===i?{...x,endTime:e.target.value}:x))}/>
            <button className="btn btn-ghost btn-sm p-1.5 text-red-400" onClick={()=>setShifts(sh=>sh.filter((_,j)=>j!==i))}><Trash2 size={13}/></button>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tipologie pulizia</h3>
          <button className="btn btn-sm btn-secondary gap-1" onClick={()=>setCtypes(c=>[...c,{label:"",default:false}])}><Plus size={13}/> Aggiungi</button>
        </div>
        {ctypes.map((ct,i) => (
          <div key={i} className="flex gap-2 mb-2 items-center">
            <input className="form-input flex-1" value={ct.label} placeholder="Descrizione tipologia" onChange={e=>setCtypes(c=>c.map((x,j)=>j===i?{...x,label:e.target.value}:x))}/>
            <label className="text-xs text-gray-500 flex items-center gap-1 cursor-pointer">
              <input type="radio" name="default-ct" checked={ct.default} onChange={()=>setCtypes(c=>c.map((x,j)=>({...x,default:j===i})))}/>
              default
            </label>
            <button className="btn btn-ghost btn-sm p-1.5 text-red-400" onClick={()=>setCtypes(c=>c.filter((_,j)=>j!==i))}><Trash2 size={13}/></button>
          </div>
        ))}
      </div>

      <button className="btn btn-lg btn-primary gap-2" disabled={mut.isPending}
        onClick={() => mut.mutate({ title, description: desc, workArea: area, shifts, cleaningTypes: ctypes, sections: cl?.sections })}>
        <Save size={15}/>{mut.isPending ? "Salvataggio..." : "Salva configurazione"}
      </button>
    </div>
  );
}

// ── Pagina admin ──────────────────────────────────────────────
export default function ChecklistAdminPage() {
  const { user } = useAuthStore();
  const isAdmin  = user?.role === "admin";
  const [tab, setTab] = useState("monthly");

  const tabs = [
    ["monthly",     "📅 Vista Mensile"],
    ["submissions", "📋 Compilazioni"],
    ...(isAdmin ? [["config", "⚙️ Configurazione"]] : []),
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">🧹 Gestione 5S</h1>
        <p className="text-sm text-gray-500 mt-0.5">Monitoraggio compilazioni{isAdmin ? " e configurazione checklist" : ""}</p>
      </div>
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-[var(--radius)] w-fit flex-wrap">
        {tabs.map(([id,label]) => (
          <button key={id} onClick={()=>setTab(id)}
            className={clsx("px-4 py-2 text-sm font-medium rounded transition-all",
              tab===id ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300")}>
            {label}
          </button>
        ))}
      </div>
      {tab === "monthly"     && <TabMonthly/>}
      {tab === "submissions" && <TabSubmissions/>}
      {tab === "config" && isAdmin && <TabConfig/>}
    </div>
  );
}
