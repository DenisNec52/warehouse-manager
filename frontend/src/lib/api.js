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

// Pagine raggiungibili da non loggati (anche dal link nell'email di recupero password):
// il 401 di /auth/me al caricamento non deve rimandarle al login.
const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/badge"];

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !PUBLIC_PATHS.some(p => window.location.pathname.startsWith(p))) {
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────
export const authAPI = {
  login:    (d)    => api.post("/auth/login",    d),
  badgeLogin: (d)  => api.post("/auth/badge-login", d),   // { userId, secret, src } dal QR/NFC
  logout:   ()     => api.post("/auth/logout"),
  me:       ()     => api.get("/auth/me"),
  theme:    (d)    => api.put("/auth/theme",     d),
  password: (d)    => api.put("/auth/password",  d),
  // Badge QR/NFC — proprio account
  regenerateBadge: ()        => api.post("/auth/badge/regenerate"),
  badgeStatus:     (enabled) => api.put("/auth/badge/status", { enabled }),
  revokeBadge:     ()        => api.delete("/auth/badge"),
  // Email e recupero password
  updateEmail:    (email)                    => api.put("/auth/email", { email }),
  forgotPassword: (username)                 => api.post("/auth/forgot-password", { username }),
  resetPassword:  (userId, token, newPassword) => api.post("/auth/reset-password", { userId, token, newPassword }),
};

// ── Products ──────────────────────────────────────────────────
export const productsAPI = {
  list:     (p)    => api.get("/products",       { params: p }),
  get:      (id)   => api.get(`/products/${id}`),
  lowStock: ()     => api.get("/products/low-stock"),
  create:   (d)    => api.post("/products",      d),
  update:   (id,d) => api.put(`/products/${id}`, d),
  delete:   (id)   => api.delete(`/products/${id}`),
  uploadCover: (id, file) => {
    const form = new FormData();
    form.append("image", file);
    return api.post(`/products/${id}/cover`, form, { headers: { "Content-Type": "multipart/form-data" } });
  },
  removeCover: (id) => api.delete(`/products/${id}/cover`),
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
  update:     (id,d) => api.put(`/movements/${id}`, d),      // solo admin: corregge e riallinea la giacenza
  remove:     (id) => api.delete(`/movements/${id}`),        // solo admin: annulla e storna la giacenza
};

// ── Users ─────────────────────────────────────────────────────
export const usersAPI = {
  list:          ()     => api.get("/users"),
  create:        (d)    => api.post("/users",              d),
  update:        (id,d) => api.put(`/users/${id}`,         d),
  delete:        (id)   => api.delete(`/users/${id}`),
  setActive:     (id,isActive) => api.put(`/users/${id}/status`, { isActive }),
  resetPassword: (id,d) => api.put(`/users/${id}/password`, d),
  // Badge QR/NFC — account di un altro utente (admin/supervisore)
  regenerateBadge: (id)         => api.post(`/users/${id}/badge/regenerate`),
  badgeStatus:     (id,enabled) => api.put(`/users/${id}/badge/status`, { enabled }),
  revokeBadge:     (id)         => api.delete(`/users/${id}/badge`),
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

// ── Vision IA ─────────────────────────────────────────────────
export const visionAPI = {
  scan: (image, mediaType) => api.post("/vision/scan", { image, mediaType }),
};

export const checklistAPI = {
  get:           ()      => api.get("/checklist"),
  update:        (d)     => api.put("/checklist", d),
  submit:        (d)     => api.post("/checklist/submit", d),
  myToday:       ()      => api.get("/checklist/my-today"),
  today:         ()      => api.get("/checklist/submissions/today"),
  submissions:   (p)     => api.get("/checklist/submissions", { params: p }),
  monthlyReport: (month) => api.get("/checklist/monthly-report", { params: { month } }),
  updateSubmission: (id,d) => api.put(`/checklist/submissions/${id}`, d),   // solo admin
  deleteSubmission: (id)   => api.delete(`/checklist/submissions/${id}`),  // solo admin
};

export const productionAPI = {
  standardTimes:      (p)    => api.get("/production/standard-times", { params: p }),
  createStandardTime: (d)    => api.post("/production/standard-times", d),
  updateStandardTime: (id,d) => api.put(`/production/standard-times/${id}`, d),
  deleteStandardTime: (id)   => api.delete(`/production/standard-times/${id}`),
  entries:            (p)    => api.get("/production/entries", { params: p }),
  createEntry:        (d)    => api.post("/production/entries", d),
  updateEntry:        (id,d) => api.put(`/production/entries/${id}`, d),
  deleteEntry:        (id)   => api.delete(`/production/entries/${id}`),
  stats:              (p)    => api.get("/production/stats", { params: p }),
};
export const departmentsAPI = {
  list:   ()     => api.get("/departments"),
  create: (d)    => api.post("/departments", d),
  update: (id,d) => api.put(`/departments/${id}`, d),   // disattivazione: { isActive: false }
};
export default api;
