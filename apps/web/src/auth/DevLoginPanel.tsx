import { useMutation, useQuery } from "@tanstack/react-query";
import type { MeDto } from "@chromebook/shared";
import { apiFetch, errorMessage } from "../api/client";
import { StatusMessage } from "../components/StatusMessage";
import { setDevAccessToken } from "./session-source";

const ROLE_LABELS: Record<MeDto["role"], string> = { ADMIN: "Administrador", PROFESSOR: "Professor" };

export function DevLoginPanel() {
  const users = useQuery({ queryKey: ["dev-users"], queryFn: () => apiFetch<MeDto[]>("/api/dev/login") });
  const login = useMutation({
    mutationFn: (userId: string) =>
      apiFetch<{ accessToken: string }>("/api/dev/login", { method: "POST", body: { userId } }),
    onSuccess: ({ accessToken }) => setDevAccessToken(accessToken),
  });

  return (
    <div className="stack">
      <StatusMessage kind="info">Modo de desenvolvimento: escolha um usuário para entrar sem e-mail.</StatusMessage>
      {users.isPending && <StatusMessage kind="loading">Carregando usuários…</StatusMessage>}
      {users.isError && <StatusMessage kind="error">{errorMessage(users.error)}</StatusMessage>}
      {login.isError && <StatusMessage kind="error">{errorMessage(login.error)}</StatusMessage>}
      {users.data?.map((user) => (
        <button
          key={user.id}
          type="button"
          className="button secondary"
          disabled={login.isPending}
          onClick={() => login.mutate(user.id)}
        >
          {user.name} ({ROLE_LABELS[user.role]})
        </button>
      ))}
    </div>
  );
}
