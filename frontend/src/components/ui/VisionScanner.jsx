/**
 * components/ui/VisionScanner.jsx
 *
 * Bottone flottante (FAB) con modal IA per scansione foto magazzino.
 * Flusso:
 *   1. Utente scatta/carica foto
 *   2. Claude Vision estrae: codice, quantità, tipo, riferimento
 *   3. Dati pre-compilati nel form — utente può correggere
 *   4. Submit → cerca prodotto per codice → registra movimento
 */
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, X, Upload, Loader2, CheckCircle2, AlertCircle,
  ArrowDown, ArrowUp, Sparkles, RefreshCw, Send,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { productsAPI, movementsAPI } from "@/lib/api";
import toast from "react-hot-toast";
import clsx from "clsx";
import api from "@/lib/api";

// ── Step badge ────────────────────────────────────────────────
function Step({ n, label, active, done }) {
  return (
    <div className={clsx("flex items-center gap-2 text-xs font-medium transition-colors",
      done  ? "text-green-600 dark:text-green-400" :
      active ? "text-[var(--brand-500)]" :
               "text-gray-400")}>
      <div className={clsx(
        "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
        done  ? "bg-green-500 text-white" :
        active ? "bg-[var(--brand-500)] text-white" :
                 "bg-gray-200 dark:bg-gray-700 text-gray-500"
      )}>
        {done ? "✓" : n}
      </div>
      {label}
    </div>
  );
}

// ── Confidence badge ──────────────────────────────────────────
function ConfBadge({ level }) {
  const map = {
    alta:  { cls: "badge-green",  label: "Alta confidenza" },
    media: { cls: "badge-yellow", label: "Confidenza media" },
    bassa: { cls: "badge-red",    label: "Bassa confidenza" },
  };
  const { cls, label } = map[level] || map.bassa;
  return <span className={`badge ${cls}`}>{label}</span>;
}

