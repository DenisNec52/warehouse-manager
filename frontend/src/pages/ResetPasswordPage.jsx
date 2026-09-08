/**
 * pages/ResetPasswordPage.jsx
 *
 * Pagina raggiunta dal link ricevuto via email (?uid=...&token=...).
 * Se il reset va a buon fine, il login avviene in automatico (stesso
 * cookie httpOnly del login classico) e l'utente entra direttamente.
 */
import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Package, Eye, EyeOff, AlertCircle, ArrowLeft } from "lucide-react";
import { authAPI } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import toast from "react-hot-toast";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const uid   = params.get("uid");
  const token = params.get("token");
  const navigate = useNavigate();
  const { setUser } = useAuthStore();

  const [form,    setForm]    = useState({ newPassword: "", confirm: "" });
  const [showPw,  setShowPw]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const linkValid = !!uid && !!token;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.newPassword.length < 6) return setError("La password deve avere almeno 6 caratteri.");
    if (form.newPassword !== form.confirm) return setError("Le password non coincidono.");

    setError(""); setLoading(true);
    try {
      const res = await authAPI.resetPassword(uid, token, form.newPassword);
      setUser(res.data.user);
      toast.success("Password aggiornata — sei dentro!");
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Link scaduto o non valido. Richiedine uno nuovo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .4 }}
        className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[var(--brand-500)] rounded-[var(--radius)] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[var(--brand-500)]/20">
            <Package size={28} className="text-white"/>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Nuova password</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Sceglila e sarai reindirizzato dentro l'app</p>
        </div>

        <div className="card p-6 shadow-card">
          {!linkValid ? (
            <div className="flex items-center gap-2 p-3 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle size={15} className="shrink-0"/> Link non valido: apri di nuovo il link dall'email ricevuta.
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-center gap-2 p-3 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm mb-4">
                  <AlertCircle size={15} className="shrink-0"/> {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="form-label">Nuova password</label>
                  <div className="relative">
                    <input className="form-input pr-10" type={showPw ? "text" : "password"} placeholder="Minimo 6 caratteri" autoFocus
                      value={form.newPassword} onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}/>
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowPw(v => !v)}>
                      {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="form-label">Conferma password</label>
                  <input className="form-input" type={showPw ? "text" : "password"} placeholder="Ripeti la password"
                    value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}/>
                </div>
                <button type="submit" disabled={loading || !form.newPassword || !form.confirm} className="btn btn-lg btn-primary w-full mt-2">
                  {loading ? "Salvataggio..." : "Reimposta password"}
                </button>
              </form>
            </>
          )}
        </div>

        <Link to="/login" className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mt-4">
          <ArrowLeft size={14}/> Torna al login
        </Link>
      </motion.div>
    </div>
  );
}
