/**
 * components/ui/DepartmentSelector.jsx — scelta del reparto (Tempi standard, Andon Board)
 */
import clsx from "clsx";
import { Factory } from "lucide-react";

export default function DepartmentSelector({ departments, value, onChange, className }) {
  if (departments.length === 0) {
    return (
      <div className="card p-4 text-sm text-gray-500">
        Nessun reparto disponibile per il tuo account. Chiedi a un amministratore di assegnartene uno.
      </div>
    );
  }

  if (departments.length === 1) {
    return (
      <div className={clsx("flex items-center gap-2", className)}>
        <Factory size={16} className="text-gray-400 shrink-0"/>
        <span className="badge badge-blue">{departments[0].name}</span>
      </div>
    );
  }

  return (
    <div className={clsx("flex items-center gap-2 flex-wrap", className)} role="tablist" aria-label="Reparto">
      <Factory size={16} className="text-gray-400 shrink-0"/>
      {departments.map(d => (
        <button key={d._id} type="button" role="tab" aria-selected={d._id === value} onClick={() => onChange(d._id)}
          className={clsx("btn btn-sm", d._id === value ? "btn-primary" : "btn-secondary")}>
          {d.name}
        </button>
      ))}
    </div>
  );
}
