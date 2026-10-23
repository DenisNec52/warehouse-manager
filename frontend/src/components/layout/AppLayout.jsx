/**
 * components/layout/AppLayout.jsx
 *
 * Layout principale dell'app con:
 * - Sidebar con navigazione
 * - Topbar con utente, tema, notifiche
 * - Outlet per le pagine figlie
 */
import { useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { m as motion, AnimatePresence } from "framer-motion";
import {
  Package, ArrowLeftRight, Tag, Users, Bell,
  Settings, LogOut, Menu, X, Sun, Moon, Palette,
  Home, ClipboardCheck, ClipboardList, Timer, Clock, ShieldCheck, Factory, Crown
} from "lucide-react";
import { useAuthStore, useThemeStore } from "@/lib/store";
import { authAPI } from "@/lib/api";
import { pageVariants } from "@/lib/motion";
import toast from "react-hot-toast";
import ThemePanel from "@/components/ui/ThemePanel";
import NotificationBell from "@/components/ui/NotificationBell";
import CopyrightNotice from "@/components/ui/CopyrightNotice";
import clsx from "clsx";

const NAV = [
  { to:"/",          label:"Home",       icon:Home,            exact:true },
  { key:"checklist",      to:"/checklist", label:"Pulizia 5S", icon:ClipboardCheck },
  { key:"products",       to:"/products",  label:"Magazzino",  icon:Package        },
  { key:"movements",      to:"/movements", label:"Movimenti",  icon:ArrowLeftRight },
  { key:"production",     to:"/production", label:"Andon Board", icon:Timer, exact:true },
  { key:"standard-times", to:"/production/standard-times", label:"Tempi standard", icon:Clock },
];

// Visibili ad admin e supervisore
const NAV_SUPERVISOR = [
  { key:"users",           to:"/users",           label:"Utenti",       icon:Users         },
  { key:"admin-checklist", to:"/admin/checklist", label:"Gestione 5S",  icon:ClipboardList },
];

// Visibili solo ad admin
const NAV_ADMIN = [
  { key:"admin",       to:"/admin",           label:"Amministrazione", icon:ShieldCheck, exact:true },
  { key:"departments", to:"/admin/departments", label:"Reparti",    icon:Factory       },
  { key:"categories",  to:"/categories",      label:"Categorie",    icon:Tag           },
];

const NAV_BOTTOM = [
  { to:"/notifications",label:"Notifiche",    icon:Bell },
  { to:"/settings",     label:"Impostazioni", icon:Settings },
];

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [themeOpen,   setThemeOpen]   = useState(false);
  const { user, logout, settings }  = useAuthStore();
  const { mode, setMode } = useThemeStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Visibilità moduli decisa dal super-admin (strato UI; i controlli veri sono lato server).
  // Il super-admin vede tutto. Senza una regola per quel modulo → visibile.
  const canSee = (key) => {
    if (!key || user?.isSuperAdmin) return true;
    const allowed = settings?.moduleVisibility?.[key];
    return !Array.isArray(allowed) || allowed.includes(user?.role);
  };
  const visible = (items) => items.filter((i) => canSee(i.key));
  const appName = settings?.appName || "Warehouse Manager";

  const handleLogout = async () => {
    await authAPI.logout().catch(() => {});
    logout();
    navigate("/login");
    toast.success("Disconnesso correttamente");
  };

  const toggleDark = () => setMode(mode === "dark" ? "light" : "dark");

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Overlay mobile ────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 bg-black/40 z-30 lg:hidden backdrop-blur-xs"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ───────────────────────────────── */}
      <aside className={clsx(
        "fixed top-0 left-0 h-full w-[260px] bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800",
        "flex flex-col z-40 transition-transform duration-300 ease-out",
        "lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-(--brand-500) rounded-sm flex items-center justify-center">
              <Package size={16} className="text-white"/>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">{appName}</p>
            </div>
          </div>
          <button className="lg:hidden btn btn-ghost btn-sm p-1.5" onClick={() => setSidebarOpen(false)}>
            <X size={16}/>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-3 mb-2">Menu</p>
          {visible(NAV).map(({ to, label, icon:Icon, exact }) => (
            <NavLink key={to} to={to} end={exact}
              className={({ isActive }) => clsx("nav-item", isActive && "active")}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={16} className="shrink-0"/>
              <span>{label}</span>
            </NavLink>
          ))}

          {["admin","supervisore"].includes(user?.role) && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-3 mt-4 mb-2">Gestione</p>
              {visible(NAV_SUPERVISOR).map(({ to, label, icon:Icon }) => (
                <NavLink key={to} to={to}
                  className={({ isActive }) => clsx("nav-item", isActive && "active")}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon size={16} className="shrink-0"/>
                  <span>{label}</span>
                </NavLink>
              ))}
            </>
          )}

          {user?.role === "admin" && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-3 mt-4 mb-2">Admin</p>
              {visible(NAV_ADMIN).map(({ to, label, icon:Icon, exact }) => (
                <NavLink key={to} to={to} end={exact}
                  className={({ isActive }) => clsx("nav-item", isActive && "active")}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon size={16} className="shrink-0"/>
                  <span>{label}</span>
                </NavLink>
              ))}
            </>
          )}

          {user?.isSuperAdmin && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-3 mt-4 mb-2">Super-admin</p>
              <NavLink to="/superadmin"
                className={({ isActive }) => clsx("nav-item", isActive && "active")}
                onClick={() => setSidebarOpen(false)}
              >
                <Crown size={16} className="shrink-0"/>
                <span>Impostazioni app</span>
              </NavLink>
            </>
          )}

          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-0.5">
            {NAV_BOTTOM.map(({ to, label, icon:Icon }) => (
              <NavLink key={to} to={to}
                className={({ isActive }) => clsx("nav-item", isActive && "active")}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={16} className="shrink-0"/>
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        {/* User block */}
        <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-sm bg-gray-50 dark:bg-gray-800">
            <div className="w-8 h-8 rounded-full bg-(--brand-500) flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
            </div>
            <button className="btn btn-ghost btn-sm p-1.5 text-gray-400 hover:text-red-500" onClick={handleLogout} title="Logout">
              <LogOut size={14}/>
            </button>
          </div>
          <CopyrightNotice className="mt-3"/>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────── */}
      <div className="flex-1 flex flex-col lg:ml-[260px] min-w-0">

        {/* Topbar */}
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 h-14 flex items-center px-4 lg:px-6 gap-4">
          <button className="lg:hidden btn btn-ghost btn-sm p-1.5" onClick={() => setSidebarOpen(true)}>
            <Menu size={18}/>
          </button>
          <div className="flex-1"/>
          <div className="flex items-center gap-1">
            {/* Dark mode toggle */}
            <button className="btn btn-ghost btn-sm p-2 rounded-sm" onClick={toggleDark} title="Cambia tema">
              {mode === "dark" ? <Sun size={16}/> : <Moon size={16}/>}
            </button>
            {/* Theme panel */}
            <button className="btn btn-ghost btn-sm p-2 rounded-sm" onClick={() => setThemeOpen(true)} title="Personalizza">
              <Palette size={16}/>
            </button>
            {/* Notifiche */}
            <NotificationBell/>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname}
              variants={pageVariants} initial="initial" animate="enter" exit="exit">
              <Outlet/>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Theme panel */}
      <AnimatePresence>
        {themeOpen && <ThemePanel onClose={() => setThemeOpen(false)}/>}
      </AnimatePresence>
    </div>
  );
}
