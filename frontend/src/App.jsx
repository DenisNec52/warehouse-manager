/**
 * App.jsx
 *
 * Router principale con:
 * - Verifica sessione al mount
 * - Page transitions Framer Motion
 * - Route protette (RequireAuth)
 */
import { useEffect, useState, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuthStore, useThemeStore } from "@/lib/store";
import { authAPI } from "@/lib/api";

// Pages — nel bundle iniziale solo quelle del primo accesso
import LoginPage          from "@/pages/LoginPage";
import HomePage           from "@/pages/HomePage";
import NotFoundPage       from "@/pages/NotFoundPage";

// Tutte le altre on-demand: ognuna diventa un chunk separato scaricato alla prima visita
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPasswordPage"));
const ResetPasswordPage  = lazy(() => import("@/pages/ResetPasswordPage"));
const BadgeLoginPage     = lazy(() => import("@/pages/BadgeLoginPage"));
const DashboardPage      = lazy(() => import("@/pages/DashboardPage"));
const ProductsPage       = lazy(() => import("@/pages/ProductsPage"));
const ProductDetail      = lazy(() => import("@/pages/ProductDetailPage"));
const MovementsPage      = lazy(() => import("@/pages/MovementsPage"));
const CategoriesPage     = lazy(() => import("@/pages/CategoriesPage"));
const UsersPage          = lazy(() => import("@/pages/UsersPage"));
const NotificationsPage  = lazy(() => import("@/pages/NotificationsPage"));
const SettingsPage       = lazy(() => import("@/pages/SettingsPage"));
const ChecklistPage      = lazy(() => import("@/pages/ChecklistPage"));
// Usa recharts (libreria pesante) e serve solo ad admin/supervisore
const ChecklistAdminPage = lazy(() => import("@/pages/ChecklistAdminPage"));
// Modulo produzione saldatura (Andon Board / Tempi standard)
const AndonBoardPage     = lazy(() => import("@/pages/AndonBoardPage"));
const StandardTimesPage  = lazy(() => import("@/pages/StandardTimesPage"));
const AdminPage          = lazy(() => import("@/pages/AdminPage"));
const DepartmentsPage    = lazy(() => import("@/pages/DepartmentsPage"));

// Un solo punto per il fallback di caricamento delle pagine lazy
const page = (el) => <Suspense fallback={<RouteLoader/>}>{el}</Suspense>;

// Layout
import AppLayout from "@/components/layout/AppLayout";

function RouteLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-6 h-6 border-2 border-[var(--brand-500)] border-t-transparent rounded-full animate-spin"/>
    </div>
  );
}

// Circa 2 minuti in tutto (6 tentativi con timeout di 15s + attese crescenti):
// abbastanza per l'avvio a freddo di un servizio Render free.
const BOOT_MAX_ATTEMPTS = 6;

function ServerStatus({ state }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
      {state === "waking" ? (
        <>
          <div className="w-8 h-8 border-2 border-[var(--brand-500)] border-t-transparent rounded-full animate-spin"/>
          <p className="text-sm text-gray-500">Il server si sta avviando, attendi qualche secondo…</p>
        </>
      ) : (
        <>
          <p className="font-semibold text-gray-900 dark:text-white">Server non raggiungibile</p>
          <p className="text-sm text-gray-500">La tua sessione non è stata chiusa. Controlla la connessione e riprova.</p>
          <button className="btn btn-md btn-primary" onClick={() => window.location.reload()}>Riprova</button>
        </>
      )}
    </div>
  );
}

// ── Route protetta ────────────────────────────────────────────
function RequireAuth({ children }) {
  const { user, loading } = useAuthStore();
  const location = useLocation();

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-[var(--brand-500)] border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

// ── Route solo admin ──────────────────────────────────────────
function RequireAdmin({ children }) {
  const { user } = useAuthStore();
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

// ── Route admin o supervisore ───────────────────────────────────
function RequireSupervisor({ children }) {
  const { user } = useAuthStore();
  if (!["admin","supervisore"].includes(user?.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { setUser, setLoading, setUnread } = useAuthStore();
  const { loadFromProfile, applyTheme }    = useThemeStore();
  const location = useLocation();

  // "ok" | "waking" (server in avvio, si ritenta) | "offline" (non raggiungibile)
  const [serverState, setServerState] = useState("ok");

  // Verifica sessione al mount. Solo un 401 vuol dire "non loggato": timeout ed errori
  // di rete/5xx (es. backend Render che si risveglia dopo l'inattività) si ritentano,
  // altrimenti l'utente verrebbe mandato al login con un cookie ancora valido.
  useEffect(() => {
    let cancelled = false;
    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    (async () => {
      for (let attempt = 1; !cancelled; attempt++) {
        try {
          const res = await authAPI.me();
          if (cancelled) return;
          setUser(res.data.user);
          setUnread(res.data.unreadNotifications || 0);
          loadFromProfile(res.data.user?.theme);
          break;
        } catch (err) {
          if (cancelled) return;
          if (err.response?.status === 401) { setUser(null); break; }
          if (attempt >= BOOT_MAX_ATTEMPTS) { setServerState("offline"); return; }
          setServerState("waking");
          await wait(Math.min(2000 * attempt, 10000));
        }
      }
      if (!cancelled) { setServerState("ok"); setLoading(false); }
    })();

    // Applica tema salvato in localStorage
    applyTheme();
    return () => { cancelled = true; };
    // Una sola volta all'avvio (le azioni degli store Zustand non cambiano)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (serverState !== "ok") return <ServerStatus state={serverState}/>;

  return (
    <Routes location={location}>

      {/* Login — redirect se già loggato */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={page(<ForgotPasswordPage/>)} />
      <Route path="/reset-password"  element={page(<ResetPasswordPage/>)} />
      <Route path="/badge"           element={page(<BadgeLoginPage/>)} />

      {/* App protetta */}
      <Route path="/" element={
        <RequireAuth>
          <AppLayout />
        </RequireAuth>
      }>
      <Route index element={<HomePage/>}/>
      <Route path="warehouse"        element={page(<DashboardPage/>)}/>
      <Route path="products"         element={page(<ProductsPage/>)}/>
      <Route path="products/:id"     element={page(<ProductDetail/>)}/>
      <Route path="movements"        element={page(<MovementsPage/>)}/>
      <Route path="admin/departments" element={
        <RequireAdmin>{page(<DepartmentsPage/>)}</RequireAdmin>
      }/>
      <Route path="admin" element={
        <RequireAdmin>{page(<AdminPage/>)}</RequireAdmin>
      }/>
      <Route path="categories" element={
        <RequireAdmin>{page(<CategoriesPage/>)}</RequireAdmin>
      }/>
      <Route path="notifications"    element={page(<NotificationsPage/>)}/>
      <Route path="settings"         element={page(<SettingsPage/>)}/>
      <Route path="checklist"        element={page(<ChecklistPage/>)}/>
      <Route path="production"       element={page(<AndonBoardPage/>)}/>
      <Route path="production/standard-times" element={page(<StandardTimesPage/>)}/>
      <Route path="users" element={
        <RequireSupervisor>{page(<UsersPage/>)}</RequireSupervisor>
      }/>
      <Route path="admin/checklist" element={
        <RequireSupervisor>{page(<ChecklistAdminPage/>)}</RequireSupervisor>
      }/>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
