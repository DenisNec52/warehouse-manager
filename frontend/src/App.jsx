/**
 * App.jsx
 *
 * Router principale con:
 * - Verifica sessione al mount
 * - Page transitions Framer Motion
 * - Route protette (RequireAuth)
 */
import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
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

// Layout
import AppLayout from "@/components/layout/AppLayout";

// ── Page transition variants ──────────────────────────────────
const pageVariants = {
  initial: { opacity: 0, y: 8 },
  enter:   { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

function PageWrapper({ children }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="enter"
      exit="exit"
    >
      {children}
    </motion.div>
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
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>

        {/* Login — redirect se già loggato */}
        <Route path="/login" element={<LoginPage />} />

        {/* App protetta */}
        <Route path="/" element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }>
          <Route index element={<PageWrapper><DashboardPage /></PageWrapper>} />
          <Route path="products"         element={<PageWrapper><ProductsPage /></PageWrapper>} />
          <Route path="products/:id"     element={<PageWrapper><ProductDetail /></PageWrapper>} />
          <Route path="movements"        element={<PageWrapper><MovementsPage /></PageWrapper>} />
          <Route path="categories"       element={<PageWrapper><CategoriesPage /></PageWrapper>} />
          <Route path="notifications"    element={<PageWrapper><NotificationsPage /></PageWrapper>} />
          <Route path="settings"         element={<PageWrapper><SettingsPage /></PageWrapper>} />
          {/* Solo admin */}
          <Route path="users" element={
            <RequireAdmin>
              <PageWrapper><UsersPage /></PageWrapper>
            </RequireAdmin>
          }/>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AnimatePresence>
  );
}
