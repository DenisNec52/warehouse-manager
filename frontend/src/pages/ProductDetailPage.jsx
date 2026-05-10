/**
 * pages/ProductDetailPage.jsx
 */
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Edit, ArrowDown, ArrowUp, AlertTriangle } from "lucide-react";
import { productsAPI, movementsAPI } from "@/lib/api";
import { AnimatePresence } from "framer-motion";
import clsx from "clsx";
import toast from "react-hot-toast";

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: pd } = useQuery({ queryKey:["product",id], queryFn: () => productsAPI.get(id).then(r=>r.data) });
  const { data: md } = useQuery({ queryKey:["movements-product",id], queryFn: () => movementsAPI.byProduct(id).then(r=>r.data) });

  const product = pd?.product;

  if (!product) return (
    <div className="p-8 flex justify-center"><div className="w-6 h-6 border-2 border-[var(--brand-500)] border-t-transparent rounded-full animate-spin"/></div>
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button className="btn btn-ghost btn-sm gap-1.5" onClick={() => navigate(-1)}>
          <ArrowLeft size={14}/> Indietro
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex-1">{product.name}</h1>
        <Link to={`/products`} className="btn btn-md btn-outline gap-2"><Edit size={14}/> Modifica</Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Info prodotto */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5">
            <div className="grid grid-cols-2 gap-4">
              {[
                ["Codice", <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{product.code}</code>],
                ["Unità", product.unit],
                ["Categoria", product.category ? `${product.category.icon} ${product.category.name}` : "—"],
                ["Posizione", product.location || "—"],
                ["Fornitore", product.supplier || "—"],
                ["Prezzo unitario", product.unitPrice > 0 ? `€ ${product.unitPrice.toFixed(2)}` : "—"],
                ["Soglia minima", `${product.minQuantity} ${product.unit}`],
                ["Inserito da", product.createdBy?.name || "—"],
              ].map(([l,v]) => (
                <div key={l}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{l}</p>
                  <p className="text-sm text-gray-900 dark:text-white">{v}</p>
                </div>
              ))}
              {product.description && (
                <div className="col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Descrizione</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{product.description}</p>
                </div>
              )}
            </div>
          </div>

          {/* Storico movimenti */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Storico movimenti</h3>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Tipo</th><th>Quantità</th><th>Prima/Dopo</th><th>Operatore</th><th>Data</th><th>Note</th></tr></thead>
                <tbody>
                  {(md?.movements||[]).map(m => (
                    <tr key={m._id}>
                      <td><span className={clsx("badge", m.type==="IN" ? "badge-green" : "badge-red")}>{m.type==="IN" ? <ArrowDown size={10}/> : <ArrowUp size={10}/>}{m.type==="IN" ? "Entrata" : "Uscita"}</span></td>
                      <td className="font-semibold tabular-nums">{m.quantity}</td>
                      <td className="text-xs tabular-nums text-gray-500">{m.quantityBefore} → {m.quantityAfter}</td>
                      <td className="text-sm text-gray-500">{m.performedBy?.name || m.performedByName}</td>
                      <td className="text-xs text-gray-400">{new Date(m.createdAt).toLocaleString("it-IT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</td>
                      <td className="text-xs text-gray-400">{m.reason || m.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!md?.movements?.length && <div className="py-8 text-center text-sm text-gray-400">Nessun movimento per questo prodotto</div>}
            </div>
          </div>
        </div>

        {/* Sidebar sticky */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className={clsx("card p-5", product.isLowStock && "border-yellow-300 dark:border-yellow-700")}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Giacenza attuale</p>
            <p className={clsx("text-5xl font-bold tabular-nums", product.isLowStock ? "text-yellow-600" : "text-gray-900 dark:text-white")}>
              {product.quantity}
            </p>
            <p className="text-gray-400 text-sm mt-1">{product.unit}</p>
            {product.isLowStock && (
              <div className="flex items-center gap-2 mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-yellow-700 dark:text-yellow-400 text-xs">
                <AlertTriangle size={13}/> Sotto la soglia minima ({product.minQuantity} {product.unit})
              </div>
            )}
          </div>
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Valore in magazzino</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              € {(product.quantity * product.unitPrice).toLocaleString("it-IT",{minimumFractionDigits:2})}
            </p>
            <p className="text-xs text-gray-400 mt-1">€ {product.unitPrice.toFixed(2)} × {product.quantity} {product.unit}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
