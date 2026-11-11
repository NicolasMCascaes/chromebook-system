import { useState, type FormEvent } from "react";
import { USER_ROLE_LABELS, PASSWORD_MIN_LENGTH, userInputSchema, type UserDto } from "@chromebook/shared";
import { useAdminUsers, useAuthorizeUser, useUpdateUser } from "../../api/hooks";
import { errorMessage } from "../../api/client";
import { useCurrentUser } from "../../auth/guards";
import { Modal } from "../../components/Modal";
import { StatusMessage } from "../../components/StatusMessage";
import { notify } from "../../lib/toast";
import { FieldError } from "../../components/FieldError";
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from "../../lib/form-errors";

function AuthorizeUserForm({ onDone, onCancel }: { onDone: (message: string) => void; onCancel: () => void }) {
  const [values, setValues] = useState({ email: "", name: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const authorize = useAuthorizeUser();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = userInputSchema.safeParse({ ...values, role: "ADMIN" });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    try {
      const user = await authorize.mutateAsync(parsed.data);
      setValues({ email: "", name: "", password: "" });
      onDone(`${user.email} autorizado. Passe a senha inicial para a pessoa entrar na área do TI.`);
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <p className="muted small-text">Professores não precisam de conta: eles reservam pelo link público da agenda.</p>
      <div className="form-grid">
        <label className="field">
          <span>E-mail</span>
          <input
            type="email"
            value={values.email}
            onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
          />
          <FieldError message={errors.email} />
        </label>
        <label className="field">
          <span>Nome</span>
          <input
            value={values.name}
            maxLength={100}
            onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
          />
          <FieldError message={errors.name} />
        </label>
        <label className="field">
          <span>Senha inicial (mínimo {PASSWORD_MIN_LENGTH} caracteres)</span>
          <input
            type="password"
            autoComplete="new-password"
            value={values.password}
            maxLength={72}
            onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))}
          />
          <FieldError message={errors.password} />
        </label>
      </div>
      <div className="actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="button primary" disabled={authorize.isPending}>
          {authorize.isPending ? "Autorizando…" : "Autorizar"}
        </button>
      </div>
    </form>
  );
}

function UserRow({ user, isSelf }: { user: UserDto; isSelf: boolean }) {
  const update = useUpdateUser();
  const [confirming, setConfirming] = useState(false);

  const change = (input: { active: boolean }) =>
    update.mutate(
      { id: user.id, input },
      {
        onSuccess: (updated) =>
          notify.success(updated.active ? `${updated.name} voltou a ter acesso.` : `Acesso de ${updated.name} desativado.`),
        onSettled: () => setConfirming(false),
      },
    );

  return (
    <tr className={user.active ? undefined : "row-inactive"}>
      <td>{user.name}</td>
      <td>{user.email}</td>
      <td>{USER_ROLE_LABELS[user.role]}</td>
      <td>{user.active ? "Ativo" : "Desativado"}</td>
      <td>
        {!isSelf && confirming && (
          <span className="inline-confirm">
            <span>Desativar {user.name}? O acesso à área do TI é encerrado na hora.</span>
            <button type="button" className="button link" disabled={update.isPending} onClick={() => setConfirming(false)}>
              Voltar
            </button>
            <button type="button" className="button link danger-text" disabled={update.isPending} onClick={() => change({ active: false })}>
              Confirmar
            </button>
          </span>
        )}
        {!isSelf && !confirming && (
          <button
            type="button"
            className="button link"
            disabled={update.isPending}
            onClick={() => (user.active ? setConfirming(true) : change({ active: true }))}
          >
            {user.active ? "Desativar" : "Reativar"}
          </button>
        )}
      </td>
    </tr>
  );
}

export function UsersPage() {
  const currentUser = useCurrentUser();
  const users = useAdminUsers();
  const [authorizing, setAuthorizing] = useState(false);

  return (
    <div className="stack">
      <div className="toolbar">
        <p className="muted small-text">Contas com acesso à área do TI.</p>
        <button
          type="button"
          className="button primary"
          onClick={() => setAuthorizing(true)}
        >
          Autorizar acesso do TI
        </button>
      </div>
      <Modal open={authorizing} title="Autorizar acesso do TI" onClose={() => setAuthorizing(false)}>
        {authorizing && (
          <AuthorizeUserForm
            onCancel={() => setAuthorizing(false)}
            onDone={(text) => {
              setAuthorizing(false);
              notify.success(text);
            }}
          />
        )}
      </Modal>

      {users.isPending && <StatusMessage kind="loading">Carregando usuários…</StatusMessage>}
      {users.isError && <StatusMessage kind="error">{errorMessage(users.error)}</StatusMessage>}

      {users.data && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Situação</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {users.data.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSelf={user.id === currentUser.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
