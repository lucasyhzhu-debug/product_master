import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { type AuthSession, type UserRole, ROLE_PERMISSIONS } from "../lib/types";
import type { Id } from "../../convex/_generated/dataModel";
import type { SessionId } from "convex-helpers/server/sessions";
import { sessionSetterRef } from "../lib/sessionBridge";
import { setLastUserId } from "../lib/lastUser";

const AUTH_STORAGE_KEY = "malo_auth_session";

/**
 * SessionProvider storage key -- must match the storageKey prop
 * passed to SessionProvider in main.tsx. When login writes the auth
 * token here, useSessionMutation will automatically
 * inject it as sessionId in Convex function args.
 */
const SESSION_ID_KEY = "malo_session_id";

interface AuthContextValue {
  user: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (userId: Id<"users">, pin: string) => Promise<{ success: boolean; error?: string; remainingAttempts?: number; lockedUntil?: number }>;
  logout: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
  hasPermission: (permission: keyof typeof ROLE_PERMISSIONS.admin) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loginMutation = useMutation(api.auth.mutations.login);
  const logoutMutation = useMutation(api.auth.mutations.logout);

  // Validate session on mount
  const storedToken = session?.token;
  const validationResult = useQuery(
    api.auth.queries.validateSession,
    storedToken ? { token: storedToken } : "skip"
  );

  // Load session from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as AuthSession;
        // Check if session hasn't expired
        if (parsed.expiresAt > Date.now()) {
          setSession(parsed);
          localStorage.setItem(SESSION_ID_KEY, parsed.token);
          // Sync SessionProvider state in case it initialized before the auth token
          // was available (e.g., after a same-tab logout/login cycle).
          sessionSetterRef.current(parsed.token as SessionId);
        } else {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          localStorage.removeItem(SESSION_ID_KEY);
          sessionSetterRef.current(undefined);
        }
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(SESSION_ID_KEY);
        sessionSetterRef.current(undefined);
      }
    }
    setIsLoading(false);
  }, []);

  // Handle server-side session validation
  useEffect(() => {
    if (validationResult === undefined) return; // Still loading

    if (validationResult && !validationResult.valid && session) {
      // Session is invalid on server, clear local state
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(SESSION_ID_KEY);
      sessionSetterRef.current(undefined);
      setSession(null);
    }
  }, [validationResult, session]);

  const login = useCallback(async (userId: Id<"users">, pin: string) => {
    try {
      const result = await loginMutation({ userId, pin });

      if (result.success && result.session) {
        const authSession: AuthSession = {
          token: result.session.token,
          userId: result.session.userId,
          name: result.session.name,
          role: result.session.role as UserRole,
          avatarUrl: result.session.avatarUrl,
          expiresAt: result.session.expiresAt,
        };

        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authSession));
        localStorage.setItem(SESSION_ID_KEY, authSession.token);
        // Sync SessionProvider's React state so useSessionMutation sends
        // the correct auth token (not the random UUID it generated before login).
        sessionSetterRef.current(authSession.token as SessionId);
        setSession(authSession);

        // Survives logout: pre-selects this user on the next visit to /login.
        setLastUserId(authSession.userId);

        return { success: true };
      }

      return {
        success: false,
        error: result.error,
        remainingAttempts: result.remainingAttempts,
        lockedUntil: result.lockedUntil,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Login failed",
      };
    }
  }, [loginMutation]);

  const logout = useCallback(async () => {
    if (session?.token) {
      try {
        await logoutMutation({ token: session.token });
      } catch {
        // Ignore errors during logout
      }
    }
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(SESSION_ID_KEY);
    // NOTE: malo_last_user_id is intentionally NOT cleared -- surviving logout
    // is the feature (see src/lib/lastUser.ts). Don't fold this into a
    // clear-all-malo_* cleanup.
    // Clear SessionProvider's React state so useSessionMutation stops sending
    // the old auth token after logout.
    sessionSetterRef.current(undefined);
    setSession(null);
  }, [session, logoutMutation]);

  const hasRole = useCallback((...roles: UserRole[]) => {
    if (!session) return false;
    return roles.includes(session.role);
  }, [session]);

  const hasPermission = useCallback((permission: keyof typeof ROLE_PERMISSIONS.admin) => {
    if (!session) return false;
    return ROLE_PERMISSIONS[session.role][permission];
  }, [session]);

  const value: AuthContextValue = {
    user: session,
    isAuthenticated: !!session,
    isLoading,
    login,
    logout,
    hasRole,
    hasPermission,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export { AuthContext };
