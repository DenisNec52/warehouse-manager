/**
 * pages/BadgeLoginPage.jsx — /badge#u=<id>&s=<segreto>&src=qr|nfc
 *
 * Destinazione dei QR e dei tag NFC aperti dalla fotocamera/dal telefono.
 * Il login avviene con una richiesta dell'app (POST /auth/badge-login), come quello con password.
 */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { parseBadgeUrl, useBadgeLogin } from "@/lib/badge";
import { useAuthStore } from "@/lib/store";

export default function BadgeLoginPage() {
  const badgeLogin = useBadgeLogin();
  const navigate = useNavigate();
  const { loading } = useAuthStore();
  const started = useRef(false);   // StrictMode esegue gli effect due volte in sviluppo

  useEffect(() => {
    // Aspetta la verifica sessione iniziale di App (/auth/me): se il suo 401 arrivasse
    // dopo il login da badge, azzererebbe l'utente appena entrato.
    if (loading || started.current) return;
    started.current = true;

    const badge = parseBadgeUrl(window.location.href);
    // Il segreto non deve restare nella barra degli indirizzi né nella cronologia.
    window.history.replaceState(null, "", "/badge");

    if (!badge) {
      navigate("/login?badge=error", { replace: true });
      return;
    }
    badgeLogin(badge, "/").catch(() => navigate("/login?badge=error", { replace: true }));
    // Solo quando termina la verifica iniziale della sessione: started impedisce un secondo login
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-gray-950 text-gray-500">
      <Loader2 className="animate-spin text-[var(--brand-500)]" size={28}/>
      <p className="text-sm">Accesso con badge in corso…</p>
    </div>
  );
}
