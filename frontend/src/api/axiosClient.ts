// src/api/axiosClient.ts
import axios, { AxiosInstance } from "axios";

type UnauthorizedHandler = () => void;

const USER_TOKEN_KEY = "cine_user_token";
const LEGACY_USER_TOKEN_KEY = "token";
const ADMIN_TOKEN_KEY = "cine_admin_token";

let authToken: string | null = null;
let onUnauthorized: UnauthorizedHandler | null = null;
let unauthorizedTriggered = false;

// ✅ Use environment variable or fallback to development default
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001";
const normalizedBase = API_BASE.replace(/\/$/, "");

const axiosClient: AxiosInstance = axios.create({
  baseURL: `${normalizedBase}/api`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
  timeout: 10000, // 10 second timeout
});

const resolveToken = () => {
  if (authToken) return authToken;
  return (
    localStorage.getItem(USER_TOKEN_KEY) ||
    localStorage.getItem(LEGACY_USER_TOKEN_KEY) ||
    null
  );
};

axiosClient.interceptors.request.use((config) => {
  // Normalise caller-provided path to avoid accidental double "/api" e.g. "/api/payments/..."
  // We only touch config.url (path), not full baseURL. This keeps compatibility with absolute URLs.
  if (config && typeof config.url === "string") {
    // Remove leading "/api" or "/api/" if present because our baseURL already ends with /api
    config.url = config.url.replace(/^\/api(\/|$)/, "/");
  }

  const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY);
  const userToken = resolveToken();

  const url = config.url ?? "";
  const isAdminRequest = url.startsWith("/admin");

  const tokenToUse = isAdminRequest ? adminToken || userToken : userToken || adminToken;

  if (tokenToUse) {
    if (!config.headers) config.headers = {} as any;
    (config.headers as any).Authorization = `Bearer ${tokenToUse}`;
  }

  // 🔍 Debug: outgoing requests (limited to showtimes to reduce noise)
  try {
    if (url.includes("showtimes")) {
      console.group("🌐 [AXIOS REQUEST]");
      console.log("Full URL:", `${config.baseURL}${url}`);
      console.log("Method:", (config.method || "").toString().toUpperCase());
      console.log("Params:", config.params);
      console.log("Headers:", {
        "Content-Type": (config.headers as any)?.["Content-Type"],
        Authorization: tokenToUse ? "Bearer ***" : "none",
      });
      console.groupEnd();
    }
  } catch {
    // don't throw from logging
  }

  return config;
});

axiosClient.interceptors.response.use(
  (response) => {
    // 🔍 Debug: successful responses (limited to showtimes)
    try {
      if (response.config.url?.includes("showtimes")) {
        console.group("✅ [AXIOS RESPONSE]");
        console.log("Status:", response.status);
        console.log("CORS Headers:", {
          "Access-Control-Allow-Origin": response.headers["access-control-allow-origin"],
          "Access-Control-Allow-Credentials": response.headers["access-control-allow-credentials"],
        });
        console.log("Response Data:", response.data);
        console.groupEnd();
      }
    } catch {
      // ignore logging failures
    }
    return response;
  },
  (error) => {
    const status = error?.response?.status;
    const requestUrl: string = error?.config?.url ?? "";
    const isAdminRequest = requestUrl.startsWith("/admin");

    // 🔍 Debug: errors (limited to showtimes)
    try {
      if (requestUrl.includes("showtimes")) {
        console.group("❌ [AXIOS ERROR]");
        console.log("Status:", status);
        console.log("URL:", error?.config?.url);
        console.log("Full URL:", `${error?.config?.baseURL}${error?.config?.url}`);
        console.log("Params:", error?.config?.params);
        console.log("Response:", error?.response?.data);
        console.log("Message:", error?.message);
        console.groupEnd();
      }
    } catch {
      // ignore logging failures
    }

    if ((status === 401 || (isAdminRequest && status === 403)) && !unauthorizedTriggered) {
      unauthorizedTriggered = true;
      window.dispatchEvent(new Event("cineverse:admin-unauthorized"));
      if (onUnauthorized) {
        onUnauthorized();
      }
      // reset in next task queue to avoid swallowing subsequent legitimate events
      setTimeout(() => {
        unauthorizedTriggered = false;
      }, 0);
    }
    return Promise.reject(error);
  }
);

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    localStorage.setItem(USER_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(USER_TOKEN_KEY);
  }
};

export const getStoredAuthToken = () => resolveToken();

export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null) => {
  onUnauthorized = handler;
};

export default axiosClient;

/**
 * ✅ Hard-clear all auth tokens (user + legacy + admin).
 * Use this during logout to guarantee client-side sign-out even if the API call fails.
 */
export const clearAllAuthTokens = () => {
  authToken = null;
  try {
    localStorage.removeItem(USER_TOKEN_KEY);
    localStorage.removeItem(LEGACY_USER_TOKEN_KEY); // legacy
    localStorage.removeItem(ADMIN_TOKEN_KEY);       // admin
  } catch {
    // ignore storage errors
  }
};
