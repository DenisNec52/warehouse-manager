/**
 * pages/MovementsPage.jsx — Storico movimenti con filtri
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { movementsAPI } from "@/lib/api";
import clsx from "clsx";

export default function MovementsPage() {
  const [type, setType]   = useState("");
  const [page, setPage]   = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["movements", { type, page }],
    queryFn:  () => movementsAPI.list({ type: type||undefined, page, limit:30 }).then(r => r.data),
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Movimenti</h1>
        <p className="text-sm text-gray-500 mt-0.5">Storico completo entrate e uscite</p>
      </div>

      <div className="card p-3 mb-4 flex gap-3 flex-wrap">
        <div className="flex gap-2">
          {[["","Tutti"],["IN","Entrate"],["OUT","Uscite"]].map(([v,l]) => (
            <button key={v} onClick={() => { setType(v); setPage(1); }}
              className={clsx("btn btn-md", type===v ? "btn-primary" : "btn-secondary")}>{l}</button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center"><div className="w-6 h-6 border-2 border-[var(--brand-500)] border-t-transparent rounded-full animate-spin"/></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Prodotto</th><th>Tipo</th><th>Qtà</th><th>Prima/Dopo</th><th>Motivazione</th><th>Operatore</th><th>Data</th></tr></thead>
              <tbody>
                {(data?.movements||[]).map(m => (
                  <tr key={m._id}>
                    <td>
                      <div className="font-medium text-gray-900 dark:text-white">{m.product?.name || m.productSnapshot?.name}</div>
                      <code className="text-xs text-gray-400">{m.product?.code || m.productSnapshot?.code}</code>
                    </td>
                    <td>
                      <span className={clsx("badge", m.type==="IN" ? "badge-green" : "badge-red")}>
                        {m.type==="IN" ? <ArrowDown size={10}/> : <ArrowUp size={10}/>}
                        {m.type==="IN" ? "Entrata" : "Uscita"}
                      </span>
                    </td>
                    <td className="font-semibold tabular-nums">{m.quantity} {m.product?.unit || m.productSnapshot?.unit}</td>
                    <td className="text-xs tabular-nums text-gray-500">{m.quantityBefore} → <strong className={m.type==="IN"?"text-green-600":"text-red-600"}>{m.quantityAfter}</strong></td>
                    <td className="text-gray-500 text-sm">{m.reason || m.note || "—"}</td>
                    <td className="text-gray-500 text-sm">{m.performedBy?.name || m.performedByName}</td>
                    <td className="text-gray-400 text-xs">{new Date(m.createdAt).toLocaleString("it-IT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.movements?.length && <div className="py-12 text-center text-gray-400">Nessun movimento trovato</div>}
          </div>
        )}
        {data?.pagination?.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-400">Pagina {data.pagination.page} di {data.pagination.pages}</p>
            <div className="flex gap-2">
              <button className="btn btn-sm btn-secondary" disabled={page<=1} onClick={() => setPage(p=>p-1)}>← Prec</button>
              <button className="btn btn-sm btn-secondary" disabled={page>=data.pagination.pages} onClick={() => setPage(p=>p+1)}>Succ →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
