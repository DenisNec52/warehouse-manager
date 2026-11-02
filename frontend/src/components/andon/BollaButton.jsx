/**
 * components/andon/BollaButton.jsx — PDF della bolla di una POSIZIONE, accanto alla commessa.
 * Ogni posizione ha la sua bolla (una commessa può averne moltissime).
 * Tutti: icona per aprirla (se c'è). Supervisore/admin: carica, sostituisci, elimina.
 * Visibile solo se il super-admin ha acceso la funzione (il server la blocca comunque).
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, FilePlus2, RefreshCw, Trash2, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import { bolleAPI } from "@/lib/api";

const MAX_MB = 10;

export default function BollaButton({ commessa, posizione = "", bolla, canManage }) {
  const qc = useQueryClient();
  const input = useRef(null);
  const box = useRef(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const close = (e) => { if (!box.current?.contains(e.target)) setMenu(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  // Testo leggibile della posizione, es. "commessa 2961 pos. 9"
  const where = posizione ? `commessa ${commessa} pos. ${posizione}` : `commessa ${commessa}`;
  const done = (msg) => { toast.success(msg); qc.invalidateQueries({ queryKey: ["bolle"] }); setMenu(false); };
  const fail = (err) => toast.error(err.response?.data?.message || "Operazione non riuscita");
  const upload = useMutation({ mutationFn: (f) => bolleAPI.upload(commessa, posizione, f), onSuccess: () => done(`Bolla della ${where} salvata`), onError: fail });
  const remove = useMutation({ mutationFn: () => bolleAPI.remove(commessa, posizione), onSuccess: () => done("Bolla eliminata"), onError: fail });

  const open = () => window.open(bolleAPI.fileUrl(commessa, posizione), "_blank", "noopener");
  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) return toast.error("Scegli un file PDF");
    if (f.size > MAX_MB * 1024 * 1024) return toast.error(`Il PDF supera ${MAX_MB} MB`);
    upload.mutate(f);
  };

  if (!bolla && !canManage) return null;
  const busy = upload.isPending || remove.isPending;

  return (
    <span ref={box} className="relative inline-flex">
      <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={pick}/>
      {bolla ? (
        <button type="button" disabled={busy} title={`Apri la bolla (${bolla.filename})`} aria-label={`Bolla ${where}`}
          onClick={canManage ? () => setMenu((m) => !m) : open}
          className="w-7 h-7 inline-flex items-center justify-center rounded-(--radius-sm) text-(--brand-500) bg-(--brand-50) hover:bg-(--brand-100) transition-colors">
          <FileText size={14}/>
        </button>
      ) : (
        <button type="button" disabled={busy} title={`Carica la bolla PDF (${where})`} aria-label={`Carica bolla ${where}`}
          onClick={() => input.current?.click()}
          className="w-7 h-7 inline-flex items-center justify-center rounded-(--radius-sm) text-gray-400 hover:text-(--brand-500) hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
          {upload.isPending ? <RefreshCw size={13} className="animate-spin"/> : <FilePlus2 size={14}/>}
        </button>
      )}

      {menu && bolla && (
        <span role="menu" className="absolute left-0 top-full mt-1 z-30 card shadow-modal p-1 w-44 flex flex-col">
          {[
            [ExternalLink, "Apri", open, ""],
            [RefreshCw, "Sostituisci", () => input.current?.click(), ""],
            [Trash2, "Elimina", () => { if (window.confirm(`Eliminare la bolla della ${where}?`)) remove.mutate(); }, "text-rose-500"],
          ].map(([Icon, label, action, cls]) => (
            <button key={label} role="menuitem" type="button" onClick={action}
              className={`flex items-center gap-2.5 px-3 h-9 rounded-(--radius-sm) text-sm text-left hover:bg-gray-50 dark:hover:bg-white/5 ${cls}`}>
              <Icon size={14}/> {label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
