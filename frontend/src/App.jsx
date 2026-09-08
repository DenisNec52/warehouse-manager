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

// Pages
import LoginPage          from "@/pages/LoginPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage  from "@/pages/ResetPasswordPage";
import DashboardPage   from "@/pages/DashboardPage";
import ProductsPage    from "@/pages/ProductsPage";
import ProductDetail   from "@/pages/ProductDetailPage";
import MovementsPage   from "@/pages/MovementsPage";
import CategoriesPage  from "@/pages/CategoriesPage";
import UsersPage       from "@/pages/UsersPage";
import NotificationsPage from "@/pages/NotificationsPage";
import SettingsPage    from "@/pages/SettingsPage";
import NotFoundPage    from "@/pages/NotFoundPage";
import HomePage           from "@/pages/HomePage";
import ChecklistPage      from "@/pages/ChecklistPage";
// Caricata on-demand: usa recharts (libreria pesante) e serve solo ad admin/supervisore
const ChecklistAdminPage = lazy(() => import("@/pages/ChecklistAdminPage"));

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
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password"  element={<ResetPasswordPage />} />

      {/* App protetta */}
      <Route path="/" element={
        <RequireAuth>
          <AppLayout />
        </RequireAuth>
      }>
      <Route index element={<HomePage/>}/>
      <Route path="warehouse"        element={<DashboardPage/>}/>
      <Route path="products"         element={<ProductsPage/>}/>
      <Route path="products/:id"     element={<ProductDetail/>}/>
      <Route path="movements"        element={<MovementsPage/>}/>
      <Route path="categories" element={
        <RequireAdmin><CategoriesPage/></RequireAdmin>
      }/>
      <Route path="notifications"    element={<NotificationsPage/>}/>
      <Route path="settings"         element={<SettingsPage/>}/>
      <Route path="checklist"        element={<ChecklistPage/>}/>
      <Route path="users" element={
        <RequireSupervisor><UsersPage/></RequireSupervisor>
      }/>
      <Route path="admin/checklist" element={
        <RequireSupervisor>
          <Suspense fallback={<RouteLoader/>}><ChecklistAdminPage/></Suspense>
        </RequireSupervisor>
      }/>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
