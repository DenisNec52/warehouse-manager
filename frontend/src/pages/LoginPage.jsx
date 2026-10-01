/**
 * pages/LoginPage.jsx
 */
import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { m as motion, AnimatePresence } from "framer-motion";
import { Package, Eye, EyeOff, AlertCircle, QrCode } from "lucide-react";
import { parseBadgeUrl, useBadgeLogin } from "@/lib/badge";
// Scanner e libreria QR scaricati solo quando si preme "Scansiona badge"
const QrScannerModal = lazy(() => import("@/components/ui/QrScannerModal"));
import { useAuthStore, useThemeStore } from "@/lib/store";
import { authAPI } from "@/lib/api";
import toast from "react-hot-toast";
import CopyrightNotice from "@/components/ui/CopyrightNotice";

export default function LoginPage() {
  const [form,    setForm]    = useState({ username:"", password:"" });
  const [showPw,  setShowPw]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const { user, setUser, setUnread } = useAuthStore();
  const { loadFromProfile } = useThemeStore();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";
  const badgeLogin = useBadgeLogin();
  const [scanning,     setScanning]     = useState(false);
  const [badgeLoading, setBadgeLoading] = useState(false);

  // Chiamata dallo scanner a ogni QR letto: true se era un badge (accettato o rifiutato dal server)
  const handleScan = async (text) => {
    const badge = parseBadgeUrl(text);
    if (!badge) return false;
    setBadgeLoading(true);
    try {
      await badgeLogin(badge, from);
    } catch (err) {
      setScanning(false);
      setError(err.response?.status === 429
        ? "Troppe scansioni ravvicinate. Attendi qualche minuto."
        : "Badge non valido, revocato o disattivato: accedi con le credenziali oppure chiedine uno nuovo all'amministratore.");
    } finally {
      setBadgeLoading(false);
    }
    return true;
  };

  // Solo quando l'utente diventa loggato (from e navigate non cambiano durante la visita)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (user) navigate(from, { replace: true }); }, [user]);

  // Login automatico da QR/NFC non riuscito (badge disattivato, revocato o link non valido)
  useEffect(() => {
    if (new URLSearchParams(location.search).get("badge") === "error") {
      setError("Accesso automatico non riuscito. Il badge potrebbe essere stato revocato o disattivato: accedi con le credenziali oppure chiedine uno nuovo all'amministratore.");
      navigate("/login", { replace: true });
    }
    // Una volta all'apertura: poi il parametro viene tolto dall'URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await authAPI.login(form);
      setUser(res.data.user);
      setUnread(0);
      loadFromProfile(res.data.user?.theme);
      toast.success(`Benvenuto, ${res.data.user.name}!`);
      navigate(from, { replace: true });
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) setError("Troppi tentativi. Attendi 15 minuti.");
      else setError("Username o password non corretti.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4">
      <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:.4 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[var(--brand-500)] rounded-[var(--radius)] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[var(--brand-500)]/20">
            <Package size={28} className="text-white"/>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Warehouse Pro</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Accedi al pannello di gestione</p>
        </div>

        {/* Card form */}
        <div className="card p-6 shadow-card">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm mb-4">
              <AlertCircle size={15} className="shrink-0"/>
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">Username</label>
              <input className="form-input" placeholder="Inserisci username"
                value={form.username} autoCapitalize="none" autoCorrect="off" spellCheck="false"
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}/>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="form-label mb-0">Password</label>
                <Link to="/forgot-password" className="text-xs text-[var(--brand-500)] hover:underline mb-1.5">
                  Password dimenticata?
                </Link>
              </div>
              <div className="relative">
                <input className="form-input pr-10" type={showPw ? "text" : "password"} placeholder="Inserisci password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}/>
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPw(v => !v)}>
                  {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading || !form.username || !form.password}
              className="btn btn-lg btn-primary w-full mt-2">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                  Accesso in corso...
                </span>
              ) : "Accedi"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-4 text-xs text-gray-400">
            <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700"/> oppure <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700"/>
          </div>
          <button type="button" onClick={() => { setError(""); setScanning(true); }}
            className="btn btn-lg btn-secondary w-full gap-2">
            <QrCode size={18}/> Scansiona badge QR
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-4">
          Con un tag NFC basta avvicinarlo al telefono: si apre l'app e l'accesso è automatico.
        </p>
        <CopyrightNotice className="mt-3"/>
      </motion.div>

      <AnimatePresence>
        {scanning && (
          <Suspense fallback={null}>
            <QrScannerModal onDetected={handleScan} busy={badgeLoading} onClose={() => setScanning(false)}/>
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
