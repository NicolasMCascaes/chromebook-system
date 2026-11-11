import type { AdminReservationDto } from "@chromebook/shared";
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
        {intro} {plural(reservations.length, "reserva confirmada foi encontrada", "reservas confirmadas foram encontradas")}.
        Nenhuma foi cancelada automaticamente: avise os professores ou cancele em Reservas.
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
