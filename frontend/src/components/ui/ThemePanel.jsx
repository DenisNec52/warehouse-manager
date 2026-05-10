/**
 * components/ui/ThemePanel.jsx
 *
 * Pannello laterale per personalizzare tema, colore e stile.
 * Salva il tema nel profilo utente sul backend.
 */
import { motion } from "framer-motion";
import { X, Check } from "lucide-react";
import { useThemeStore } from "@/lib/store";
import { authAPI } from "@/lib/api";
import clsx from "clsx";

const MODES    = [
  { id:"light", label:"Chiaro",  icon:"☀️" },
  { id:"dark",  label:"Scuro",   icon:"🌙" },
  { id:"steel", label:"Acciaio", icon:"🔩" },
];
const ACCENTS  = [
  { id:"blue",   label:"Blu",    hex:"#3b82f6" },
  { id:"green",  label:"Verde",  hex:"#10b981" },
  { id:"purple", label:"Viola",  hex:"#8b5cf6" },
  { id:"orange", label:"Arancio",hex:"#f97316" },
  { id:"red",    label:"Rosso",  hex:"#ef4444" },
  { id:"teal",   label:"Teal",   hex:"#14b8a6" },
];
const RADII    = [
  { id:"none",  label:"Quadro"  },
  { id:"sm",    label:"Lieve"   },
  { id:"md",    label:"Medio"   },
  { id:"lg",    label:"Grande"  },
  { id:"full",  label:"Pill"    },
];

export default function ThemePanel({ onClose }) {
  const { mode, accent, customAccent, radius, setMode, setAccent, setRadius } = useThemeStore();

  const save = async (newMode, newAccent, newRadius) => {
    try {
      await authAPI.theme({ mode: newMode, accentColor: newAccent, radius: newRadius });
    } catch {}
  };

  const handleMode = (m) => { setMode(m); save(m, accent, radius); };
  const handleAccent = (a, hex) => { setAccent(a, hex); save(mode, a, radius); };
  const handleRadius = (r) => { setRadius(r); save(mode, accent, r); };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end">
      <motion.div
        initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ x:"100%" }} animate={{ x:0 }} exit={{ x:"100%" }}
        transition={{ type:"spring", damping:28, stiffness:280 }}
        className="relative z-10 w-full sm:w-80 h-full bg-white dark:bg-gray-900 border-l border-gray-100 dark:border-gray-800 flex flex-col shadow-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Personalizza tema</h3>
            <p className="text-xs text-gray-400 mt-0.5">Salvato nel tuo profilo</p>
          </div>
          <button className="btn btn-ghost btn-sm p-1.5" onClick={onClose}><X size={16}/></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Modalità */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Modalità</p>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map(m => (
                <button key={m.id}
                  onClick={() => handleMode(m.id)}
                  className={clsx(
                    "flex flex-col items-center gap-1.5 py-3 rounded border-2 text-xs font-medium transition-all",
                    mode === m.id
                      ? "border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--brand-600)] dark:bg-[var(--brand-500)]/10"
                      : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                  )}
                >
                  <span className="text-xl">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Colore principale */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Colore principale</p>
            <div className="flex gap-2 flex-wrap">
              {ACCENTS.map(a => (
                <button key={a.id} onClick={() => handleAccent(a.id, "")}
                  title={a.label}
                  className={clsx(
                    "w-9 h-9 rounded-full transition-all relative flex items-center justify-center",
                    accent === a.id ? "ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-900 scale-110" : "hover:scale-105"
                  )}
                  style={{ background: a.hex }}
                >
                  {accent === a.id && <Check size={14} className="text-white"/>}
                </button>
              ))}
            </div>
            {/* Custom color picker */}
            <div className="flex items-center gap-3 mt-3">
              <label className="text-xs text-gray-500 flex-1">Colore personalizzato</label>
              <input type="color"
                defaultValue={customAccent || "#3b82f6"}
                onChange={(e) => handleAccent("custom", e.target.value)}
                className="w-10 h-8 cursor-pointer border border-gray-200 dark:border-gray-700 rounded p-0.5 bg-white dark:bg-gray-800"
              />
            </div>
          </div>

          {/* Bordi */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Stile bordi</p>
            <div className="grid grid-cols-5 gap-1.5">
              {RADII.map(r => (
                <button key={r.id} onClick={() => handleRadius(r.id)}
                  className={clsx(
                    "py-2 text-xs font-medium transition-all border-2",
                    `rounded-${r.id === "none" ? "none" : r.id}`,
                    radius === r.id
                      ? "border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--brand-600)] dark:bg-[var(--brand-500)]/10"
                      : "border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-400 mb-3">Anteprima</p>
            <div className="card p-3 mb-2">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Card esempio</p>
              <p className="text-xs text-gray-400 mt-0.5">Contenuto con bordi e ombra</p>
            </div>
            <button className="btn btn-md btn-primary w-full">Pulsante principale</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
