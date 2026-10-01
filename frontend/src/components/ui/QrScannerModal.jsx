/**
 * components/ui/QrScannerModal.jsx
 *
 * Scanner QR con la fotocamera (libreria qr-scanner: usa il BarcodeDetector nativo
 * se c'è, altrimenti un decoder in un web worker). Caricato in lazy dalla pagina di login.
 * onDetected(testo) restituisce true se il codice è stato accettato.
 */
import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { m as motion } from "framer-motion";
import { X, CameraOff, Loader2 } from "lucide-react";

export default function QrScannerModal({ onDetected, onClose, busy }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [hint, setHint] = useState(null);

  // Ref per leggere sempre i valori aggiornati dentro la callback dello scanner,
  // senza ricreare lo scanner (e riaprire la fotocamera) a ogni render.
  const onDetectedRef = useRef(onDetected);
  const busyRef = useRef(busy);
  const handlingRef = useRef(false);   // lo scanner legge più volte al secondo: un solo login alla volta
  onDetectedRef.current = onDetected;
  busyRef.current = busy;

  useEffect(() => {
    let hintTimer;
    const scanner = new QrScanner(
      videoRef.current,
      async (result) => {
        if (busyRef.current || handlingRef.current) return;
        handlingRef.current = true;
        try {
          const accepted = await onDetectedRef.current(result.data);
          if (!accepted) {
            setHint("Questo QR non è un badge valido");
            clearTimeout(hintTimer);
            hintTimer = setTimeout(() => setHint(null), 2000);
          }
        } finally {
          handlingRef.current = false;
        }
      },
      { preferredCamera: "environment", highlightScanRegion: true, highlightCodeOutline: true,
        returnDetailedScanResult: true, maxScansPerSecond: 5 },
    );

    scanner.start().catch(async (err) => {
      if (err?.name === "NotAllowedError" || String(err).includes("NotAllowedError")) {
        setError("Permesso fotocamera negato: consentilo dalle impostazioni del browser.");
      } else if (!(await QrScanner.hasCamera())) {
        setError("Nessuna fotocamera disponibile su questo dispositivo.");
      } else {
        setError("Impossibile avviare la fotocamera.");
      }
    });

    return () => {
      clearTimeout(hintTimer);
      scanner.stop();
      scanner.destroy();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}/>
      <motion.div initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .95 }}
        className="relative z-10 w-full max-w-sm bg-white dark:bg-gray-900 rounded-[var(--radius-lg)] shadow-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">Scansiona il badge</h2>
          <button className="btn btn-ghost btn-sm p-1.5" aria-label="Chiudi" onClick={onClose}><X size={16}/></button>
        </div>

        <div className="p-5 space-y-3">
          {error && (
            <div className="aspect-square flex flex-col items-center justify-center gap-3 text-center text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-[var(--radius)] p-6">
              <CameraOff size={32}/>
              <p>{error}</p>
            </div>
          )}
          {/* Un solo <video>, sempre montato: il ref deve restare quello a cui lo scanner è collegato */}
          <div className={error ? "hidden" : "relative"}>
            <video ref={videoRef} className="w-full aspect-square object-cover bg-black rounded-[var(--radius)]" playsInline muted/>
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-[var(--radius)] text-white gap-2">
                <Loader2 className="animate-spin" size={18}/> Accesso in corso…
              </div>
            )}
          </div>
          <p className="text-xs text-center text-gray-500">Inquadra il QR stampato sul badge</p>
          {hint && <p className="text-xs text-center text-amber-600">{hint}</p>}
        </div>
      </motion.div>
    </div>
  );
}
