/**
 * lib/badge.js — login da badge QR/NFC
 *
 * Il badge contiene un URL. Formato attuale:   <sito>/badge#u=<id>&s=<segreto>&src=qr|nfc
 *                            badge più vecchi: <backend>/api/auth/badge/<id>/<segreto>?src=qr|nfc
 * In entrambi i casi il login avviene con POST /auth/badge-login dall'app, come quello con password.
 */
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { authAPI } from "@/lib/api";
import { useAuthStore, useThemeStore } from "@/lib/store";

/** Estrae { userId, secret, src } dal testo di un QR/tag, oppure null se non è un badge. */
export function parseBadgeUrl(text) {
  let url;
  try { url = new URL(String(text).trim()); } catch { return null; }

  let userId, secret, src;
  if (url.pathname.replace(/\/$/, "").endsWith("/badge")) {
    const p = new URLSearchParams(url.hash.slice(1));
    userId = p.get("u"); secret = p.get("s"); src = p.get("src");
  } else {
    const m = url.pathname.match(/\/api\/auth\/badge\/([a-f0-9]{24})\/([^/]+)$/i);
    if (!m) return null;
    [, userId, secret] = m;
    src = url.searchParams.get("src");
  }
  if (!/^[a-f0-9]{24}$/i.test(userId || "") || !secret) return null;
  return { userId, secret: decodeURIComponent(secret), src: src === "nfc" ? "nfc" : "qr" };
}

/** Login da badge con gli stessi effetti del login con password; lancia un errore se fallisce. */
export function useBadgeLogin() {
  const { setUser, setUnread } = useAuthStore();
  const { loadFromProfile } = useThemeStore();
  const navigate = useNavigate();

  return async (badge, redirectTo = "/") => {
    const res = await authAPI.badgeLogin(badge);
    setUser(res.data.user);
    setUnread(0);
    loadFromProfile(res.data.user?.theme);
    toast.success(`Benvenuto, ${res.data.user.name}!`);
    navigate(redirectTo, { replace: true });
    return res.data.user;
  };
}
