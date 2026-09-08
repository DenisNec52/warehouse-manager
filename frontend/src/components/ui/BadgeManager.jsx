/**
 * components/ui/BadgeManager.jsx
 *
 * UI per generare/scaricare il "badge" (QR code + link per tag NFC)
 * usato per il login automatico, senza username e password.
 * Riusato sia in Impostazioni (badge dell'utente loggato) sia nella
 * gestione utenti (badge di un altro account, da parte di admin/supervisore).
 *
 * Il segreto in chiaro viene mostrato solo subito dopo la generazione
 * (il backend salva solo il suo HMAC): per questo il QR e il link vanno
 * scaricati/programmati subito, altrimenti va rigenerato un nuovo badge.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { QrCode, Download, Copy, RefreshCw, Power, Trash2, Info } from "lucide-react";
import toast from "react-hot-toast";
import clsx from "clsx";

export default function BadgeManager({
  badgeEnabled: initialEnabled,
  badgeIssuedAt: initialIssuedAt,
  onRegenerate,   // () => Promise<axios response> con { url, nfcUrl, qrImage, badgeIssuedAt }
  onToggle,       // (enabled) => Promise<axios response>
  onRevoke,       // () => Promise<axios response>
  onInvalidate,   // opzionale — invalida altre query dopo un cambiamento (es. lista utenti)
}) {
  const [meta,     setMeta]     = useState({ enabled: initialEnabled !== false, issuedAt: initialIssuedAt || null });
  const [freshBadge, setFreshBadge] = useState(null); // { url, nfcUrl, qrImage } — mostrato una sola volta
  const [showInfo, setShowInfo] = useState(false);

  const regenMut = useMutation({
    mutationFn: onRegenerate,
    onSuccess: (res) => {
      const { url, nfcUrl, qrImage, badgeIssuedAt } = res.data;
      setFreshBadge({ url, nfcUrl, qrImage });
      setMeta({ enabled: true, issuedAt: badgeIssuedAt });
      onInvalidate?.();
      toast.success("Nuovo badge generato: quello precedente non funziona più");
    },
    onError: e => toast.error(e.response?.data?.message || "Errore generazione badge"),
  });

  const toggleMut = useMutation({
    mutationFn: onToggle,
    onSuccess: (_res, enabledArg) => {
      setMeta(m => ({ ...m, enabled: enabledArg }));
      onInvalidate?.();
      toast.success(enabledArg ? "Login da badge riattivato" : "Login da badge disattivato");
    },
    onError: e => toast.error(e.response?.data?.message || "Errore"),
  });

  const revokeMut = useMutation({
    mutationFn: onRevoke,
    onSuccess: () => {
      setFreshBadge(null);
      setMeta(m => ({ ...m, issuedAt: null }));
      onInvalidate?.();
      toast.success("Badge revocato");
    },
    onError: e => toast.error(e.response?.data?.message || "Errore"),
  });

  const handleDownload = () => {
    if (!freshBadge?.qrImage) return;
    const a = document.createElement("a");
    a.href = freshBadge.qrImage;
    a.download = "badge-qr.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleCopy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast.success("Link copiato"); }
    catch { toast.error("Copia non riuscita: seleziona e copia manualmente"); }
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <QrCode size={16}/> Badge QR / NFC
        </h3>
        <button type="button" className="text-gray-400 hover:text-gray-600" title="Come funziona"
          onClick={() => setShowInfo(v => !v)}>
          <Info size={15}/>
        </button>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Accesso automatico senza username e password: basta inquadrare il QR con la fotocamera
        oppure avvicinare un tag NFC programmato con lo stesso link.
      </p>

      {showInfo && (
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/60 rounded p-3 mb-4 space-y-1.5">
          <p>• Chiunque possieda il QR o il tag accede con questo account: trattali come una chiave fisica.</p>
          <p>• "Rigenera" crea un nuovo codice e disattiva subito quello vecchio (utile se un badge è perso o rubato).</p>
          <p>• "Disattiva" blocca temporaneamente il login da badge senza cancellare il codice generato.</p>
        </div>
      )}

      <div className="flex items-center justify-between py-2 border-t border-gray-100 dark:border-gray-800">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Login da badge {meta.enabled ? "attivo" : "disattivato"}
          </p>
          <p className="text-xs text-gray-400">
            {meta.issuedAt
              ? `Badge generato il ${new Date(meta.issuedAt).toLocaleDateString("it-IT")}`
              : "Nessun badge generato finora"}
          </p>
        </div>
        {meta.issuedAt && (
          <button type="button" disabled={toggleMut.isPending}
            onClick={() => toggleMut.mutate(!meta.enabled)}
            className={clsx("btn btn-sm gap-1.5", meta.enabled ? "btn-secondary" : "btn-primary")}>
            <Power size={13}/> {meta.enabled ? "Disattiva" : "Attiva"}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-3">
        <button type="button" className="btn btn-md btn-primary gap-2" disabled={regenMut.isPending}
          onClick={() => regenMut.mutate()}>
          <RefreshCw size={14}/> {meta.issuedAt ? "Rigenera badge" : "Genera badge"}
        </button>
        {meta.issuedAt && (
          <button type="button" className="btn btn-md btn-secondary gap-2 text-red-500" disabled={revokeMut.isPending}
            onClick={() => { if (confirm("Revocare il badge? Il QR e il tag NFC smetteranno subito di funzionare.")) revokeMut.mutate(); }}>
            <Trash2 size={14}/> Revoca
          </button>
        )}
      </div>

      {freshBadge && (
        <div className="mt-4 p-4 rounded border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
            Questo QR e questo link vengono mostrati una sola volta: scaricalo/programmalo ora.
            Se li perdi, dovrai rigenerare il badge.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <img src={freshBadge.qrImage} alt="QR code di accesso" className="w-36 h-36 rounded bg-white p-2 border border-gray-200 shrink-0"/>
            <div className="flex-1 min-w-0 space-y-3">
              <button type="button" className="btn btn-sm btn-secondary gap-1.5" onClick={handleDownload}>
                <Download size={13}/> Scarica immagine QR
              </button>

              <div>
                <label className="form-label">Link da scrivere sul tag NFC</label>
                <div className="flex gap-1.5">
                  <input readOnly className="form-input text-xs font-mono" value={freshBadge.nfcUrl}
                    onClick={e => e.target.select()}/>
                  <button type="button" className="btn btn-sm btn-secondary p-2 shrink-0" title="Copia"
                    onClick={() => handleCopy(freshBadge.nfcUrl)}>
                    <Copy size={13}/>
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Scrivilo su un tag NFC come record NDEF di tipo URI (vedi la guida qui sotto).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
