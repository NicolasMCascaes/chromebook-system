import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  addDays,
  RESERVATION_STATUS_LABELS,
  RESERVATION_STATUSES,
  reservationUpdateSchema,
  SCHOOL_CLASSES,
  schoolNow,
  type AdminReservationDto,
  type CartDto,
  type ReservationStatus,
} from "@chromebook/shared";
import {
  useAdminCancelReservation,
  useAdminCarts,
  useAdminReservations,
  useDecideReservation,
  useEditReservation,
  usePendingReservations,
  type AdminReservationFilters,
} from "../../api/hooks";
import { errorMessage } from "../../api/client";
import { Modal } from "../../components/Modal";
import { StatusMessage } from "../../components/StatusMessage";
import { FieldError } from "../../components/FieldError";
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from "../../lib/form-errors";
import { formatDateShort, formatTimeRange, plural } from "../../lib/format";
import { DecisionPanel } from "../../features/admin/DecisionPanel";
import { FailedNotifications } from "../../features/admin/FailedNotifications";
import { ReservationSummary } from "../../features/agenda/ReservationDialog";

const DEFAULT_RANGE_DAYS = 30;

function initialFilters(): AdminReservationFilters {
  const today = schoolNow(new Date()).date;
  return { from: today, to: addDays(today, DEFAULT_RANGE_DAYS), status: undefined };
}

