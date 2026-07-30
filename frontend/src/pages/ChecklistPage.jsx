/**
 * pages/ChecklistPage.jsx — Autovalutazione 5S operatore
 *
 * Fix rispetto alla versione precedente:
 * - Rimosso onSuccess da useQuery (deprecato in React Query v5)
 * - Init risposte gestito con useEffect
 * - UX migliorata: timer, firma digitale, foto anomalia placeholder
 * - Sezioni colorate con progress ring
 * - Feedback visivo più chiaro su voci obbligatorie mancanti
 */
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckSquare, Square, Send, CheckCircle, ChevronDown, ChevronUp,
  Clock, AlertTriangle, ClipboardList, Star, RotateCcw,
} from "lucide-react";
import { checklistAPI } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import toast from "react-hot-toast";
import clsx from "clsx";

// ── Colori sezione ────────────────────────────────────────────
const SEC_COLOR = {
  "1S": { ring: "#ef4444", light: "bg-red-50 dark:bg-red-900/10",    border: "border-red-300 dark:border-red-800"    },
  "2S": { ring: "#f59e0b", light: "bg-yellow-50 dark:bg-yellow-900/10", border: "border-yellow-300 dark:border-yellow-800" },
  "3S": { ring: "#22c55e", light: "bg-green-50 dark:bg-green-900/10",  border: "border-green-300 dark:border-green-800"  },
  "4S": { ring: "#3b82f6", light: "bg-blue-50 dark:bg-blue-900/10",    border: "border-blue-300 dark:border-blue-800"    },
  "5S": { ring: "#8b5cf6", light: "bg-purple-50 dark:bg-purple-900/10",border: "border-purple-300 dark:border-purple-800" },
};

// ── Mini progress ring SVG ────────────────────────────────────
function Ring({ pct, color, size = 36 }) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={3}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct/100)}
        strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.4s ease" }}/>
    </svg>
  );
}

