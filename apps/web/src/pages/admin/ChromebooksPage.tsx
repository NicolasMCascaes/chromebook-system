import { useState, type FormEvent } from "react";
import {
  CHROMEBOOK_STATUS_LABELS,
  CHROMEBOOK_STATUSES,
  chromebookInputSchema,
  type CartDto,
  type ChromebookDto,
  type ChromebookStatus,
} from "@chromebook/shared";
import { useAdminCarts, useAdminChromebooks, useSaveChromebook, type ChromebookFilters } from "../../api/hooks";
import { errorMessage } from "../../api/client";
import { StatusMessage } from "../../components/StatusMessage";
import { FieldError } from "../../components/FieldError";
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from "../../lib/form-errors";

interface ChromebookFormValues {
  assetTag: string;
  name: string;
  brandModel: string;
  cartId: string;
  status: ChromebookStatus;
}

function ChromebookForm({
  chromebook,
  carts,
  onDone,
}: {
  chromebook?: ChromebookDto;
  carts: CartDto[];
  onDone: (message: string) => void;
}) {
  const [values, setValues] = useState<ChromebookFormValues>(
    chromebook
      ? {
          assetTag: chromebook.assetTag,
          name: chromebook.name,
          brandModel: chromebook.brandModel,
          cartId: chromebook.cartId,
          status: chromebook.status,
        }
      : { assetTag: "", name: "", brandModel: "", cartId: carts[0]?.id ?? "", status: "AVAILABLE" },
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const save = useSaveChromebook();

  const set = <K extends keyof ChromebookFormValues>(key: K, value: ChromebookFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = chromebookInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    try {
      await save.mutateAsync({ id: chromebook?.id, input: parsed.data });
      onDone(chromebook ? "Chromebook atualizado." : "Chromebook cadastrado.");
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <h2>{chromebook ? `Editar ${chromebook.assetTag}` : "Novo Chromebook"}</h2>
      <div className="form-grid">
        <label className="field">
          <span>Identificação (patrimônio)</span>
          <input value={values.assetTag} onChange={(event) => set("assetTag", event.target.value)} maxLength={40} />
          <FieldError message={errors.assetTag} />
        </label>
        <label className="field">
          <span>Nome</span>
          <input value={values.name} onChange={(event) => set("name", event.target.value)} maxLength={80} />
          <FieldError message={errors.name} />
        </label>
        <label className="field">
          <span>Marca/modelo</span>
          <input value={values.brandModel} onChange={(event) => set("brandModel", event.target.value)} maxLength={80} />
          <FieldError message={errors.brandModel} />
        </label>
        <label className="field">
          <span>Carrinho</span>
          <select value={values.cartId} onChange={(event) => set("cartId", event.target.value)}>
            {carts.map((cart) => (
              <option key={cart.id} value={cart.id}>
                {cart.name}
                {cart.active ? "" : " (inativo)"}
              </option>
            ))}
          </select>
          <FieldError message={errors.cartId} />
        </label>
        <label className="field">
          <span>Situação</span>
          <select value={values.status} onChange={(event) => set("status", event.target.value as ChromebookStatus)}>
            {CHROMEBOOK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CHROMEBOOK_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <FieldError message={errors.status} />
        </label>
      </div>
      {save.isError && <StatusMessage kind="error">{errorMessage(save.error)}</StatusMessage>}
      <div className="actions">
        <button type="button" className="button secondary" onClick={() => onDone("")}>
          Cancelar
        </button>
        <button type="submit" className="button primary" disabled={save.isPending}>
          {save.isPending ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

export function ChromebooksPage() {
  const [filters, setFilters] = useState<ChromebookFilters>({});
  const carts = useAdminCarts();
  const chromebooks = useAdminChromebooks(filters);
  const [editing, setEditing] = useState<ChromebookDto | "new" | null>(null);
  const [feedback, setFeedback] = useState("");

  const hasCarts = (carts.data?.length ?? 0) > 0;

  function finish(message: string) {
    setEditing(null);
    setFeedback(message);
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="filters">
          <label className="field inline">
            <span>Carrinho</span>
            <select
              value={filters.cartId ?? ""}
              onChange={(event) => setFilters((current) => ({ ...current, cartId: event.target.value || undefined }))}
            >
              <option value="">Todos</option>
              {carts.data?.map((cart) => (
                <option key={cart.id} value={cart.id}>
                  {cart.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field inline">
            <span>Situação</span>
            <select
              value={filters.status ?? ""}
              onChange={(event) =>
                setFilters((current) => ({ ...current, status: (event.target.value || undefined) as ChromebookStatus | undefined }))
              }
            >
              <option value="">Todas</option>
              {CHROMEBOOK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {CHROMEBOOK_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className="button primary"
          disabled={!hasCarts}
          title={hasCarts ? undefined : "Cadastre um carrinho primeiro"}
          onClick={() => {
            setFeedback("");
            setEditing("new");
          }}
        >
          Novo Chromebook
        </button>
      </div>

      {carts.isSuccess && !hasCarts && (
        <StatusMessage kind="info">Cadastre um carrinho antes de adicionar Chromebooks.</StatusMessage>
      )}
      {feedback && <StatusMessage kind="success">{feedback}</StatusMessage>}
      {editing && carts.data && (
        <ChromebookForm
          key={editing === "new" ? "new" : editing.id}
          chromebook={editing === "new" ? undefined : editing}
          carts={carts.data}
          onDone={finish}
        />
      )}

      {chromebooks.isPending && <StatusMessage kind="loading">Carregando Chromebooks…</StatusMessage>}
      {chromebooks.isError && <StatusMessage kind="error">{errorMessage(chromebooks.error)}</StatusMessage>}
      {chromebooks.data?.length === 0 && <StatusMessage kind="empty">Nenhum Chromebook encontrado.</StatusMessage>}

      {chromebooks.data && chromebooks.data.length > 0 && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Identificação</th>
                <th>Nome</th>
                <th>Marca/modelo</th>
                <th>Carrinho</th>
                <th>Situação</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {chromebooks.data.map((chromebook) => (
                <tr key={chromebook.id}>
                  <td>{chromebook.assetTag}</td>
                  <td>{chromebook.name}</td>
                  <td>{chromebook.brandModel}</td>
                  <td>{chromebook.cartName}</td>
                  <td>
                    <span className={`badge badge-${chromebook.status.toLowerCase()}`}>
                      {CHROMEBOOK_STATUS_LABELS[chromebook.status]}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button link"
                      onClick={() => {
                        setFeedback("");
                        setEditing(chromebook);
                      }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
