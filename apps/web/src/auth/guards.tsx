import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import type { MeDto } from "@chromebook/shared";
import { useAuth } from "./AuthProvider";
import { useMe } from "../api/hooks";
import { ApiError, errorMessage } from "../api/client";
import { StatusMessage } from "../components/StatusMessage";

const CurrentUserContext = createContext<MeDto | undefined>(undefined);

export function useCurrentUser(): MeDto {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error("useCurrentUser deve ser usado dentro de RequireAuth");
  return user;
}

function FullPage({ children }: { children: ReactNode }) {
  return <div className="full-page">{children}</div>;
}

export function RequireAuth() {
  const { session, loading, signOut } = useAuth();
  const location = useLocation();
  const me = useMe(Boolean(session));
  const sessionRejected = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (sessionRejected) void signOut();
  }, [sessionRejected, signOut]);

  if (loading || (session && (me.isPending || sessionRejected))) {
    return (
      <FullPage>
        <StatusMessage kind="loading">Carregando…</StatusMessage>
      </FullPage>
    );
  }

  if (!session) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  if (me.error) {
    return (
      <FullPage>
        <StatusMessage kind="error">{errorMessage(me.error)}</StatusMessage>
        <button type="button" className="button secondary" onClick={() => void signOut()}>
          Sair
        </button>
      </FullPage>
    );
  }

  return (
    <CurrentUserContext.Provider value={me.data}>
      <Outlet />
    </CurrentUserContext.Provider>
  );
}

export function RequireAdmin() {
  const user = useCurrentUser();
  const { signOut } = useAuth();
  if (user.role !== "ADMIN") {
    return (
      <FullPage>
        <StatusMessage kind="error">Esta área é exclusiva do TI.</StatusMessage>
        <button type="button" className="button secondary" onClick={() => void signOut()}>
          Sair
        </button>
      </FullPage>
    );
  }
  return <Outlet />;
}