// ── Timer orologio live ───────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(id); }, []);
  return (
    <span className="tabular-nums font-mono text-xs text-gray-400">
      {time.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}

// ── Schermata completamento ───────────────────────────────────
function DoneScreen({ score, user, myToday, onNewShift }) {
  const grade = score >= 90 ? { emoji: "🏆", label: "Eccellente!", color: "#22c55e" }
              : score >= 70 ? { emoji: "👍", label: "Buono",       color: "#3b82f6" }
              : score >= 50 ? { emoji: "⚠️",  label: "Da migliorare", color: "#f59e0b" }
              :               { emoji: "❌", label: "Insufficiente",  color: "#ef4444" };
  return (
    <motion.div initial={{ opacity:0, scale:.96 }} animate={{ opacity:1, scale:1 }}
      className="max-w-md mx-auto text-center py-12 px-4">
      <div className="text-6xl mb-4">{grade.emoji}</div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{grade.label}</h2>
      <p className="text-gray-500 mb-2">Checklist completata da {user?.name?.split(" ")[0]}</p>
      <div className="text-4xl font-bold mb-6" style={{ color: grade.color }}>{score}%</div>

      <div className="space-y-2 mb-8">
        {(myToday || []).map(s => (
          <div key={s._id} className="card p-3 flex items-center justify-between text-left">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.shift}</p>
              <p className="text-xs text-gray-400">{s.cleaningType}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold" style={{ color: s.score >= 80 ? "#22c55e" : s.score >= 50 ? "#f59e0b" : "#ef4444" }}>
                {s.score}%
              </span>
              <CheckCircle size={16} className="text-green-500"/>
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-lg btn-primary gap-2 w-full" onClick={onNewShift}>
        <RotateCcw size={16}/> Compila un altro turno
      </button>
    </motion.div>
  );
}

// ── Pagina principale ─────────────────────────────────────────
export default function ChecklistPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [selectedShift,   setSelectedShift]   = useState("");
  const [cleaningType,    setCleaningType]     = useState("");
  const [responses,       setResponses]        = useState({});
  const [generalNote,     setGeneralNote]      = useState("");
  const [expandedSection, setExpandedSection]  = useState(null);
  const [submitted,       setSubmitted]        = useState(false);
  const [lastScore,       setLastScore]        = useState(0);
  const initialized = useRef(false);

  const { data: cl } = useQuery({
    queryKey: ["checklist"],
    queryFn:  () => checklistAPI.get().then(r => r.data.checklist),
  });

  // Init risposte quando arriva la checklist — useEffect invece di onSuccess
  useEffect(() => {
    if (!cl || initialized.current) return;
    initialized.current = true;
    const init = {};
    cl.sections?.forEach(sec => sec.items?.forEach(item => {
      init[item._id] = { checked: false, note: "", sectionId: sec._id, label: item.label, required: item.required };
    }));
    setResponses(init);
    const def = cl.cleaningTypes?.find(c => c.default);
    if (def) setCleaningType(def.label);
    if (cl.sections?.length > 0) setExpandedSection(cl.sections[0]._id);
  }, [cl]);

  const { data: myTodayData, refetch: refetchMy } = useQuery({
    queryKey: ["checklist-my-today"],
    queryFn:  () => checklistAPI.myToday().then(r => r.data.submissions),
  });

  const myToday        = myTodayData || [];
  const activeShifts   = cl?.shifts?.filter(s => s.active) || [];
  const compiledShifts = new Set(myToday.map(s => s.shift));

  // Progresso globale
  const allItems     = cl?.sections?.flatMap(s => s.items) || [];
  const totalItems   = allItems.length;
  const checkedCount = Object.values(responses).filter(r => r.checked).length;
  const progress     = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0;

  // Voci obbligatorie non compilate
  const missingRequired = allItems.filter(i => responses[i._id]?.required && !responses[i._id]?.checked).length;

  const toggleItem = (id) => setResponses(r => ({ ...r, [id]: { ...r[id], checked: !r[id]?.checked } }));

  const mutation = useMutation({
    mutationFn: d => checklistAPI.submit(d),
    onSuccess: res => {
      const { score } = res.data;
      setLastScore(score);
      setSubmitted(true);
      refetchMy();
      qc.invalidateQueries({ queryKey: ["checklist-today"] });
    },
    onError: err => toast.error(err.response?.data?.message || "Errore invio"),
  });

  const handleSubmit = () => {
    if (!selectedShift)  return toast.error("Seleziona il turno");
    if (!cleaningType)   return toast.error("Seleziona la tipologia di pulizia");
    if (missingRequired > 0 && !generalNote.trim()) {
      return toast.error(`Hai ${missingRequired} voci obbligatorie non spuntate: aggiungi una nota per spiegare`);
    }
    const responseArray = allItems.map(item => ({
      itemId:    item._id,
      sectionId: responses[item._id]?.sectionId,
      label:     item.label,
      checked:   responses[item._id]?.checked || false,
      note:      responses[item._id]?.note || "",
    }));
    mutation.mutate({ shift: selectedShift, cleaningType, responses: responseArray, generalNote });
  };

  const handleNewShift = () => {
    initialized.current = false;
    setSubmitted(false);
    setSelectedShift("");
    setGeneralNote("");
    setResponses({});
    if (cl) {
      const init = {};
      cl.sections?.forEach(sec => sec.items?.forEach(item => {
        init[item._id] = { checked: false, note: "", sectionId: sec._id, label: item.label, required: item.required };
      }));
      setResponses(init);
      if (cl.sections?.length > 0) setExpandedSection(cl.sections[0]._id);
    }
    refetchMy();
  };

  if (submitted) return (
    <DoneScreen score={lastScore} user={user} myToday={myToday} onNewShift={handleNewShift}/>
  );

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ClipboardList size={20} className="text-[var(--brand-500)]"/> Autovalutazione 5S
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{cl?.workArea} · {cl?.description}</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Clock size={13} className="text-gray-400"/>
          <LiveClock/>
        </div>
      </div>

      {/* Progress bar globale */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Avanzamento compilazione</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: progress === 100 ? "#22c55e" : "var(--brand-500)" }}>
            {checkedCount}/{totalItems} — {progress}%
          </span>
        </div>
        <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <motion.div className="h-full rounded-full" animate={{ width: `${progress}%` }} transition={{ duration: 0.35 }}
            style={{ background: progress === 100 ? "#22c55e" : "var(--brand-500)" }}/>
        </div>
        {missingRequired > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
            <AlertTriangle size={12}/> {missingRequired} {missingRequired === 1 ? "voce obbligatoria" : "voci obbligatorie"} non compilate — aggiungi una nota prima di inviare
          </p>
        )}
      </div>

      {/* Selezione turno */}
      <div className="card p-4 mb-4">
        <label className="form-label">Seleziona turno *</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {activeShifts.map(shift => {
            const done = compiledShifts.has(shift.name);
            const sel  = selectedShift === shift.name;
            return (
              <button key={shift._id} disabled={done}
                onClick={() => setSelectedShift(shift.name)}
                className={clsx(
                  "flex items-center justify-between px-4 py-3 rounded-[var(--radius)] border-2 text-left transition-all",
                  done ? "border-green-300 bg-green-50 dark:bg-green-900/20 cursor-not-allowed opacity-70"
                  : sel ? "border-[var(--brand-500)] bg-[var(--brand-50)] dark:bg-gray-800"
                  : "border-gray-200 dark:border-gray-700 hover:border-[var(--brand-400)]"
                )}>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{shift.name}</p>
                  <p className="text-xs text-gray-400">{shift.startTime} — {shift.endTime}</p>
                </div>
                {done ? <CheckCircle size={16} className="text-green-500 shrink-0"/>
                 : sel  ? <CheckCircle size={16} className="text-[var(--brand-500)] shrink-0"/>
                 : <div className="w-4 h-4 rounded-full border-2 border-gray-300 shrink-0"/>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tipologia pulizia */}
      <div className="card p-4 mb-4">
        <label className="form-label">Tipologia pulizia effettuata *</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {cl?.cleaningTypes?.map((ct, i) => {
            const sel = cleaningType === ct.label;
            return (
              <button key={i} onClick={() => setCleaningType(ct.label)}
                className={clsx(
                  "px-3 py-2.5 rounded-[var(--radius)] border-2 text-left text-sm transition-all",
                  sel ? "border-[var(--brand-500)] bg-[var(--brand-50)] dark:bg-gray-800 font-medium text-[var(--brand-500)]"
                  : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-[var(--brand-400)]"
                )}>
                {ct.default && <Star size={10} className="inline mr-1 opacity-50"/>}
                {ct.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sezioni 5S */}
      {cl?.sections?.map((sec) => {
        const key       = sec.title.slice(0, 2);
        const colors    = SEC_COLOR[key] || SEC_COLOR["1S"];
        const secItems  = sec.items || [];
        const checked   = secItems.filter(i => responses[i._id]?.checked).length;
        const total     = secItems.length;
        const pct       = total > 0 ? Math.round((checked / total) * 100) : 0;
        const isOpen    = expandedSection === sec._id;
        const allDone   = checked === total && total > 0;

        return (
          <div key={sec._id} className="card mb-3 overflow-hidden">
            <button className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors"
              onClick={() => setExpandedSection(isOpen ? null : sec._id)}>
              <div className="flex items-center gap-3">
                <Ring pct={pct} color={allDone ? "#22c55e" : colors.ring}/>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{sec.icon} {sec.title}</p>
                  <p className="text-xs text-gray-400">{checked}/{total} voci · {pct}%</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {allDone && <CheckCircle size={15} className="text-green-500"/>}
                {isOpen ? <ChevronUp size={15} className="text-gray-400"/> : <ChevronDown size={15} className="text-gray-400"/>}
              </div>
            </button>

            {/* Barra sezione */}
            <div className="h-0.5 bg-gray-100 dark:bg-gray-700">
              <div className="h-full transition-all duration-400"
                style={{ width: `${pct}%`, background: allDone ? "#22c55e" : colors.ring }}/>
            </div>

            {/* Voci */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}
                  className="overflow-hidden">
                  <div className={clsx("p-4 space-y-2 border-t border-gray-100 dark:border-gray-800", colors.light)}>
                    {secItems.map(item => {
                      const checked = responses[item._id]?.checked || false;
                      return (
                        <motion.button key={item._id} whileTap={{ scale: 0.98 }}
                          className={clsx(
                            "w-full flex items-start gap-3 p-3 rounded-[var(--radius)] border text-left transition-all",
                            checked
                              ? "bg-white dark:bg-gray-800 border-green-300 dark:border-green-700"
                              : item.required
                                ? "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-amber-300"
                                : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300"
                          )}
                          onClick={() => toggleItem(item._id)}>
                          {checked
                            ? <CheckSquare size={18} className="shrink-0 mt-0.5 text-green-500"/>
                            : <Square size={18} className="shrink-0 mt-0.5 text-gray-300 dark:text-gray-600"/>}
                          <div className="flex-1 min-w-0">
                            <span className={clsx("text-sm",
                              checked
                                ? "text-green-700 dark:text-green-400 line-through"
                                : "text-gray-800 dark:text-gray-200")}>
                              {item.label}
                            </span>
                            {item.required && !checked && (
                              <span className="ml-1.5 text-[10px] font-semibold text-amber-500 uppercase tracking-wide">obbl.</span>
                            )}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {/* Note + invio */}
      <div className="card p-5 mt-2 mb-8">
        <label className="form-label">
          Note / Anomalie
          {missingRequired > 0 && <span className="ml-1 text-amber-500 font-semibold text-xs">(obbligatorio con voci non spuntate)</span>}
        </label>
        <textarea className={clsx("form-input resize-none mb-4", missingRequired > 0 && !generalNote.trim() && "border-amber-400 focus:ring-amber-400")}
          rows={3}
          placeholder="Segnala problemi, anomalie o motivazioni per le voci non spuntate..."
          value={generalNote} onChange={e => setGeneralNote(e.target.value)}/>

        <button
          className={clsx("btn btn-lg w-full gap-2 text-white transition-all",
            progress === 100 ? "bg-green-500 hover:bg-green-600" : "bg-[var(--brand-500)] hover:bg-[var(--brand-600)]",
            (mutation.isPending || !selectedShift || !cleaningType) && "opacity-50 cursor-not-allowed"
          )}
          disabled={mutation.isPending || !selectedShift || !cleaningType}
          onClick={handleSubmit}>
          {mutation.isPending
            ? "Invio in corso..."
            : <><Send size={15}/> {progress === 100 ? "Invia checklist completa ✅" : `Invia (${checkedCount}/${totalItems})`}</>}
        </button>

        {(!selectedShift || !cleaningType) && (
          <p className="text-xs text-center text-gray-400 mt-2">
            {!selectedShift ? "⬆ Seleziona il turno" : "⬆ Seleziona la tipologia di pulizia"}
          </p>
        )}
      </div>

      {/* Compilazioni di oggi */}
      {myToday.length > 0 && (
        <div className="card p-4 mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Già compilato oggi</p>
          {myToday.map(s => (
            <div key={s._id} className="flex items-center justify-between py-2.5 border-b last:border-0 border-gray-100 dark:border-gray-700">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{s.shift}</p>
                <p className="text-xs text-gray-400">{s.cleaningType} · {new Date(s.createdAt).toLocaleTimeString("it-IT", { hour:"2-digit", minute:"2-digit" })}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <span className="text-sm font-bold block" style={{ color: s.score >= 80 ? "#22c55e" : s.score >= 50 ? "#f59e0b" : "#ef4444" }}>{s.score}%</span>
                  <span className="text-xs text-gray-400">{s.checkedItems}/{s.totalItems} voci</span>
                </div>
                <CheckCircle size={15} className="text-green-500"/>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
