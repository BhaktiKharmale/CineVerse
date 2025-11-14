// src/context/AuthProvider.tsx
import React, {
  ReactNode,
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import axiosClient, {
  getStoredAuthToken,
  setAuthToken,
  setUnauthorizedHandler,
} from "../api/axiosClient";
import { socketManager } from "../services/socketManager";
import toast from "react-hot-toast";

export type AuthStatus = "idle" | "authenticating" | "authenticated" | "unauthenticated";

export interface AuthUser {
  id?: number;
  name?: string;
  email: string;
  avatar?: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  status: AuthStatus;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: (options?: { silent?: boolean }) => Promise<void>;
  hydrate: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  clearError: () => void;
}

type AuthAction =
  | { type: "SET_STATUS"; status: AuthStatus; error?: string | null }
  | { type: "SET_AUTH"; payload: { user: AuthUser; token: string } }
  | { type: "SET_USER"; payload: AuthUser | null }
  | { type: "CLEAR_SESSION" }
  | { type: "CLEAR_ERROR" };

const USER_STORAGE_KEY = "cine_user_profile";
const LOGOUT_EVENT_KEY = "cine_logout_event";

const initialState: AuthState = {
  user: null,
  token: null,
  status: "idle",
  error: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "SET_STATUS":
      return { ...state, status: action.status, error: action.error ?? null };
    case "SET_AUTH":
      return {
        user: action.payload.user,
        token: action.payload.token,
        status: "authenticated",
        error: null,
      };
    case "SET_USER": {
      return { ...state, user: action.payload };
    }
    case "CLEAR_SESSION":
      return {
        user: null,
        token: null,
        status: "unauthenticated",
        error: null,
      };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    default:
      return state;
  }
}

const decodeTokenPayload = (token: string) => {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = decodeURIComponent(
      atob(normalized)
        .split("")
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(""),
    );
    return JSON.parse(decoded);
  } catch (error) {
    console.warn("[Auth] Failed to decode token payload", error);
    return null;
  }
};

const fetchUserProfile = async (email: string): Promise<AuthUser> => {
  try {
    const { data } = await axiosClient.get("/user/users");
    if (Array.isArray(data)) {
      const match = data.find((entry) => entry?.email === email);
      if (match) {
        return {
          id: match.id,
          name: match.name ?? match.username ?? email.split("@")[0],
          email: match.email,
        };
      }
    }
    return { email };
  } catch (error) {
    console.warn("[Auth] Failed to load profile from API", error);
    return { email };
  }
};

const persistUser = (user: AuthUser | null) => {
  if (user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_STORAGE_KEY);
  }
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface Props {
  children: ReactNode;
}

export const AuthProvider: React.FC<Props> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const clearSession = useCallback(() => {
    setAuthToken(null);
    persistUser(null);
    socketManager.disconnectAll();
    dispatch({ type: "CLEAR_SESSION" });
  }, []);

  const setUser = useCallback((user: AuthUser | null) => {
    persistUser(user);
    dispatch({ type: "SET_USER", payload: user });
  }, []);

  const resolveUserFromStorage = useCallback((): AuthUser | null => {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as AuthUser) : null;
    } catch (error) {
      console.warn("[Auth] Failed to parse stored user", error);
      return null;
    }
  }, []);

  const hydrate = useCallback(async () => {
    dispatch({ type: "SET_STATUS", status: "authenticating" });
    let resolved = false;
    const timeout = window.setTimeout(() => {
      if (!resolved) {
        console.warn("[Auth] Hydration timed out; continuing unauthenticated");
        dispatch({ type: "SET_STATUS", status: "unauthenticated" });
      }
    }, 5000);

    try {
      const token = getStoredAuthToken();

      if (!token) {
        clearSession();
        return;
      }

      setAuthToken(token);

      let user = resolveUserFromStorage();

      if (!user) {
        const payload = decodeTokenPayload(token);
        const email = payload?.sub;
        if (typeof email === "string" && email.length > 0) {
          user = await fetchUserProfile(email);
        }
      }

      if (user) {
        persistUser(user);
        dispatch({ type: "SET_AUTH", payload: { user, token } });
      } else {
        clearSession();
      }
    } catch (error) {
      console.error("[Auth] Hydration failed", error);
      clearSession();
    } finally {
      resolved = true;
      clearTimeout(timeout);
    }
  }, [clearSession, resolveUserFromStorage]);

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      dispatch({ type: "SET_STATUS", status: "authenticating" });
      dispatch({ type: "CLEAR_ERROR" });

      const formData = new URLSearchParams();
      formData.append("username", credentials.email);
      formData.append("password", credentials.password);

      try {
        const { data } = await axiosClient.post("/user/login", formData, {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        });

        const token: string | undefined = data?.access_token;
        if (!token) {
          throw new Error("Missing access token in response");
        }

        setAuthToken(token);

        const profile = await fetchUserProfile(credentials.email);
        persistUser(profile);

        dispatch({ type: "SET_AUTH", payload: { user: profile, token } });
      } catch (error: any) {
        console.error("[Auth] Login failed", error);
        clearSession();
        const message =
          error?.response?.data?.detail ||
          error?.message ||
          "Unable to login. Please try again.";
        dispatch({ type: "SET_STATUS", status: "unauthenticated", error: message });
        throw error;
      }
    },
    [clearSession],
  );

  const logout = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        dispatch({ type: "SET_STATUS", status: "authenticating" });
      }

      let backendSuccess = false;

      try {
        const response = await axiosClient.post("/user/logout");
        backendSuccess = true;
        console.log("[Auth] Logout successful on server", response.data);
      } catch (error: any) {
        // Log error but continue with local logout
        console.warn("[Auth] Logout request failed (continuing with local logout)", error);
        
        if (!options?.silent) {
          const isNetworkError = !error.response;
          if (isNetworkError) {
            toast.error("Logged out locally (server unreachable)", {
              duration: 3000,
              position: "top-center",
            });
          }
        }
      } finally {
        // Always clear local session regardless of backend response
        clearSession();
        
        // Broadcast logout to other tabs
        if (!options?.silent) {
          try {
            localStorage.setItem(LOGOUT_EVENT_KEY, Date.now().toString());
            localStorage.removeItem(LOGOUT_EVENT_KEY); // Triggers event
          } catch (err) {
            console.debug("[Auth] Failed to broadcast logout to other tabs", err);
          }
        }
        
        if (!options?.silent) {
          dispatch({ type: "SET_STATUS", status: "unauthenticated" });
          
          // Show success toast
          if (backendSuccess) {
            toast.success("You've been logged out", {
              duration: 2000,
              position: "top-center",
            });
          }
          
          // Redirect to home
          window.location.replace("/");
        }
      }
    },
    [clearSession],
  );

  const clearError = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" });
  }, []);

  // Multi-tab logout synchronization
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      // Detect logout event from another tab
      if (event.key === LOGOUT_EVENT_KEY && event.oldValue && !event.newValue) {
        console.log("[Auth] Logout detected from another tab");
        // Silently logout this tab
        logout({ silent: true });
      }
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [logout]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    let redirecting = false;
    const handleUnauthorized = () => {
      if (redirecting) return;
      redirecting = true;
      clearSession();
      dispatch({ type: "SET_STATUS", status: "unauthenticated" });
      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    };

    setUnauthorizedHandler(handleUnauthorized);
    return () => {
      redirecting = false;
      setUnauthorizedHandler(null);
    };
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      hydrate,
      setUser,
      clearError,
    }),
    [state, login, logout, hydrate, setUser, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
