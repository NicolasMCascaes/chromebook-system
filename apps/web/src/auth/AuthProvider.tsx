import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sessionSource } from "./session-source";

interface AuthSession {
  accessToken: string;
}

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toSession(accessToken: string | null): AuthSession | null {
  return accessToken ? { accessToken } : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    sessionSource.getAccessToken().then((accessToken) => {
      if (!active) return;
      setSession(toSession(accessToken));
      setLoading(false);
    });
    const unsubscribe = sessionSource.onChange((accessToken) => {
      setSession(toSession(accessToken));
      setLoading(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      signOut: async () => {
        await sessionSource.signOut();
        queryClient.clear();
      },
    }),
    [session, loading, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return context;
}
