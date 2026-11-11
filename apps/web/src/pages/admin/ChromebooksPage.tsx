import { useMemo, useState, type FormEvent } from "react";
import {
  CHROMEBOOK_STATUS_LABELS,
  CHROMEBOOK_STATUSES,
  chromebookInputSchema,
  type CartDto,
  type ChromebookDto,
  type AdminReservationDto,
  type ChromebookStatus,
} from "@chromebook/shared";
import {
  useAdminCarts,
  useAdminChromebooks,
  useFetchCartUpcomingReservations,
  useSaveChromebook,
  type ChromebookFilters,
} from "../../api/hooks";
import { ImpactConfirmation } from "../../features/admin/AffectedReservations";
import { plural } from "../../lib/format";
import { errorMessage } from "../../api/client";
import { Modal } from "../../components/Modal";
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
  const [impact, setImpact] = useState<{ consequences: string[]; reservations: AdminReservationDto[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const save = useSaveChromebook();
  const fetchUpcoming = useFetchCartUpcomingReservations();

  const set = <K extends keyof ChromebookFormValues>(key: K, value: ChromebookFormValues[K]) => {
    setImpact(null);
    setValues((current) => ({ ...current, [key]: value }));
  };

  async function describeImpact(): Promise<{ consequences: string[]; reservations: AdminReservationDto[] } | null> {
    if (!chromebook || chromebook.status !== "AVAILABLE") return null;
    const leavesCart = values.cartId !== chromebook.cartId;
    if (values.status === "AVAILABLE" && !leavesCart) return null;
    const cart = carts.find((item) => item.id === chromebook.cartId);
    const remaining = Math.max((cart?.equipment.available ?? 1) - 1, 0);
    const reservations = await fetchUpcoming(chromebook.cartId);
    const consequences = [
      leavesCart
        ? `${chromebook.assetTag} sai do ${cart?.name ?? "carrinho atual"}.`
        : `${chromebook.assetTag} deixa de contar como disponível (${CHROMEBOOK_STATUS_LABELS[values.status].toLowerCase()}).`,
      `O ${cart?.name ?? "carrinho"} fica com ${plural(remaining, "Chromebook disponível", "Chromebooks disponíveis")}.`,
    ];
    if (remaining === 0) consequences.push("O carrinho ficará sem nenhum equipamento disponível para as aulas já reservadas.");
    if (reservations.length === 0 && remaining > 0) return null;
    return { consequences, reservations };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = chromebookInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    if (!impact) {
      setChecking(true);
      try {
        const found = await describeImpact();
        if (found) {
          setImpact(found);
          return;
        }
      } catch (error) {
        setErrors(apiFieldErrors(error));
        return;
      } finally {
        setChecking(false);
      }
    }
    try {
      await save.mutateAsync({ id: chromebook?.id, input: parsed.data });
      onDone(chromebook ? "Chromebook atualizado." : "Chromebook cadastrado.");
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
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
      {impact ? (
        <ImpactConfirmation
          title="Confira o impacto antes de salvar"
          consequences={impact.consequences}
          reservations={impact.reservations}
          confirmLabel="Salvar mesmo assim"
          busy={save.isPending}
          onBack={() => setImpact(null)}
          onConfirm={() => handleSubmit({ preventDefault() {} } as FormEvent)}
        />
      ) : (
        <div className="actions">
          <button type="button" className="button secondary" onClick={() => onDone("")}>
            Cancelar
          </button>
          <button type="submit" className="button primary" disabled={save.isPending || checking}>
            {save.isPending ? "Salvando…" : checking ? "Verificando reservas…" : "Salvar"}
          </button>
        </div>
      )}
    </form>
  );
}

type SortDirection = "asc" | "desc";

const assetTagCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function sortByAssetTag(chromebooks: ChromebookDto[], direction: SortDirection): ChromebookDto[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...chromebooks].sort((a, b) => factor * assetTagCollator.compare(a.assetTag, b.assetTag));
}

export function ChromebooksPage() {
  const [filters, setFilters] = useState<ChromebookFilters>({});
  const carts = useAdminCarts();
  const chromebooks = useAdminChromebooks(filters);
  const [editing, setEditing] = useState<ChromebookDto | "new" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const sortedChromebooks = useMemo(
    () => (chromebooks.data ? sortByAssetTag(chromebooks.data, sortDirection) : []),
    [chromebooks.data, sortDirection],
  );

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
      <Modal
        open={editing !== null}
        title={editing === "new" ? "Novo Chromebook" : editing ? `Editar ${editing.assetTag}` : ""}
        onClose={() => setEditing(null)}
      >
        {editing && carts.data && (
          <ChromebookForm
            key={editing === "new" ? "new" : editing.id}
            chromebook={editing === "new" ? undefined : editing}
            carts={carts.data}
            onDone={finish}
          />
        )}
      </Modal>

      {chromebooks.isPending && <StatusMessage kind="loading">Carregando Chromebooks…</StatusMessage>}
      {chromebooks.isError && <StatusMessage kind="error">{errorMessage(chromebooks.error)}</StatusMessage>}
      {chromebooks.data?.length === 0 && <StatusMessage kind="empty">Nenhum Chromebook encontrado.</StatusMessage>}

      {chromebooks.data && chromebooks.data.length > 0 && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th aria-sort={sortDirection === "asc" ? "ascending" : "descending"}>
                  <button
                    type="button"
                    className="sort-button"
                    title={sortDirection === "asc" ? "Ordem crescente. Clique para decrescente." : "Ordem decrescente. Clique para crescente."}
                    onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                  >
                    Identificação <span aria-hidden="true">{sortDirection === "asc" ? "▲" : "▼"}</span>
                  </button>
                </th>
                <th>Nome</th>
                <th>Marca/modelo</th>
                <th>Carrinho</th>
                <th>Situação</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {sortedChromebooks.map((chromebook) => (
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
