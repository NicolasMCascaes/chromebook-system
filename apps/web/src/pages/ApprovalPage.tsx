import { useSearchParams } from "react-router";
import { APPROVAL_TOKEN_PATTERN, RESERVATION_STATUS_LABELS, type AdminReservationDto } from "@chromebook/shared";
import { useApprovalRequest, useDecideByLink } from "../api/hooks";
import { errorMessage } from "../api/client";
import { StatusMessage } from "../components/StatusMessage";
import { DecisionPanel } from "../features/admin/DecisionPanel";
import { ReservationSummary } from "../features/agenda/ReservationDialog";

function DecisionResult({ reservation }: { reservation: AdminReservationDto }) {
  if (reservation.status === "CONFIRMED") {
    return <StatusMessage kind="success">Reserva aprovada. Ela aparece como aprovada na agenda dos professores.</StatusMessage>;
  }
  if (reservation.status === "REJECTED") {
    return (
      <StatusMessage kind="info">
        Pedido recusado{reservation.decisionReason ? `: ${reservation.decisionReason}` : ""}. O horário foi liberado.
      </StatusMessage>
    );
  }
  return (
    <StatusMessage kind="info">
      Este pedido não aguarda mais aprovação (situação: {RESERVATION_STATUS_LABELS[reservation.status].toLowerCase()}).
    </StatusMessage>
  );
}

function ApprovalRequest({ id, approvalToken }: { id: string; approvalToken: string }) {
  const request = useApprovalRequest(id, approvalToken);
  const decide = useDecideByLink();

  if (request.isPending) return <StatusMessage kind="loading">Carregando pedido…</StatusMessage>;
  if (request.isError) return <StatusMessage kind="error">{errorMessage(request.error)}</StatusMessage>;

  const reservation = request.data;
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
      {reservation.status === "PENDING" ? (
        <DecisionPanel
          busy={decide.isPending}
          error={decide.isError ? errorMessage(decide.error) : null}
          onDecide={(input) => decide.mutate({ id, input: { ...input, approvalToken } })}
        />
      ) : (
        <DecisionResult reservation={reservation} />
      )}
    </div>
  );
}

export function ApprovalPage() {
  const [params] = useSearchParams();
  const id = params.get("reserva") ?? "";
  const approvalToken = params.get("codigo") ?? "";
  const valid = /^[0-9a-f-]{36}$/i.test(id) && APPROVAL_TOKEN_PATTERN.test(approvalToken);

  return (
    <section className="page">
      <div className="card approval-card">
        <h1>Pedido de reserva</h1>
        {valid ? (
          <ApprovalRequest id={id} approvalToken={approvalToken} />
        ) : (
          <StatusMessage kind="error">Link de aprovação incompleto. Abra o link do e-mail novamente ou use a área do TI.</StatusMessage>
        )}
      </div>
    </section>
  );
}
