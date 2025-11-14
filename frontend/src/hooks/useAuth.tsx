// src/hooks/useAuth.tsx
// Thin wrapper: re-uses the single AuthProvider implemented in src/context/AuthProvider.tsx
// and exposes a safe useAuth() hook for the whole app.

import { useContext } from "react";
import {
  AuthContext,
  AuthProvider as RealAuthProvider,
  type AuthUser,
  type LoginCredentials,
  type AuthStatus,
} from "../context/AuthProvider";

export type { AuthUser, LoginCredentials, AuthStatus };

// useAuth() reads the AuthContext created by the real provider.
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return ctx;
};

// Re-export the real provider so imports like
// `import { AuthProvider } from 'src/hooks/useAuth'` still work.
export const AuthProvider = RealAuthProvider;

export default useAuth;
