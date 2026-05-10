/**
 * pages/LoginPage.jsx
 */
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Package, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useAuthStore, useThemeStore } from "@/lib/store";
import { authAPI } from "@/lib/api";
import toast from "react-hot-toast";

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

  useEffect(() => { if (user) navigate(from, { replace: true }); }, [user]);

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
              <label className="form-label">Password</label>
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
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Demo: <span className="font-mono">admin / Admin123!</span>
        </p>
      </motion.div>
    </div>
  );
}
