/**
 * pages/AuditPage.jsx — Registro modifiche (solo admin)
 *
 * Chi ha cambiato cosa e quando: prodotti, movimenti, utenti, impostazioni,
 * chiavi API, webhook e prenotazioni dell'integrazione. In sola lettura.
 */
import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ScrollText, ChevronLeft, ChevronRight, Bot, User as UserIcon, Cog } from "lucide-react";
import { auditAPI } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const ENTITY_TYPES = [
  ["", "Tutto"], ["product", "Prodotti"], ["movement", "Movimenti"], ["user", "Utenti"],
  ["settings", "Impostazioni"], ["apiKey", "Chiavi API"], ["webhook", "Webhook"], ["reservation", "Prenotazioni"],
];

const ACTION_LABELS = {
  "product.create": "Prodotto creato", "product.update": "Prodotto modificato", "product.delete": "Prodotto eliminato",
  "movement.create": "Movimento", "movement.correct": "Movimento corretto", "movement.delete": "Movimento annullato",
  "user.create": "Utente creato", "user.update": "Utente modificato", "user.delete": "Utente eliminato",
  "user.activate": "Utente riattivato", "user.deactivate": "Utente disattivato",
  "user.password_change": "Password cambiata", "user.password_reset": "Password reimpostata da admin",
  "user.password_reset_self": "Password reimpostata (link email)",
  "user.badge_regenerate": "Badge rigenerato", "user.badge_revoke": "Badge revocato",
  "auth.logout_all": "Uscita da tutti i dispositivi",
  "settings.update": "Impostazioni modificate",
  "apiKey.create": "Chiave API creata", "apiKey.revoke": "Chiave API revocata",
  "webhook.create": "Webhook creato", "webhook.update": "Webhook modificato", "webhook.delete": "Webhook eliminato",
  "reservation.create": "Prenotazione creata", "reservation.release": "Prenotazione rilasciata", "reservation.consume": "Prenotazione consumata",
};

const fmtValue = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleDateString("it-IT");
  return String(v);
};

const ActorIcon = ({ type }) => (type === "apiKey" ? <Bot size={13}/> : type === "system" ? <Cog size={13}/> : <UserIcon size={13}/>);

export default function AuditPage() {
  const [filters, setFilters] = useState({ entityType: "", action: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const action = useDebouncedValue(filters.action.trim(), 300);

  const params = {
    page, limit: 50,
    ...(filters.entityType && { entityType: filters.entityType }),
    ...(action && { action }),
    ...(filters.from && { from: new Date(`${filters.from}T00:00:00`).toISOString() }),
    ...(filters.to && { to: new Date(`${filters.to}T23:59:59`).toISOString() }),
  };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["audit", params],
    queryFn: () => auditAPI.list(params).then(r => r.data),
    placeholderData: keepPreviousData,
  });
  const set = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };
  const entries = data?.entries || [];
  const pages = data?.pagination?.pages || 1;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><ScrollText size={20}/> Registro modifiche</h1>
        <p className="text-sm text-gray-500 mt-0.5">Chi ha cambiato cosa e quando, compresa l'integrazione esterna. Non modificabile.</p>
      </div>

      <div className="card p-4 mb-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="form-label" htmlFor="audit-type">Area</label>
          <select id="audit-type" className="form-input" value={filters.entityType} onChange={e => set("entityType", e.target.value)}>
            {ENTITY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="audit-action">Azione</label>
          <input id="audit-action" className="form-input" placeholder="es. product.update" value={filters.action}
            onChange={e => set("action", e.target.value)}/>
        </div>
        <div>
          <label className="form-label" htmlFor="audit-from">Dal</label>
          <input id="audit-from" type="date" className="form-input" value={filters.from} onChange={e => set("from", e.target.value)}/>
        </div>
        <div>
          <label className="form-label" htmlFor="audit-to">Al</label>
          <input id="audit-to" type="date" className="form-input" value={filters.to} onChange={e => set("to", e.target.value)}/>
        </div>
      </div>

      <div className="card divide-y divide-gray-100 dark:divide-gray-800">
        {isLoading && <div className="p-8 text-center text-gray-400 text-sm">Caricamento...</div>}
        {!isLoading && !entries.length && <div className="p-8 text-center text-gray-400 text-sm">Nessuna voce per questi filtri.</div>}
        {entries.map(e => (
          <div key={e._id} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-xs text-gray-400 tabular-nums">
                {new Date(e.at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "medium" })}
              </span>
              <span className="font-medium text-gray-900 dark:text-white">{ACTION_LABELS[e.action] || e.action}</span>
              {e.entityLabel && <span className="font-mono text-xs text-gray-500">{e.entityLabel}</span>}
              <span className="text-xs text-gray-500 flex items-center gap-1 ml-auto">
                <ActorIcon type={e.actorType}/> {e.actorName}{e.ip ? ` · ${e.ip}` : ""}
              </span>
            </div>
            {e.changes?.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {e.changes.map((c, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-gray-300">
                    <span className="text-gray-400">{c.field}:</span>{" "}
                    <span className="line-through decoration-gray-300">{fmtValue(c.from)}</span>{" → "}
                    <span className="font-medium">{fmtValue(c.to)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button className="btn btn-sm btn-secondary p-1.5" disabled={page <= 1 || isFetching} onClick={() => setPage(p => p - 1)} aria-label="Pagina precedente"><ChevronLeft size={14}/></button>
          <span className="text-sm text-gray-500 tabular-nums">{page} / {pages}</span>
          <button className="btn btn-sm btn-secondary p-1.5" disabled={page >= pages || isFetching} onClick={() => setPage(p => p + 1)} aria-label="Pagina successiva"><ChevronRight size={14}/></button>
        </div>
      )}
    </div>
  );
}
