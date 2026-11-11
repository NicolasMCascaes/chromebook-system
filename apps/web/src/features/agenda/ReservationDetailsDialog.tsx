import { useState } from "react";
import type { ClassScheduleDto } from "@chromebook/shared";
import { useCancelReservation, useReservation } from "../../api/hooks";
import { errorMessage } from "../../api/client";
import { Modal } from "../../components/Modal";
import { StatusMessage } from "../../components/StatusMessage";
import { describeWithSchedules } from "./schedule-model";
import { cancelTokenFor } from "../../lib/my-reservations";
import { ReservationSummary } from "./ReservationDialog";

interface ReservationDetailsDialogProps {
  reservationId: string | null;
  schedules: ClassScheduleDto[];
  onClose: () => void;
}

function ReservationDetails({ reservationId, schedules, onClose }: { reservationId: string; schedules: ClassScheduleDto[]; onClose: () => void }) {
  const cancelToken = cancelTokenFor(reservationId);
  const reservation = useReservation(reservationId, cancelToken);
  const cancel = useCancelReservation();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  if (reservation.isPending) return <StatusMessage kind="loading">Carregando reserva…</StatusMessage>;
  if (reservation.isError) return <StatusMessage kind="error">{errorMessage(reservation.error)}</StatusMessage>;

  const data = reservation.data;
  const cancelled = data.status === "CANCELLED";
  const canCancel = data.canCancel && cancelToken !== undefined;

  return (
    <div className="stack">
      {cancelled && <StatusMessage kind="info">Esta reserva foi cancelada e o horário está liberado.</StatusMessage>}
      <ReservationSummary
        teacherName={data.teacherName}
        className={data.className}
        date={data.date}
        startTime={data.startTime}
        endTime={data.endTime}
        cartName={data.cartName}
        cartColor={data.cartColor}
        notes={data.notes}
        periodsLabel={describeWithSchedules(schedules, data.startTime, data.endTime)}
      />

      {cancel.isError && <StatusMessage kind="error">{errorMessage(cancel.error)}</StatusMessage>}

      {!cancelled && data.canCancel && !cancelToken && (
        <p className="muted small-text">
          Esta reserva foi feita em outro navegador. Para cancelá-la, fale com o TI.
        </p>
      )}

      {confirming && canCancel && cancelToken ? (
        <div className="cancel-confirm">
          <label className="field">
            <span>Motivo do cancelamento (opcional)</span>
            <input value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} />
          </label>
          <div className="actions">
            <button type="button" className="button secondary" disabled={cancel.isPending} onClick={() => setConfirming(false)}>
              Manter reserva
            </button>
            <button
              type="button"
              className="button danger"
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate(
                  { id: data.id, reason: reason.trim() || undefined, cancelToken },
                  { onSuccess: () => setConfirming(false) },
                )
              }
            >
              {cancel.isPending ? "Cancelando…" : "Cancelar reserva"}
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          {canCancel && (
            <button type="button" className="button danger-outline" onClick={() => setConfirming(true)}>
              Cancelar reserva
            </button>
          )}
          <button type="button" className="button primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}

export function ReservationDetailsDialog({ reservationId, schedules, onClose }: ReservationDetailsDialogProps) {
  return (
    <Modal open={reservationId !== null} title="Reserva" onClose={onClose}>
      {reservationId && <ReservationDetails reservationId={reservationId} schedules={schedules} onClose={onClose} />}
    </Modal>
  );
}
