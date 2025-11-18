// src/libs/apiClient.ts
// Vite-friendly axios client. Uses import.meta.env.VITE_API_BASE.
// Provides helpers to set/clear token for the client and localStorage.
// Adds a 401/403 handler hook and correct TypeScript typings.

import axios, {
    AxiosInstance,
    AxiosError,
    AxiosResponse,
    InternalAxiosRequestConfig,
  } from "axios";
  
  // Normalize base so callers can pass either host or host + /api
  const DEFAULT_HOST = "http://127.0.0.1:8001";
  const rawBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  const hostBase = (typeof rawBase === "string" && rawBase.length > 0 ? rawBase : DEFAULT_HOST).replace(/\/$/, "");
  export const BASE_URL = hostBase.endsWith("/api") ? hostBase : `${hostBase}/api`;
  
  const TOKEN_KEY = "token";
  
  const api: AxiosInstance = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  
  // unauthorized handler holder
  let unauthorizedHandler: (() => void) | null = null;
  
  /**
   * Register a global handler that will be called when a 401/403 response is seen.
   * Example: auth provider can call setUnauthorizedHandler(() => logout())
   */
  export function setUnauthorizedHandler(cb: (() => void) | null) {
    unauthorizedHandler = cb;
  }
  
  // response interceptor: forward errors, call handler on 401/403
  api.interceptors.response.use(
    (res: AxiosResponse) => res,
    (err: AxiosError) => {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        try {
          if (unauthorizedHandler) unauthorizedHandler();
        } catch (e) {
          // swallow
          // eslint-disable-next-line no-console
          console.warn("[apiClient] unauthorizedHandler error:", e);
        }
      }
      return Promise.reject(err);
    },
  );
  
  // request interceptor: attach token from localStorage (defensive)
  // Use InternalAxiosRequestConfig for correct typing
  api.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
    try {
      const t = getStoredAuthToken();
      if (t) {
        cfg.headers = cfg.headers ?? {};
        // @ts-ignore - axios header typings vary across versions; use runtime assignment
        cfg.headers.Authorization = `Bearer ${t}`;
      }
    } catch (e) {
      // ignore
    }
    return cfg;
  });
  
  /** Persist token into localStorage + axios defaults (or clear when null) */
  export function setAuthToken(token: string | null) {
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
        api.defaults.headers.common.Authorization = `Bearer ${token}`;
      } else {
        localStorage.removeItem(TOKEN_KEY);
        delete api.defaults.headers.common.Authorization;
      }
    } catch (err) {
      // ignore localStorage issues
      // eslint-disable-next-line no-console
      console.warn("[apiClient] setAuthToken error:", err);
    }
  }
  
  /** Read token from storage */
  export function getStoredAuthToken(): string | null {
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      return t ?? null;
    } catch (e) {
      return null;
    }
  }
  
  /** Clear token from axios and localStorage */
  export function clearAllAuthTokens() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      delete api.defaults.headers.common.Authorization;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[apiClient] clearAllAuthTokens error:", err);
    }
  }
  
  // Initialize client on load with any existing token
  try {
    const existing = getStoredAuthToken();
    if (existing) {
      api.defaults.headers.common.Authorization = `Bearer ${existing}`;
    }
  } catch (err) {
    // ignore
  }
  
  export default api;
  