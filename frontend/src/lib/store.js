/**
 * lib/store.js
 *
 * Zustand store globale per:
 * - stato autenticazione utente
 * - tema attivo (sincronizzato con profilo DB)
 * - notifiche non lette
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Auth Store ─────────────────────────────────────────────────
export const useAuthStore = create((set) => ({
  user:    null,
  loading: true,
  unread:  0,

  setUser:    (user)   => set({ user }),
  setLoading: (v)      => set({ loading: v }),
  setUnread:  (n)      => set({ unread: n }),
  logout:     ()       => set({ user: null, unread: 0 }),
}));

// ── Theme Store (persiste in localStorage) ────────────────────
const ACCENT_MAP = {
  blue:   { cls:"",          hex:"#3b82f6", dark:"#2563eb" },
  green:  { cls:"theme-green",  hex:"#10b981", dark:"#059669" },
  purple: { cls:"theme-purple", hex:"#8b5cf6", dark:"#7c3aed" },
  orange: { cls:"theme-orange", hex:"#f97316", dark:"#ea580c" },
  red:    { cls:"theme-red",    hex:"#ef4444", dark:"#dc2626" },
  teal:   { cls:"theme-teal",   hex:"#14b8a6", dark:"#0d9488" },
};

export const useThemeStore = create(
  persist(
    (set, get) => ({
      mode:        "light",  // light | dark | steel
      accent:      "blue",   // blue | green | purple | orange | red | teal | custom
      customAccent:"",
      radius:      "md",     // none | sm | md | lg | full

      /** Applica il tema al DOM */
      applyTheme: () => {
        const { mode, accent, customAccent, radius } = get();
        const root = document.documentElement;
        const body = document.body;

        // Modalità
        root.classList.toggle("dark", mode === "dark" || mode === "steel");

        // Accento
        Object.values(ACCENT_MAP).forEach(a => { if (a.cls) body.classList.remove(a.cls); });
        body.classList.remove("theme-custom");
        if (accent === "custom" && customAccent) {
          body.classList.add("theme-custom");
          body.style.setProperty("--custom-accent", customAccent);
          // Calcola dark/darker (semplice approssimazione)
          body.style.setProperty("--custom-accent-dark", customAccent);
          body.style.setProperty("--custom-accent-darker", customAccent);
        } else if (ACCENT_MAP[accent]?.cls) {
          body.classList.add(ACCENT_MAP[accent].cls);
        }

        // Radius
        ["radius-none","radius-sm","radius-md","radius-lg","radius-full"].forEach(c => body.classList.remove(c));
        body.classList.add(`radius-${radius}`);
      },

      setMode:   (mode)         => { set({ mode });         get().applyTheme(); },
      setAccent: (accent, hex)  => { set({ accent, customAccent: hex || "" }); get().applyTheme(); },
      setRadius: (radius)       => { set({ radius });       get().applyTheme(); },

      /** Carica il tema dal profilo utente */
      loadFromProfile: (theme) => {
        if (!theme) return;
        set({
          mode:        theme.mode   || "light",
          accent:      theme.accent || "blue",
          customAccent:theme.customAccent || "",
          radius:      theme.radius || "md",
        });
        get().applyTheme();
      },
    }),
    {
      name:    "wh_theme",
      partialize: (s) => ({ mode: s.mode, accent: s.accent, customAccent: s.customAccent, radius: s.radius }),
      onRehydrateStorage: () => (state) => { state?.applyTheme(); },
    }
  )
);
