/**
 * App.jsx
 *
 * Router principale con:
 * - Verifica sessione al mount
 * - Page transitions Framer Motion
 * - Route protette (RequireAuth)
 */
import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore, useThemeStore } from "@/lib/store";
import { authAPI } from "@/lib/api";
import toast from "react-hot-toast";

// Pages — nel bundle iniziale solo quelle del primo accesso
import LoginPage          from "@/pages/LoginPage";
import HomePage           from "@/pages/HomePage";
import NotFoundPage       from "@/pages/NotFoundPage";

// Tutte le altre on-demand: ognuna diventa un chunk separato scaricato alla prima visita
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPasswordPage"));
const ResetPasswordPage  = lazy(() => import("@/pages/ResetPasswordPage"));
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
  const navigate = useNavigate();

  // Verifica sessione al mount
  useEffect(() => {
    authAPI.me()
      .then(res => {
        setUser(res.data.user);
        setUnread(res.data.unreadNotifications || 0);
        loadFromProfile(res.data.user?.theme);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    // Applica tema salvato in localStorage
    applyTheme();
  }, []);

  // Conferma login automatico da QR/NFC (redirect dal backend con ?badge=ok)
  useEffect(() => {
    if (new URLSearchParams(location.search).get("badge") === "ok") {
      toast.success("Accesso automatico effettuato");
      navigate(location.pathname, { replace: true });
    }
  }, [location.search]);

  return (
    <Routes location={location}>

      {/* Login — redirect se già loggato */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={page(<ForgotPasswordPage/>)} />
      <Route path="/reset-password"  element={page(<ResetPasswordPage/>)} />

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
