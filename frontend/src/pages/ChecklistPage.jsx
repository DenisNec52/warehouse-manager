/**
 * pages/ChecklistPage.jsx — Modulo 5S per operatori
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckSquare, Square, Send, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { checklistAPI } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import toast from "react-hot-toast";
import clsx from "clsx";

const SECTION_COLORS = {
  "1S": "border-red-400 bg-red-50 dark:bg-red-900/10",
  "2S": "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/10",
  "3S": "border-green-400 bg-green-50 dark:bg-green-900/10",
  "4S": "border-blue-400 bg-blue-50 dark:bg-blue-900/10",
  "5S": "border-purple-400 bg-purple-50 dark:bg-purple-900/10",
};

export default function ChecklistPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [selectedShift,   setSelectedShift]   = useState("");
  const [cleaningType,    setCleaningType]     = useState("");
  const [responses,       setResponses]        = useState({});
  const [generalNote,     setGeneralNote]      = useState("");
  const [expandedSection, setExpandedSection]  = useState(null);
  const [submitted,       setSubmitted]        = useState(false);

  const { data: clData } = useQuery({
    queryKey: ["checklist"],
    queryFn:  () => checklistAPI.get().then(r => r.data.checklist),
    onSuccess: (cl) => {
      // Init risposte e cleaning type default
      const init = {};
      cl.sections?.forEach(sec => sec.items?.forEach(item => {
        init[item._id] = { checked: false, note: "", sectionId: sec._id, label: item.label };
      }));
      setResponses(init);
      const def = cl.cleaningTypes?.find(c => c.default);
      if (def) setCleaningType(def.label);
      // Espandi prima sezione
      if (cl.sections?.length > 0) setExpandedSection(cl.sections[0]._id);
    },
  });

  const { data: myToday, refetch: refetchMy } = useQuery({
    queryKey: ["checklist-my-today"],
    queryFn:  () => checklistAPI.myToday().then(r => r.data.submissions),
  });

  const cl = clData;
  const activeShifts    = cl?.shifts?.filter(s => s.active) || [];
  const compiledShifts  = new Set((myToday || []).map(s => s.shift));

  // Calcola progresso
  const allItems    = cl?.sections?.flatMap(s => s.items) || [];
  const totalItems  = allItems.length;
  const checkedCount= Object.values(responses).filter(r => r.checked).length;
  const progress    = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0;

  const toggleItem = (id) => setResponses(r => ({ ...r, [id]: { ...r[id], checked: !r[id]?.checked } }));

  const mutation = useMutation({
    mutationFn: (d) => checklistAPI.submit(d),
    onSuccess: (res) => {
      const { score } = res.data;
      toast.success(`✅ Checklist inviata! Punteggio: ${score}%`);
      setSubmitted(true);
      refetchMy();
      qc.invalidateQueries({ queryKey: ["checklist-today"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Errore invio"),
  });

  const handleSubmit = () => {
    if (!selectedShift)  return toast.error("Seleziona il turno");
    if (!cleaningType)   return toast.error("Seleziona la tipologia di pulizia");

    const responseArray = allItems.map(item => ({
      itemId:    item._id,
      sectionId: responses[item._id]?.sectionId,
      label:     item.label,
      checked:   responses[item._id]?.checked || false,
      note:      responses[item._id]?.note     || "",
    }));
    mutation.mutate({ shift: selectedShift, cleaningType, responses: responseArray, generalNote });
  };

  if (submitted) return (
    <div className="max-w-lg mx-auto text-center py-16">
      <CheckCircle size={56} className="mx-auto text-green-500 mb-4"/>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Checklist inviata!</h2>
      <p className="text-gray-500 mb-6">Grazie {user?.name?.split(" ")[0]}. La compilazione è stata registrata.</p>
      <div className="space-y-2 mb-6">
        {(myToday || []).map(s => (
          <div key={s._id} className="card p-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{s.shift}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[var(--brand-500)]">{s.score}%</span>
              <CheckCircle size={16} className="text-green-500"/>
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-md btn-primary" onClick={() => { setSubmitted(false); refetchMy(); }}>
        Compila un altro turno
      </button>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">🧹 Autovalutazione 5S</h1>
        <p className="text-sm text-gray-500 mt-0.5">{cl?.workArea} · {cl?.description}</p>
      </div>

      {/* Progress bar */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Avanzamento</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: progress === 100 ? "#22c55e" : "var(--brand-500)" }}>
            {checkedCount}/{totalItems} ({progress}%)
          </span>
        </div>
        <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <motion.div className="h-full rounded-full" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }}
            style={{ background: progress === 100 ? "#22c55e" : "var(--brand-500)" }}/>
        </div>
      </div>

      {/* Selezione turno */}
      <div className="card p-4 mb-4">
        <label className="form-label">Turno *</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {activeShifts.map(shift => {
            const done = compiledShifts.has(shift.name);
            return (
              <button key={shift._id} disabled={done}
                onClick={() => setSelectedShift(shift.name)}
                className={clsx("flex items-center justify-between px-4 py-3 rounded-[var(--radius)] border-2 text-left transition-all",
                  done ? "border-green-300 bg-green-50 dark:bg-green-900/20 cursor-not-allowed opacity-70"
                  : selectedShift === shift.name ? "border-[var(--brand-500)] bg-[var(--brand-50)] dark:bg-[var(--brand-500)]/10"
                  : "border-gray-200 dark:border-gray-700 hover:border-[var(--brand-500)]")}>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{shift.name}</p>
                  <p className="text-xs text-gray-400">{shift.startTime} — {shift.endTime}</p>
                </div>
                {done ? <CheckCircle size={16} className="text-green-500"/> : selectedShift === shift.name ? <CheckCircle size={16} className="text-[var(--brand-500)]"/> : <div className="w-4 h-4 rounded-full border-2 border-gray-300"/>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tipologia pulizia */}
      <div className="card p-4 mb-4">
        <label className="form-label">Tipologia pulizia effettuata *</label>
        <select className="form-input" value={cleaningType} onChange={e => setCleaningType(e.target.value)}>
          <option value="">Seleziona tipologia...</option>
          {cl?.cleaningTypes?.map((ct, i) => (
            <option key={i} value={ct.label}>{ct.label}</option>
          ))}
        </select>
      </div>

      {/* Sezioni 5S */}
      {cl?.sections?.map((sec, si) => {
        const secKey = sec.title.slice(0, 2);
        const secChecked = sec.items?.filter(i => responses[i._id]?.checked).length || 0;
        const secTotal   = sec.items?.length || 0;
        const isOpen     = expandedSection === sec._id;
        return (
          <div key={sec._id} className="card mb-3 overflow-hidden">
            {/* Header sezione */}
            <button className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
              onClick={() => setExpandedSection(isOpen ? null : sec._id)}>
              <div className="flex items-center gap-3">
                <span className="text-lg">{sec.icon}</span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{sec.title}</p>
                  <p className="text-xs text-gray-400">{secChecked}/{secTotal} voci verificate</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {secChecked === secTotal && secTotal > 0 && <CheckCircle size={16} className="text-green-500"/>}
                {isOpen ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
              </div>
            </button>
            {/* Barra progresso sezione */}
            <div className="h-1 bg-gray-100 dark:bg-gray-700">
              <div className="h-full transition-all duration-300"
                style={{ width: `${secTotal > 0 ? (secChecked/secTotal)*100 : 0}%`, background: secChecked === secTotal ? "#22c55e" : "var(--brand-500)" }}/>
            </div>
            {/* Voci */}
            {isOpen && (
              <div className="p-4 space-y-2 border-t border-gray-100 dark:border-gray-800">
                {sec.items?.map(item => {
                  const checked = responses[item._id]?.checked || false;
                  return (
                    <motion.div key={item._id} whileTap={{ scale: 0.98 }}
                      className={clsx("flex items-start gap-3 p-3 rounded cursor-pointer border transition-all",
                        checked ? "bg-green-50 dark:bg-green-900/15 border-green-200 dark:border-green-800"
                        : "bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700 hover:border-[var(--brand-500)]")}
                      onClick={() => toggleItem(item._id)}>
                      {checked
                        ? <CheckSquare size={20} className="text-green-500 shrink-0 mt-0.5"/>
                        : <Square size={20} className="text-gray-400 shrink-0 mt-0.5"/>}
                      <div className="flex-1">
                        <span className={clsx("text-sm font-medium",
                          checked ? "text-green-700 dark:text-green-400 line-through" : "text-gray-800 dark:text-gray-200")}>
                          {item.label}
                        </span>
                        {item.required && !checked && <span className="ml-2 text-xs text-red-400">obbligatorio</span>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Note + Invio */}
      <div className="card p-5 mt-4">
        <label className="form-label">Note / Commenti <span className="text-gray-400 font-normal text-xs">(obbligatori in caso di risposta negativa)</span></label>
        <textarea className="form-input resize-none mb-4" rows={3}
          placeholder="Segnala problemi, anomalie o situazioni da comunicare al team..."
          value={generalNote} onChange={e => setGeneralNote(e.target.value)}/>
        <button
          className={clsx("btn btn-lg w-full gap-2", progress === 100 ? "bg-green-500 hover:bg-green-600 text-white" : "btn-primary")}
          disabled={mutation.isPending || !selectedShift || !cleaningType}
          onClick={handleSubmit}>
          {mutation.isPending ? "Invio in corso..." : <><Send size={16}/> {progress === 100 ? "✅ Invia Checklist Completa" : `Invia (${checkedCount}/${totalItems} voci)`}</>}
        </button>
        {(!selectedShift || !cleaningType) && (
          <p className="text-xs text-center text-gray-400 mt-2">
            {!selectedShift ? "Seleziona il turno" : "Seleziona la tipologia di pulizia"}
          </p>
        )}
      </div>

      {/* Mie compilazioni oggi */}
      {(myToday || []).length > 0 && (
        <div className="card mt-4 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Già compilato oggi</p>
          {myToday.map(s => (
            <div key={s._id} className="flex items-center justify-between py-2 border-b last:border-0 border-gray-100 dark:border-gray-700">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{s.shift}</p>
                <p className="text-xs text-gray-400">{s.cleaningType} · {new Date(s.createdAt).toLocaleTimeString("it-IT", { hour:"2-digit", minute:"2-digit" })}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold" style={{ color: s.score >= 80 ? "#22c55e" : s.score >= 50 ? "#f59e0b" : "#ef4444" }}>{s.score}%</span>
                <CheckCircle size={15} className="text-green-500"/>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