function EditReservationForm({
  reservation,
  carts,
  onDone,
}: {
  reservation: AdminReservationDto;
  carts: CartDto[];
  onDone: (message: string) => void;
}) {
  const [values, setValues] = useState({
    teacherName: reservation.teacherName,
    className: reservation.className,
    cartId: reservation.cartId,
    date: reservation.date,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    notes: reservation.notes ?? "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const edit = useEditReservation();
  const selectableCarts = carts.filter((cart) => cart.active || cart.id === reservation.cartId);

  const set = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = reservationUpdateSchema.safeParse({
      ...values,
      className: values.className === reservation.className ? undefined : values.className,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    try {
      await edit.mutateAsync({ id: reservation.id, input: parsed.data });
      onDone("Reserva atualizada.");
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label className="field">
          <span>Professor</span>
          <input value={values.teacherName} maxLength={100} onChange={(event) => set("teacherName", event.target.value)} />
          <FieldError message={errors.teacherName} />
        </label>
        <label className="field">
          <span>Turma</span>
          <select value={values.className} onChange={(event) => set("className", event.target.value)}>
            {!(SCHOOL_CLASSES as readonly string[]).includes(reservation.className) && (
              <option value={reservation.className}>{reservation.className}</option>
            )}
            {SCHOOL_CLASSES.map((schoolClass) => (
              <option key={schoolClass} value={schoolClass}>
                {schoolClass}
              </option>
            ))}
          </select>
          <FieldError message={errors.className} />
        </label>
        <label className="field">
          <span>Carrinho</span>
          <select value={values.cartId} onChange={(event) => set("cartId", event.target.value)}>
            {selectableCarts.map((cart) => (
              <option key={cart.id} value={cart.id}>
                {cart.name}
              </option>
            ))}
          </select>
          <FieldError message={errors.cartId} />
        </label>
        <label className="field">
          <span>Data</span>
          <input type="date" value={values.date} onChange={(event) => set("date", event.target.value)} />
          <FieldError message={errors.date} />
        </label>
        <label className="field">
          <span>Início</span>
          <input type="time" value={values.startTime} onChange={(event) => set("startTime", event.target.value)} />
          <FieldError message={errors.startTime} />
        </label>
        <label className="field">
          <span>Término</span>
          <input type="time" value={values.endTime} onChange={(event) => set("endTime", event.target.value)} />
          <FieldError message={errors.endTime} />
        </label>
        <label className="field full">
          <span>Observação (opcional)</span>
          <textarea value={values.notes} maxLength={500} rows={2} onChange={(event) => set("notes", event.target.value)} />
          <FieldError message={errors.notes} />
        </label>
      </div>
      {edit.isError && <StatusMessage kind="error">{errorMessage(edit.error)}</StatusMessage>}
      <div className="actions">
        <button type="button" className="button secondary" onClick={() => onDone("")}>
          Voltar
        </button>
        <button type="submit" className="button primary" disabled={edit.isPending}>
          {edit.isPending ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}

function CancelReservationForm({
  reservation,
  onDone,
}: {
  reservation: AdminReservationDto;
  onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const cancel = useAdminCancelReservation();

  return (
    <div className="stack">
      <p>
        {reservation.teacherName}, {reservation.className}: {reservation.cartName} em {formatDateShort(reservation.date)},{" "}
        {formatTimeRange(reservation.startTime, reservation.endTime)}.
      </p>
      <label className="field">
        <span>Motivo do cancelamento (opcional)</span>
        <input value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} />
      </label>
      {cancel.isError && <StatusMessage kind="error">{errorMessage(cancel.error)}</StatusMessage>}
      <div className="actions">
        <button type="button" className="button secondary" disabled={cancel.isPending} onClick={() => onDone("")}>
          Manter reserva
        </button>
        <button
          type="button"
          className="button danger"
          disabled={cancel.isPending}
          onClick={() =>
            cancel.mutate(
              { id: reservation.id, reason: reason.trim() || null },
              { onSuccess: () => onDone("Reserva cancelada. O horário foi liberado na agenda.") },
            )
          }
        >
          {cancel.isPending ? "Cancelando…" : "Cancelar reserva"}
        </button>
      </div>
    </div>
  );
}

const STATUS_BADGES: Record<ReservationStatus, string> = {
  PENDING: "badge badge-pending",
  CONFIRMED: "badge badge-available",
  REJECTED: "badge badge-rejected",
  CANCELLED: "badge badge-inactive",
};

function DecideReservationForm({ reservation, onDone }: { reservation: AdminReservationDto; onDone: (message: string) => void }) {
  const decide = useDecideReservation();
  return (
    <div className="stack">
      <ReservationSummary
        teacherName={reservation.teacherName}
        className={reservation.className}
        date={reservation.date}
        startTime={reservation.startTime}
        endTime={reservation.endTime}
        cartName={reservation.cartName}
        cartColor={reservation.cartColor}
        notes={reservation.notes}
        periodsLabel={null}
      />
      <DecisionPanel
        busy={decide.isPending}
        error={decide.isError ? errorMessage(decide.error) : null}
        onBack={() => onDone("")}
        onDecide={(input) =>
          decide.mutate(
            { id: reservation.id, input },
            {
              onSuccess: (result) =>
                onDone(
                  result.status === "CONFIRMED"
                    ? `Reserva de ${result.teacherName} aprovada.`
                    : `Pedido de ${result.teacherName} recusado. O horário foi liberado.`,
                ),
            },
          )
        }
      />
    </div>
  );
}

function PendingRequests({ onDecide }: { onDecide: (reservation: AdminReservationDto) => void }) {
  const pending = usePendingReservations();
  if (pending.isPending) return null;
  if (pending.isError) return <StatusMessage kind="error">{errorMessage(pending.error)}</StatusMessage>;
  return (
    <section className="card stack" aria-labelledby="pending-title">
      <h2 id="pending-title">Pedidos aguardando aprovação</h2>
      {pending.data.length === 0 ? (
        <p className="muted">Nenhum pedido aguardando. Novos pedidos chegam por e-mail e aparecem aqui.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Horário</th>
                <th>Carrinho</th>
                <th>Professor</th>
                <th>Turma</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {pending.data.map((reservation) => (
                <tr key={reservation.id}>
                  <td>{formatDateShort(reservation.date)}</td>
                  <td>{formatTimeRange(reservation.startTime, reservation.endTime)}</td>
                  <td>
                    <span className="swatch" style={{ backgroundColor: reservation.cartColor }} aria-hidden="true" />{" "}
                    {reservation.cartName}
                  </td>
                  <td>{reservation.teacherName}</td>
                  <td>
                    {reservation.className}
                    {reservation.notes && <div className="muted small-text">{reservation.notes}</div>}
                  </td>
                  <td className="row-actions">
                    <button type="button" className="button primary small" onClick={() => onDecide(reservation)}>
                      Analisar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ReservationsPage() {
  const [filters, setFilters] = useState<AdminReservationFilters>(initialFilters);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<{ type: "edit" | "cancel" | "decide"; reservation: AdminReservationDto } | null>(null);
  const [feedback, setFeedback] = useState("");
  const reservations = useAdminReservations(filters);
  const carts = useAdminCarts();

  const update = (changes: Partial<AdminReservationFilters>) => setFilters((current) => ({ ...current, ...changes }));

  function finish(message: string) {
    setAction(null);
    if (message) setFeedback(message);
  }

  return (
    <div className="stack">
      {feedback && <StatusMessage kind="success">{feedback}</StatusMessage>}
      <FailedNotifications />
      <PendingRequests
        onDecide={(reservation) => {
          setFeedback("");
          setAction({ type: "decide", reservation });
        }}
      />
      <div className="toolbar">
        <h2>Todas as reservas</h2>
        <Link to="/admin/impressao" target="_blank" rel="noopener" className="button secondary">
          Imprimir agenda do dia
        </Link>
      </div>
      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          update({ search: search.trim() || undefined });
        }}
      >
        <label className="field inline">
          <span>De</span>
          <input type="date" value={filters.from} onChange={(event) => event.target.value && update({ from: event.target.value })} />
        </label>
        <label className="field inline">
          <span>Até</span>
          <input type="date" value={filters.to} onChange={(event) => event.target.value && update({ to: event.target.value })} />
        </label>
        <label className="field inline">
          <span>Carrinho</span>
          <select value={filters.cartId ?? ""} onChange={(event) => update({ cartId: event.target.value || undefined })}>
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
            onChange={(event) => update({ status: (event.target.value || undefined) as ReservationStatus | undefined })}
          >
            <option value="">Todas</option>
            {RESERVATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {RESERVATION_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="field inline">
          <span>Professor ou turma</span>
          <input type="search" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <button type="submit" className="button secondary">
          Buscar
        </button>
      </form>

      {reservations.isPending && <StatusMessage kind="loading">Carregando reservas…</StatusMessage>}
      {reservations.isError && <StatusMessage kind="error">{errorMessage(reservations.error)}</StatusMessage>}
      {reservations.data?.length === 0 && <StatusMessage kind="empty">Nenhuma reserva encontrada nesse período.</StatusMessage>}

      {reservations.data && reservations.data.length > 0 && (
        <>
          <p className="muted small-text">{plural(reservations.data.length, "reserva", "reservas")}</p>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Horário</th>
                  <th>Carrinho</th>
                  <th>Professor</th>
                  <th>Turma</th>
                  <th>Situação</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {reservations.data.map((reservation) => (
                  <tr key={reservation.id} className={reservation.status === "CANCELLED" || reservation.status === "REJECTED" ? "row-inactive" : undefined}>
                    <td>{formatDateShort(reservation.date)}</td>
                    <td>{formatTimeRange(reservation.startTime, reservation.endTime)}</td>
                    <td>
                      <span className="swatch" style={{ backgroundColor: reservation.cartColor }} aria-hidden="true" />{" "}
                      {reservation.cartName}
                    </td>
                    <td>{reservation.teacherName}</td>
                    <td>
                      {reservation.className}
                      {reservation.notes && <div className="muted small-text">{reservation.notes}</div>}
                    </td>
                    <td>
                      <span className={STATUS_BADGES[reservation.status]}>{RESERVATION_STATUS_LABELS[reservation.status]}</span>
                      {(reservation.cancelReason ?? reservation.decisionReason) && (
                        <div className="muted small-text">{reservation.cancelReason ?? reservation.decisionReason}</div>
                      )}
                    </td>
                    <td className="row-actions">
                      {reservation.status === "PENDING" && (
                        <button
                          type="button"
                          className="button link"
                          onClick={() => {
                            setFeedback("");
                            setAction({ type: "decide", reservation });
                          }}
                        >
                          Analisar
                        </button>
                      )}
                      {(reservation.status === "CONFIRMED" || reservation.status === "PENDING") && (
                        <>
                          <button
                            type="button"
                            className="button link"
                            onClick={() => {
                              setFeedback("");
                              setAction({ type: "edit", reservation });
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="button link danger-text"
                            onClick={() => {
                              setFeedback("");
                              setAction({ type: "cancel", reservation });
                            }}
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal
        open={action !== null}
        title={action?.type === "cancel" ? "Cancelar reserva" : action?.type === "decide" ? "Pedido de reserva" : "Editar reserva"}
        onClose={() => setAction(null)}
      >
        {action?.type === "edit" && carts.data && (
          <EditReservationForm key={action.reservation.id} reservation={action.reservation} carts={carts.data} onDone={finish} />
        )}
        {action?.type === "decide" && (
          <DecideReservationForm key={action.reservation.id} reservation={action.reservation} onDone={finish} />
        )}
        {action?.type === "cancel" && (
          <CancelReservationForm key={action.reservation.id} reservation={action.reservation} onDone={finish} />
        )}
      </Modal>
    </div>
  );
}
