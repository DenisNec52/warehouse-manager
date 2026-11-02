/**
 * components/layout/AppLayout.jsx
 *
 * - Desktop: barra laterale con le sezioni, comprimibile a sole icone (scelta salvata).
 * - Telefono: barra in basso come un'app nativa; "Altro" apre il menu completo.
 * - Barra in alto: ricerca rapida (Ctrl+K), tema, personalizzazione, notifiche.
 */
import { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { m as motion, AnimatePresence } from "framer-motion";
import {
  Package, LogOut, X, Sun, Moon, Palette, Search, PanelLeftClose, PanelLeftOpen, MoreHorizontal,
} from "lucide-react";
import clsx from "clsx";
import toast from "react-hot-toast";
import { useAuthStore, useThemeStore } from "@/lib/store";
import { authAPI } from "@/lib/api";
import { pageVariants } from "@/lib/motion";
import { visibleSections, sectionOf } from "@/lib/navigation";
import ThemePanel from "@/components/ui/ThemePanel";
import NotificationBell from "@/components/ui/NotificationBell";
import CopyrightNotice from "@/components/ui/CopyrightNotice";
import CommandPalette from "@/components/layout/CommandPalette";

const COLLAPSE_KEY = "wh_sidebar_collapsed";
const ROLE_LABEL = { admin: "Amministratore", supervisore: "Supervisore", operatore: "Operatore" };

export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const { user, logout, settings } = useAuthStore();
  const { mode, setMode } = useThemeStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const sections = visibleSections(user, settings);
  const current = sectionOf(sections, pathname);
  const appName = settings?.appName || "Warehouse Manager";
  // In basso al massimo 5 voci: se sono di più, l'ultima diventa "Altro".
  const bottom = sections.length > 5 ? sections.slice(0, 4) : sections;

  useEffect(() => { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); }, [collapsed]);
  useEffect(() => { setDrawerOpen(false); }, [pathname]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleLogout = async () => {
    await authAPI.logout().catch(() => {});
    logout();
    navigate("/login");
    toast.success("Disconnesso correttamente");
  };

  const sidebarBody = (narrow) => (
    <>
      <div className={clsx("flex items-center h-16 shrink-0", narrow ? "justify-center" : "px-5 gap-3")}>
        <div className="w-9 h-9 rounded-(--radius) bg-(--brand-500) flex items-center justify-center shrink-0"
          style={{ boxShadow: "0 6px 18px -4px var(--brand-glow)" }}>
          <Package size={18} className="text-white"/>
        </div>
        {!narrow && <p className="text-[15px] font-bold tracking-tight text-gray-900 dark:text-white truncate">{appName}</p>}
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto" aria-label="Menu principale">
        {sections.map((s) => {
          const Icon = s.icon;
          const active = current?.id === s.id;
          return (
            <NavLink key={s.id} to={s.tabs[0].to} title={narrow ? s.label : undefined}
              className={clsx("nav-item", active && "active", narrow && "justify-center px-0")}>
              {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-(--brand-500)"/>}
              <Icon size={19} className="shrink-0"/>
              {!narrow && <span>{s.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-200/70 dark:border-white/6">
        <div className={clsx("flex items-center gap-3 rounded-(--radius) p-2", !narrow && "bg-gray-50 dark:bg-white/4")}>
          <div className="w-9 h-9 rounded-full bg-linear-to-br from-(--brand-500) to-(--brand-700) flex items-center justify-center text-white text-sm font-bold shrink-0"
            title={narrow ? user?.name : undefined}>
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          {!narrow && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user?.name}</p>
              <p className="text-xs text-gray-400">{ROLE_LABEL[user?.role] || user?.role}</p>
            </div>
          )}
          {!narrow && (
            <button className="btn btn-ghost btn-sm w-8 px-0 hover:text-red-500" onClick={handleLogout} title="Esci" aria-label="Esci">
              <LogOut size={16}/>
            </button>
          )}
        </div>
        {!narrow && <CopyrightNotice className="mt-3"/>}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Barra laterale (desktop) ── */}
      <aside className={clsx(
        "hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col bg-white dark:bg-gray-900 border-r border-gray-200/70 dark:border-white/6 transition-[width] duration-200",
        collapsed ? "w-[76px]" : "w-(--sidebar-w)"
      )}>
        {sidebarBody(collapsed)}
      </aside>

      {/* ── Menu completo (telefono) ── */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-gray-950/40 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawerOpen(false)}/>
            <motion.aside className="fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-white dark:bg-gray-900 shadow-modal lg:hidden"
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "tween", duration: 0.22 }}>
              <button className="absolute top-4 right-3 btn btn-ghost btn-sm w-8 px-0" onClick={() => setDrawerOpen(false)} aria-label="Chiudi menu">
                <X size={18}/>
              </button>
              {sidebarBody(false)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Contenuto ── */}
      <div className={clsx("flex flex-col min-h-screen transition-[padding] duration-200", collapsed ? "lg:pl-[76px]" : "lg:pl-(--sidebar-w)")}>
        <header className="sticky top-0 z-20 h-16 flex items-center gap-2 px-4 lg:px-8 bg-gray-50/80 dark:bg-gray-950/80 backdrop-blur-xl border-b border-gray-200/60 dark:border-white/6">
          <button className="hidden lg:inline-flex btn btn-ghost btn-sm w-9 px-0" onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Espandi menu" : "Comprimi menu"} title={collapsed ? "Espandi menu" : "Comprimi menu"}>
            {collapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}
          </button>
          <p className="lg:hidden text-base font-bold text-gray-900 dark:text-white truncate">{current?.label || appName}</p>

          <button onClick={() => setPaletteOpen(true)}
            className="ml-auto lg:ml-2 flex items-center gap-2.5 h-10 w-10 sm:w-72 justify-center sm:justify-start sm:px-3 rounded-(--radius) bg-white dark:bg-white/4 border border-gray-200 dark:border-white/8 text-sm text-gray-400 hover:border-(--brand-500) transition-colors"
            aria-label="Cerca">
            <Search size={16} className="shrink-0"/>
            <span className="hidden sm:inline flex-1 text-left">Cerca articoli, pagine…</span>
            <span className="hidden sm:inline kbd">Ctrl K</span>
          </button>

          <div className="flex items-center gap-0.5 sm:ml-auto">
            <button className="btn btn-ghost btn-sm w-9 px-0" onClick={() => setMode(mode === "dark" ? "light" : "dark")}
              title="Tema chiaro / scuro" aria-label="Tema chiaro / scuro">
              {mode === "dark" ? <Sun size={18}/> : <Moon size={18}/>}
            </button>
            <button className="hidden sm:inline-flex btn btn-ghost btn-sm w-9 px-0" onClick={() => setThemeOpen(true)}
              title="Personalizza colori" aria-label="Personalizza colori">
              <Palette size={18}/>
            </button>
            <NotificationBell/>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 lg:px-8 py-6 pb-28 lg:pb-10">
          <AnimatePresence mode="wait">
            <motion.div key={current?.id ?? pathname} variants={pageVariants} initial="initial" animate="enter" exit="exit">
              <Outlet/>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ── Barra in basso (telefono) ── */}
      <nav aria-label="Menu rapido"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-t border-gray-200/70 dark:border-white/8 pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {bottom.map((s) => {
            const Icon = s.icon;
            const active = current?.id === s.id;
            return (
              <NavLink key={s.id} to={s.tabs[0].to}
                className={clsx("flex-1 flex flex-col items-center justify-center gap-1 h-16 text-[11px] font-semibold transition-colors",
                  active ? "text-(--brand-500)" : "text-gray-400")}>
                <span className={clsx("flex items-center justify-center w-14 h-8 rounded-full transition-all", active && "bg-(--brand-50)")}>
                  <Icon size={20}/>
                </span>
                {s.label}
              </NavLink>
            );
          })}
          {sections.length > 5 && (
            <button onClick={() => setDrawerOpen(true)}
              className="flex-1 flex flex-col items-center justify-center gap-1 h-16 text-[11px] font-semibold text-gray-400">
              <span className="flex items-center justify-center w-14 h-8"><MoreHorizontal size={20}/></span>
              Altro
            </button>
          )}
        </div>
      </nav>

      <AnimatePresence>
        {themeOpen && <ThemePanel key="theme" onClose={() => setThemeOpen(false)}/>}
        {paletteOpen && <CommandPalette key="palette" onClose={() => setPaletteOpen(false)}/>}
      </AnimatePresence>
    </div>
  );
}
