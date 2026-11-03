import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as authApi from "../../services/auth";
import { onSessionExpired } from "../../services/session";
import type { Role, User } from "../../types";

interface AuthApi {
  user: User | null;
  ready: boolean;
  /** True after the server rejected an expired or revoked token. Cleared on the next sign-in. */
  sessionExpired: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (name: string, email: string, password: string, role?: Role) => Promise<User>;
  signInWithGoogle: (credential: string, role?: Role) => Promise<User>;
  signOut: () => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(
    () =>
      onSessionExpired(() => {
        setUser(null);
        setSessionExpired(true);
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const token = authApi.getStoredToken();

      if (!token) {
        setReady(true);
        return;
      }

      try {
        const restoredUser = await authApi.currentUser(token);
        if (!cancelled) setUser(restoredUser);
      } catch {
        authApi.clearStoredToken();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const authenticatedUser = await authApi.login(email.trim(), password);
    setSessionExpired(false);
    setUser(authenticatedUser);
    return authenticatedUser;
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string, role: Role = "worker") => {
    const authenticatedUser = await authApi.register({
      full_name: name.trim(),
      email: email.trim(),
      password,
      role,
    });
    setSessionExpired(false);
    setUser(authenticatedUser);
    return authenticatedUser;
  }, []);

  const signInWithGoogle = useCallback(async (credential: string, role?: Role) => {
    const authenticatedUser = await authApi.googleLogin(credential, role);
    setSessionExpired(false);
    setUser(authenticatedUser);
    return authenticatedUser;
  }, []);

  const signOut = useCallback(() => {
    authApi.clearStoredToken();
    setSessionExpired(false);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, sessionExpired, signIn, signUp, signInWithGoogle, signOut }),
    [user, ready, sessionExpired, signIn, signUp, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export const HOME_BY_ROLE: Record<Role, string> = {
  manager: "/manager",
  worker: "/worker",
};