// ── Main component ────────────────────────────────────────────
export default function VisionScanner() {
  const [open,      setOpen]      = useState(false);
  const [step,      setStep]      = useState(1); // 1=foto 2=analisi 3=conferma
  const [preview,   setPreview]   = useState(null);
  const [base64,    setBase64]    = useState(null);
  const [mediaType, setMediaType] = useState("image/jpeg");
  const [scanning,  setScanning]  = useState(false);
  const [aiResult,  setAiResult]  = useState(null);
  const [aiError,   setAiError]   = useState(null);

  // Form fields (pre-compilati dall'IA, editabili)
  const [codice,      setCodice]      = useState("");
  const [quantita,    setQuantita]    = useState("");
  const [tipo,        setTipo]        = useState("IN");
  const [riferimento, setRiferimento] = useState("");
  const [note,        setNote]        = useState("");

  // Ricerca prodotto per codice
  const [searchCode, setSearchCode] = useState("");
  const [matchedProduct, setMatchedProduct] = useState(null);
  const [searching, setSearching]   = useState(false);

  const fileRef  = useRef();
  const qc       = useQueryClient();

  // ── Reset ───────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStep(1); setPreview(null); setBase64(null);
    setScanning(false); setAiResult(null); setAiError(null);
    setCodice(""); setQuantita(""); setTipo("IN");
    setRiferimento(""); setNote("");
    setSearchCode(""); setMatchedProduct(null); setSearching(false);
  }, []);

  const handleClose = () => { setOpen(false); reset(); };

  // ── Carica immagine ─────────────────────────────────────────
  const loadImage = (file) => {
    if (!file) return;
    const mt = file.type || "image/jpeg";
    setMediaType(mt);
    const url = URL.createObjectURL(file);
    setPreview(url);

    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = e.target.result.split(",")[1];
      setBase64(b64);
    };
    reader.readAsDataURL(file);
  };

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) loadImage(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) loadImage(file);
  };

  // ── Analisi IA ──────────────────────────────────────────────
  const scanImage = async () => {
    if (!base64) return;
    setScanning(true); setAiError(null); setStep(2);
    try {
      const { data } = await api.post("/vision/scan", { image: base64, mediaType });
      const r = data.result;
      setAiResult(r);

      // Pre-compila il form
      if (r.codice)      { setCodice(r.codice);           setSearchCode(r.codice); }
      if (r.quantita)      setQuantita(String(r.quantita));
      if (r.tipo)          setTipo(r.tipo);
      if (r.riferimento)   setRiferimento(r.riferimento);
      if (r.note)          setNote(r.note);

      setStep(3);

      // Cerca automaticamente il prodotto per codice
      if (r.codice) searchProduct(r.codice);
    } catch (err) {
      setAiError(err.response?.data?.message || "Errore analisi immagine.");
      setStep(1);
    } finally {
      setScanning(false);
    }
  };

  // ── Cerca prodotto per codice (partial match) ───────────────
  const searchProduct = async (code) => {
    if (!code?.trim()) return;
    setSearching(true); setMatchedProduct(null);
    try {
      const { data } = await productsAPI.list({ search: code.trim(), limit: 5 });
      const products = data.products || [];
      // Cerca corrispondenza esatta prima, poi parziale
      const exact = products.find(p =>
        p.name?.toUpperCase() === code.toUpperCase() ||
        p.code?.toUpperCase().includes(code.toUpperCase())
      );
      setMatchedProduct(exact || products[0] || null);
    } catch {
      setMatchedProduct(null);
    } finally {
      setSearching(false);
    }
  };

  // ── Submit movimento ────────────────────────────────────────
  const moveMutation = useMutation({
    mutationFn: (d) => movementsAPI.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      toast.success(
        `${tipo === "IN" ? "Entrata" : "Uscita"} registrata — ${matchedProduct?.name || codice}`
      );
      handleClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || "Errore registrazione"),
  });

  const handleSubmit = () => {
    if (!matchedProduct) return toast.error("Prodotto non trovato — cerca manualmente");
    const qty = parseInt(quantita);
    if (!qty || qty < 1) return toast.error("Quantità non valida");
    moveMutation.mutate({
      productId:  matchedProduct._id,
      type:       tipo,
      quantity:   qty,
      reason:     riferimento ? `Commessa: ${riferimento}` : "",
      note:       note || "",
      reference:  riferimento || "",
    });
  };

  // ── Render ──────────────────────────────────────────────────
  return (
    <>
      {/* FAB */}
      <motion.button
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        className={clsx(
          "fixed bottom-6 right-6 z-50",
          "w-14 h-14 rounded-full shadow-xl",
          "bg-[var(--brand-500)] hover:bg-[var(--brand-600)]",
          "flex items-center justify-center text-white",
          "transition-colors duration-200"
        )}
        title="Scansiona con IA"
      >
        <Camera size={22} />
        {/* Pulse dot */}
        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white">
          <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75" />
        </span>
      </motion.button>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
              onClick={handleClose}
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.96 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
              className={clsx(
                "fixed bottom-0 left-0 right-0 sm:bottom-auto sm:top-1/2 sm:left-1/2",
                "sm:-translate-x-1/2 sm:-translate-y-1/2",
                "sm:w-[480px] sm:max-h-[90vh] w-full max-h-[92vh]",
                "bg-white dark:bg-gray-900",
                "rounded-t-2xl sm:rounded-2xl shadow-2xl z-50",
                "flex flex-col overflow-hidden"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--brand-500)] flex items-center justify-center">
                  <Sparkles size={15} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Scansione IA</p>
                  <p className="text-xs text-gray-400">Fotografa il documento o l'articolo</p>
                </div>
                <button onClick={handleClose} className="btn btn-ghost btn-sm p-1.5">
                  <X size={16} />
                </button>
              </div>

              {/* Progress steps */}
              <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
                <Step n={1} label="Foto"    active={step === 1} done={step > 1} />
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                <Step n={2} label="Analisi" active={step === 2} done={step > 2} />
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                <Step n={3} label="Conferma" active={step === 3} done={false} />
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">

                {/* ── STEP 1: Upload foto ── */}
                {step === 1 && (
                  <>
                    {!preview ? (
                      <div
                        onDrop={onDrop}
                        onDragOver={(e) => e.preventDefault()}
                        className={clsx(
                          "border-2 border-dashed border-gray-300 dark:border-gray-600",
                          "rounded-[var(--radius-lg)] p-8 text-center cursor-pointer",
                          "hover:border-[var(--brand-500)] hover:bg-[var(--brand-50)]",
                          "dark:hover:border-[var(--brand-500)] dark:hover:bg-gray-800",
                          "transition-colors duration-200"
                        )}
                        onClick={() => fileRef.current?.click()}
                      >
                        <Camera size={36} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Trascina o tocca per caricare
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          JPG, PNG, WEBP — documento, etichetta, bolla, flangia
                        </p>
                        <input
                          ref={fileRef} type="file"
                          accept="image/*" capture="environment"
                          className="hidden" onChange={onFileChange}
                        />
                      </div>
                    ) : (
                      <div className="relative">
                        <img
                          src={preview} alt="Preview"
                          className="w-full max-h-64 object-contain rounded-[var(--radius)] border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                        />
                        <button
                          onClick={() => { setPreview(null); setBase64(null); }}
                          className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    )}

                    {aiError && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-[var(--radius)] text-sm text-red-600 dark:text-red-400">
                        <AlertCircle size={15} className="shrink-0" />
                        {aiError}
                      </div>
                    )}

                    <button
                      className="btn btn-lg btn-primary w-full gap-2 bg-[var(--brand-500)] hover:bg-[var(--brand-600)] text-white"
                      disabled={!base64 || scanning}
                      onClick={scanImage}
                    >
                      {scanning ? (
                        <><Loader2 size={16} className="animate-spin" /> Analisi in corso...</>
                      ) : (
                        <><Sparkles size={16} /> Analizza con IA</>
                      )}
                    </button>
                  </>
                )}

                {/* ── STEP 2: Loading ── */}
                {step === 2 && (
                  <div className="flex flex-col items-center justify-center py-10 gap-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full border-4 border-[var(--brand-100)] border-t-[var(--brand-500)] animate-spin" />
                      <Sparkles size={20} className="absolute inset-0 m-auto text-[var(--brand-500)]" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Analisi IA in corso</p>
                      <p className="text-xs text-gray-400 mt-1">Estrazione codici, quantità e riferimenti...</p>
                    </div>
                  </div>
                )}

                {/* ── STEP 3: Conferma dati ── */}
                {step === 3 && aiResult && (
                  <>
                    {/* AI result summary */}
                    <div className="p-3 bg-[var(--brand-50)] dark:bg-gray-800 rounded-[var(--radius)] border border-[var(--brand-100)] dark:border-gray-700">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-[var(--brand-500)] flex items-center gap-1">
                          <Sparkles size={12} /> Rilevato dall'IA
                        </p>
                        <ConfBadge level={aiResult.confidenza} />
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                        {aiResult.codice      && <span>📦 Codice: <strong className="text-gray-900 dark:text-white">{aiResult.codice}</strong></span>}
                        {aiResult.quantita    && <span>🔢 Qty: <strong className="text-gray-900 dark:text-white">{aiResult.quantita}</strong></span>}
                        {aiResult.tipo        && <span>↕️ Tipo: <strong className="text-gray-900 dark:text-white">{aiResult.tipo}</strong></span>}
                        {aiResult.riferimento && <span>📋 Rif: <strong className="text-gray-900 dark:text-white">{aiResult.riferimento}</strong></span>}
                        {aiResult.categoria   && <span className="col-span-2">🗂️ Cat: <strong className="text-gray-900 dark:text-white">{aiResult.categoria}</strong></span>}
                      </div>
                      {aiResult.motivo_confidenza && (
                        <p className="text-[10px] text-gray-400 mt-2 italic">{aiResult.motivo_confidenza}</p>
                      )}
                    </div>

                    {/* Prodotto trovato */}
                    <div>
                      <label className="form-label">Prodotto in magazzino</label>
                      {searching ? (
                        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-[var(--radius)] text-sm text-gray-400">
                          <Loader2 size={14} className="animate-spin" /> Ricerca prodotto...
                        </div>
                      ) : matchedProduct ? (
                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-[var(--radius)] border border-green-200 dark:border-green-800 flex items-start gap-3">
                          <CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{matchedProduct.name}</p>
                            <p className="text-xs text-gray-500 font-mono">{matchedProduct.code}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              Stock attuale: <strong>{matchedProduct.quantity} {matchedProduct.unit}</strong>
                              {matchedProduct.location && <> · {matchedProduct.location}</>}
                            </p>
                          </div>
                          <button
                            onClick={() => setMatchedProduct(null)}
                            className="text-gray-400 hover:text-red-500 shrink-0"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-[var(--radius)] border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-700 dark:text-yellow-400">
                            <AlertCircle size={14} className="shrink-0" />
                            Prodotto non trovato automaticamente — cerca manualmente
                          </div>
                          <div className="flex gap-2">
                            <input
                              className="form-input flex-1 font-mono"
                              placeholder="Cerca codice..."
                              value={searchCode}
                              onChange={(e) => setSearchCode(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && searchProduct(searchCode)}
                            />
                            <button
                              className="btn btn-md btn-secondary gap-1"
                              onClick={() => searchProduct(searchCode)}
                            >
                              <RefreshCw size={14} /> Cerca
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tipo movimento */}
                    <div>
                      <label className="form-label">Tipo movimento</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setTipo("IN")}
                          className={clsx("py-3 rounded-[var(--radius)] text-sm font-bold flex items-center justify-center gap-2 border-2 transition-all",
                            tipo === "IN"
                              ? "border-green-500 bg-green-500 text-white"
                              : "border-gray-200 dark:border-gray-700 text-gray-500 hover:border-green-300"
                          )}
                        >
                          <ArrowDown size={15} /> Entrata
                        </button>
                        <button
                          onClick={() => setTipo("OUT")}
                          className={clsx("py-3 rounded-[var(--radius)] text-sm font-bold flex items-center justify-center gap-2 border-2 transition-all",
                            tipo === "OUT"
                              ? "border-red-500 bg-red-500 text-white"
                              : "border-gray-200 dark:border-gray-700 text-gray-500 hover:border-red-300"
                          )}
                        >
                          <ArrowUp size={15} /> Uscita
                        </button>
                      </div>
                    </div>

                    {/* Quantità */}
                    <div>
                      <label className="form-label">Quantità</label>
                      <input
                        type="number" inputMode="numeric" min={1}
                        className="form-input text-lg font-semibold tabular-nums"
                        value={quantita}
                        placeholder="0"
                        onChange={(e) => setQuantita(e.target.value.replace(/[^0-9]/g, ""))}
                      />
                    </div>

                    {/* Riferimento / Commessa */}
                    <div>
                      <label className="form-label">Commessa / Riferimento <span className="text-gray-400 font-normal text-xs">(opzionale)</span></label>
                      <input
                        className="form-input font-mono"
                        placeholder="es. C.O 856, N.Ordine 1234..."
                        value={riferimento}
                        onChange={(e) => setRiferimento(e.target.value)}
                      />
                    </div>

                    {/* Note */}
                    {(note || aiResult.note) && (
                      <div>
                        <label className="form-label">Note</label>
                        <input
                          className="form-input"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                        />
                      </div>
                    )}

                    {/* Azioni */}
                    <div className="flex gap-2 pt-1">
                      <button
                        className="btn btn-md btn-secondary gap-1"
                        onClick={reset}
                      >
                        <RefreshCw size={14} /> Nuova foto
                      </button>
                      <button
                        className={clsx(
                          "btn btn-lg flex-1 gap-2 text-white",
                          tipo === "IN"
                            ? "bg-green-500 hover:bg-green-600"
                            : "bg-red-500 hover:bg-red-600",
                          (!matchedProduct || moveMutation.isPending) && "opacity-50 cursor-not-allowed"
                        )}
                        disabled={!matchedProduct || moveMutation.isPending}
                        onClick={handleSubmit}
                      >
                        {moveMutation.isPending ? (
                          <><Loader2 size={15} className="animate-spin" /> Registrazione...</>
                        ) : (
                          <><Send size={15} /> Conferma {tipo === "IN" ? "Entrata" : "Uscita"}</>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
