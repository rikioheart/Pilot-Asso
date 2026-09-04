import axios from "axios";
import { toast } from "sonner";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, withCredentials: true });

/* --- Mode offline partiel : cache lecture seule + file d'attente des scans --- */
const CACHE_PREFIX = "vdc_cache:";
const CACHEABLE = ["/dogs", "/professionals", "/activities", "/events", "/dashboard", "/loyalty", "/auth/me",
  "/profiles/me", "/settings", "/notifications", "/calendar", "/terrains", "/me/"];
const OFFLINE_QUEUE_KEY = "vdc_offline_stamps";

export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
const cacheKey = (config) => `${CACHE_PREFIX}${config.url}${config.params ? "?" + JSON.stringify(config.params) : ""}`;
const cacheable = (config) => (config.method || "get").toLowerCase() === "get"
  && CACHEABLE.some((p) => (config.url || "").startsWith(p));

export const readCache = (config) => {
  try { return JSON.parse(localStorage.getItem(cacheKey(config)) || "null"); } catch { return null; }
};
export const lastSyncAt = () => localStorage.getItem("vdc_cache_at");

export const queueOfflineStamp = (entry) => {
  const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  q.push({ ...entry, scanned_at: new Date().toISOString() });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
  return q.length;
};
export const pendingOfflineStamps = () => JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");

export async function syncOfflineStamps() {
  const q = pendingOfflineStamps();
  if (q.length === 0) return { ok: 0, failed: 0 };
  const failed = [];
  let ok = 0;
  for (const entry of q) {
    try { await api.post("/loyalty/stamp", { ...entry, offline: true }); ok += 1; }
    catch (e) { if (!e.response) failed.push(entry); else ok += 0; }
  }
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(failed));
  return { ok, failed: failed.length, rejected: q.length - ok - failed.length };
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("vdc_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (isOffline()) {
    if (cacheable(config)) {
      const cached = readCache(config);
      if (cached) {
        config.adapter = () => Promise.resolve({ data: cached.data, status: 200, statusText: "OK (cache)",
          headers: { "x-from-cache": "1" }, config });
      }
    } else if ((config.method || "get").toLowerCase() !== "get") {
      const err = new Error("Mode hors connexion : cette action sera de nouveau disponible à la reconnexion.");
      err.offline = true;
      return Promise.reject(err);
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (cacheable(response.config) && !response.headers?.["x-from-cache"]) {
      try {
        localStorage.setItem(cacheKey(response.config), JSON.stringify({ data: response.data, at: Date.now() }));
        localStorage.setItem("vdc_cache_at", new Date().toISOString());
      } catch { /* quota atteint : on ignore */ }
    }
    return response;
  },
  (error) => {
    if (!error.response && error.config && cacheable(error.config)) {
      const cached = readCache(error.config);
      if (cached) {
        return Promise.resolve({ data: cached.data, status: 200, statusText: "OK (cache)",
          headers: { "x-from-cache": "1" }, config: error.config });
      }
    }
    if (error.offline) toast.error(error.message, { id: "offline-action" });
    return Promise.reject(error);
  },
);

export const fileUrl = (fileId, download = false) =>
  fileId
    ? `${API}/files/${fileId}/download?auth=${localStorage.getItem("vdc_token") || ""}${download ? "&download=true" : ""}`
    : null;

export async function uploadFile(file, usage = "OTHER") {
  const body = new FormData();
  body.append("file", file);
  const { data } = await api.post(`/files/upload?usage=${usage}`, body,
    { headers: { "Content-Type": "multipart/form-data" } });
  return data;
}

export function apiError(e) {
  const detail = e?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d?.msg || JSON.stringify(d)).join(" ");
  if (detail?.msg) return detail.msg;
  return e?.message || "Une erreur est survenue.";
}
