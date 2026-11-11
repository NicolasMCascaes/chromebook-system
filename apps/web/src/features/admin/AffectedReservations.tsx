import { RESERVATION_STATUS_LABELS, type AdminReservationDto } from "@chromebook/shared";
import { StatusMessage } from "../../components/StatusMessage";
import { formatDateShort, formatTimeRange, plural } from "../../lib/format";

interface AffectedReservationsProps {
  reservations: AdminReservationDto[];
  intro: string;
}

export function AffectedReservations({ reservations, intro }: AffectedReservationsProps) {
  if (reservations.length === 0) return null;
  return (
    <div className="stack">
      <StatusMessage kind="info">
        {intro} {plural(reservations.length, "reserva ou pedido foi encontrado", "reservas ou pedidos foram encontrados")}.
        Nenhum foi cancelado automaticamente: avise os professores ou cancele em Reservas.
      </StatusMessage>
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
            </tr>
          </thead>
          <tbody>
            {reservations.map((reservation) => (
              <tr key={reservation.id}>
                <td>{formatDateShort(reservation.date)}</td>
                <td>{formatTimeRange(reservation.startTime, reservation.endTime)}</td>
                <td>
                  <span className="swatch" style={{ backgroundColor: reservation.cartColor }} aria-hidden="true" />{" "}
                  {reservation.cartName}
                </td>
                <td>{reservation.teacherName}</td>
                <td>{reservation.className}</td>
                <td>{RESERVATION_STATUS_LABELS[reservation.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface ImpactConfirmationProps {
  title: string;
  consequences: string[];
  reservations: AdminReservationDto[];
  reservationsIntro?: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

export function ImpactConfirmation(props: ImpactConfirmationProps) {
  return (
    <div className="impact-confirmation stack" role="alertdialog" aria-labelledby="impact-title">
      <h3 id="impact-title">{props.title}</h3>
      <ul>
        {props.consequences.map((consequence) => (
          <li key={consequence}>{consequence}</li>
        ))}
      </ul>
      <AffectedReservations reservations={props.reservations} intro={props.reservationsIntro ?? "Neste carrinho,"} />
      <div className="actions">
        <button type="button" className="button secondary" disabled={props.busy} onClick={props.onBack}>
          Voltar e revisar
        </button>
        <button type="button" className="button danger" disabled={props.busy} onClick={props.onConfirm}>
          {props.busy ? "Salvando…" : props.confirmLabel}
        </button>
      </div>
    </div>
  );
}
