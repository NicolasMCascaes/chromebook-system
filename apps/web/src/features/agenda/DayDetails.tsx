import { formatDateLong, formatTimeRange, plural } from "../../lib/format";
import { useAvailability } from "../../api/hooks";
import { errorMessage } from "../../api/client";
import { StatusMessage } from "../../components/StatusMessage";
import { blockLabel } from "./schedule-model";
import type { ReservationPrefill } from "./ReservationDialog";

interface DayDetailsProps {
  date: string;
  visibleCartIds: string[];
  onSchedule: (prefill: ReservationPrefill) => void;
  onOpenReservation: (reservationId: string) => void;
  headingLevel?: "h2" | "h3";
}

export function DayDetails({ date, visibleCartIds, onSchedule, onOpenReservation, headingLevel = "h2" }: DayDetailsProps) {
  const availability = useAvailability(date);
  const Heading = headingLevel;
  const data = availability.data?.date === date ? availability.data : undefined;
  const carts = data?.carts.filter((cart) => visibleCartIds.includes(cart.cartId)) ?? [];

  return (
    <section className="day-details" aria-live="polite">
      <header className="day-details-header">
        <Heading>{formatDateLong(date)}</Heading>
        {data?.bookable && (
          <button type="button" className="button primary small" onClick={() => onSchedule({ date })}>
            Agendar neste dia
          </button>
        )}
      </header>

      {availability.isPending && !data && <StatusMessage kind="loading">Carregando disponibilidade…</StatusMessage>}
      {availability.isError && <StatusMessage kind="error">{errorMessage(availability.error)}</StatusMessage>}
      {data && !data.bookable && data.reason && <StatusMessage kind="info">{data.reason}</StatusMessage>}
      {data && carts.length === 0 && (
        <StatusMessage kind="empty">Nenhum carrinho selecionado no filtro.</StatusMessage>
      )}

      <ul className="day-carts">
        {carts.map((cart) => (
          <li key={cart.cartId} className="day-cart" style={{ "--cart-color": cart.cartColor } as React.CSSProperties}>
            <div className="day-cart-header">
              <strong>{cart.cartName}</strong>
              <span className="muted">{plural(cart.availableEquipment, "Chromebook disponível", "Chromebooks disponíveis")}</span>
            </div>

            {cart.block && <p className="day-cart-block">{blockLabel(cart.block)}</p>}

            {cart.busy.length > 0 && (
              <ul className="day-reservations" aria-label={`Reservas do ${cart.cartName}`}>
                {cart.busy.map((reservation) => (
                  <li key={reservation.reservationId}>
                    <button type="button" className="day-reservation" onClick={() => onOpenReservation(reservation.reservationId)}>
                      <span className="day-reservation-time">{formatTimeRange(reservation.start, reservation.end)}</span>
                      <span>
                        {reservation.teacherName}, {reservation.className}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!cart.block && data?.bookable !== false && (
              <div className="day-free">
                {cart.free.length === 0 ? (
                  <span className="muted">Sem horários livres neste dia.</span>
                ) : (
                  <>
                    <span className="muted">Livre:</span>
                    {cart.free.map((interval) => (
                      <button
                        key={interval.start}
                        type="button"
                        className="free-slot"
                        aria-label={`Agendar ${cart.cartName} das ${interval.start} às ${interval.end}`}
                        onClick={() =>
                          onSchedule({ date, cartId: cart.cartId, startTime: interval.start, endTime: interval.end })
                        }
                      >
                        {formatTimeRange(interval.start, interval.end)}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
