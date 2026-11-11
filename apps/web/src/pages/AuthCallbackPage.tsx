import { Link, Navigate } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { StatusMessage } from "../components/StatusMessage";

function callbackError(): string | null {
  const params = new URLSearchParams(window.location.search || window.location.hash.slice(1));
  return params.get("error_description") ?? params.get("error");
}

export function AuthCallbackPage() {
  const { session, loading } = useAuth();
  const error = callbackError();

  if (session) return <Navigate to="/" replace />;

  return (
    <main className="full-page">
      {error || !loading ? (
        <>
          <StatusMessage kind="error">O link de acesso é inválido ou expirou. Solicite um novo link.</StatusMessage>
          <Link to="/login" className="button secondary">
            Voltar para o login
          </Link>
        </>
      ) : (
        <StatusMessage kind="loading">Validando seu acesso…</StatusMessage>
      )}
    </main>
  );
}
