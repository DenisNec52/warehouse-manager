/**
 * App.jsx
 *
 * Router principale con:
 * - Verifica sessione al mount
 * - Page transitions Framer Motion
 * - Route protette (RequireAuth)
 */
import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuthStore, useThemeStore } from "@/lib/store";
import { authAPI } from "@/lib/api";

// Pages
import LoginPage       from "@/pages/LoginPage";
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
// Caricata on-demand: usa recharts (libreria pesante) e serve solo agli admin
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

export default function App() {
  const { setUser, setLoading, setUnread } = useAuthStore();
  const { loadFromProfile, applyTheme }    = useThemeStore();
  const location = useLocation();

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

  return (
    <Routes location={location}>

      {/* Login — redirect se già loggato */}
      <Route path="/login" element={<LoginPage />} />

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
      <Route path="categories"       element={<CategoriesPage/>}/>
      <Route path="notifications"    element={<NotificationsPage/>}/>
      <Route path="settings"         element={<SettingsPage/>}/>
      <Route path="checklist"        element={<ChecklistPage/>}/>
      <Route path="users" element={
        <RequireAdmin><UsersPage/></RequireAdmin>
      }/>
      <Route path="admin/checklist" element={
        <RequireAdmin>
          <Suspense fallback={<RouteLoader/>}><ChecklistAdminPage/></Suspense>
        </RequireAdmin>
      }/>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
