/**
 * pages/ForgotPasswordPage.jsx
 *
 * Chiede solo lo username (non l'email, per coerenza col login classico).
 * La risposta del backend è sempre generica per non rivelare quali
 * username esistono o hanno un'email associata.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { m as motion } from "framer-motion";
import { Package, ArrowLeft, MailCheck } from "lucide-react";
import { authAPI } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [username, setUsername] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [error,    setError]    = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await authAPI.forgotPassword(username.trim());
      setSent(true);
    } catch (err) {
      // Il 429 (troppe richieste) non dice nulla sull'esistenza dell'account, quindi è l'unico
      // errore mostrato; per tutto il resto resta la risposta generica, come per il successo.
      if (err.response?.status === 429) {
        setError(err.response?.data?.message || "Troppe richieste. Riprova tra qualche minuto.");
      } else {
        setSent(true);
      }
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Password dimenticata</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {sent ? "Controlla la tua email" : "Ti mandiamo un link per reimpostarla"}
          </p>
        </div>

        <div className="card p-6 shadow-card">
          {sent ? (
            <div className="text-center py-2">
              <MailCheck size={36} className="mx-auto text-green-500 mb-3"/>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Se l'account <strong>{username}</strong> esiste e ha un'email associata, a breve riceverai
                un link per reimpostare la password. Il link scade dopo un'ora.
              </p>
              <p className="text-xs text-gray-400 mt-3">
                Nessuna email in arrivo? L'account potrebbe non avere un'email configurata:
                rivolgiti a un amministratore.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label">Username</label>
                <input className="form-input" placeholder="Il tuo username" autoFocus
                  value={username} autoCapitalize="none" autoCorrect="off" spellCheck="false"
                  onChange={e => setUsername(e.target.value)}/>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button type="submit" disabled={loading || !username.trim()} className="btn btn-lg btn-primary w-full mt-2">
                {loading ? "Invio in corso..." : "Invia link di reset"}
              </button>
            </form>
          )}
        </div>

        <Link to="/login" className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mt-4">
          <ArrowLeft size={14}/> Torna al login
        </Link>
      </motion.div>
    </div>
  );
}
