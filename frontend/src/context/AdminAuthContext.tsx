import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

const TOKEN_STORAGE_KEY = "cine_admin_token";
const EMAIL_STORAGE_KEY = "cine_admin_email";

interface AdminAuthContextValue {
  token: string | null;
  adminEmail: string | null;
  isAuthenticated: boolean;
  login: (token: string, email?: string | null) => void;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    const storedEmail = localStorage.getItem(EMAIL_STORAGE_KEY);
    if (storedToken) {
      setToken(storedToken);
    }
    if (storedEmail) {
      setAdminEmail(storedEmail);
    }
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      toast.error("Admin session expired. Please log in again.");
      logout();
    };

    window.addEventListener("cineverse:admin-unauthorized", handleUnauthorized);
    return () => window.removeEventListener("cineverse:admin-unauthorized", handleUnauthorized);
  }, []);

  const login = useCallback((nextToken: string, email?: string | null) => {
    setToken(nextToken);
    if (email) {
      setAdminEmail(email);
      localStorage.setItem(EMAIL_STORAGE_KEY, email);
    } else {
      setAdminEmail(null);
      localStorage.removeItem(EMAIL_STORAGE_KEY);
    }
    localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setAdminEmail(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(EMAIL_STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({
      token,
      adminEmail,
      isAuthenticated: Boolean(token),
      login,
      logout,
    }),
    [adminEmail, login, logout, token],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
};

export const useAdminAuth = (): AdminAuthContextValue => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }
  return context;
};
