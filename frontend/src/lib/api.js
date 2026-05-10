/**
 * lib/api.js
 *
 * Istanza Axios centralizzata con:
 * - baseURL dal .env
 * - cookie httpOnly (withCredentials)
 * - interceptor 401 → redirect login
 */
import axios from "axios";

const api = axios.create({
  baseURL:         import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true,
  timeout:         15_000,
  headers:         { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────
export const authAPI = {
  login:    (d)    => api.post("/auth/login",    d),
  logout:   ()     => api.post("/auth/logout"),
  me:       ()     => api.get("/auth/me"),
  theme:    (d)    => api.put("/auth/theme",     d),
  password: (d)    => api.put("/auth/password",  d),
};

// ── Products ──────────────────────────────────────────────────
export const productsAPI = {
  list:     (p)    => api.get("/products",       { params: p }),
  get:      (id)   => api.get(`/products/${id}`),
  lowStock: ()     => api.get("/products/low-stock"),
  create:   (d)    => api.post("/products",      d),
  update:   (id,d) => api.put(`/products/${id}`, d),
  delete:   (id)   => api.delete(`/products/${id}`),
};

// ── Categories ────────────────────────────────────────────────
export const categoriesAPI = {
  list:   ()     => api.get("/categories"),
  create: (d)    => api.post("/categories",    d),
  update: (id,d) => api.put(`/categories/${id}`, d),
  delete: (id)   => api.delete(`/categories/${id}`),
};

// ── Movements ─────────────────────────────────────────────────
export const movementsAPI = {
  list:       (p)  => api.get("/movements",                     { params: p }),
  get:        (id) => api.get(`/movements/${id}`),
  byProduct:  (id) => api.get(`/movements/product/${id}`),
  create:     (d)  => api.post("/movements", d),
};

// ── Users ─────────────────────────────────────────────────────
export const usersAPI = {
  list:          ()     => api.get("/users"),
  create:        (d)    => api.post("/users",              d),
  update:        (id,d) => api.put(`/users/${id}`,         d),
  delete:        (id)   => api.delete(`/users/${id}`),
  resetPassword: (id,d) => api.put(`/users/${id}/password`, d),
};

// ── Notifications ─────────────────────────────────────────────
export const notificationsAPI = {
  list:    (p)  => api.get("/notifications",           { params: p }),
  read:    (id) => api.patch(`/notifications/${id}/read`),
  readAll: ()   => api.patch("/notifications/read-all"),
  delete:  (id) => api.delete(`/notifications/${id}`),
};

// ── Dashboard ─────────────────────────────────────────────────
export const dashboardAPI = {
  stats:  ()  => api.get("/dashboard/stats"),
  charts: (p) => api.get("/dashboard/charts", { params: p }),
};

export default api;
