import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api" });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem("wh_token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem("wh_token");
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);

export const login       = (u, p)    => api.post("/auth/login", { username:u, password:p }).then(r => r.data);
export const getMe       = ()        => api.get("/auth/me").then(r => r.data.user);
export const getMovements= (params)  => api.get("/movements", { params }).then(r => r.data);
export const addMovement = (data)    => api.post("/movements", data).then(r => r.data.movement);
export const todayStats  = ()        => api.get("/movements/stats/today").then(r => r.data);
export const getInventory= ()        => api.get("/inventory").then(r => r.data);
export const getItem     = (code)    => api.get(`/inventory/${code}`).then(r => r.data);
export const getCategories= ()       => api.get("/categories").then(r => r.data.categories);
export const addCategory = (name)    => api.post("/categories", { name }).then(r => r.data.category);

export const saveToken  = t  => localStorage.setItem("wh_token", t);
export const clearToken = () => localStorage.removeItem("wh_token");
export const hasToken   = () => !!localStorage.getItem("wh_token");

export default api;
