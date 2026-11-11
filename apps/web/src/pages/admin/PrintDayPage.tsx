import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { schoolNow, type AdminReservationDto, type CartDto, type ClassScheduleDto } from "@chromebook/shared";
import { useAdminCarts, useAdminReservations, useAdminSettings } from "../../api/hooks";
import { errorMessage } from "../../api/client";
import { StatusMessage } from "../../components/StatusMessage";
import { describePeriodRange, describeWithSchedules, nearestSchoolDay, nextSchoolDay } from "../../features/agenda/schedule-model";
import { formatDateLong, formatTimeRange, plural } from "../../lib/format";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function periodLabel(schedules: ClassScheduleDto[], reservation: AdminReservationDto): string {
  const classSchedule = schedules.find((schedule) => schedule.classNames.includes(reservation.className));
  const label = classSchedule
    ? describePeriodRange(classSchedule.periods, reservation.startTime, reservation.endTime)
    : describeWithSchedules(schedules, reservation.startTime, reservation.endTime);
  return label ?? "—";
}

function groupByCart(carts: CartDto[], reservations: AdminReservationDto[]) {
  return carts
    .filter((cart) => cart.active || reservations.some((reservation) => reservation.cartId === cart.id))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, "pt-BR"))
    .map((cart) => ({
      cart,
      reservations: reservations
        .filter((reservation) => reservation.cartId === cart.id)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }));
}

export function PrintDayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("data");
  const date = requested && ISO_DATE.test(requested) ? requested : nearestSchoolDay(schoolNow(new Date()).date);
  const confirmed = useAdminReservations({ from: date, to: date, status: "CONFIRMED" });
  const pending = useAdminReservations({ from: date, to: date, status: "PENDING" });
  const carts = useAdminCarts();
  const settings = useAdminSettings();

  const groups = useMemo(
    () => (carts.data && confirmed.data ? groupByCart(carts.data, confirmed.data) : []),
    [carts.data, confirmed.data],
  );
  const schedules = settings.data?.schedules ?? [];
  const goTo = (target: string) => setSearchParams({ data: target });
  const error = confirmed.error ?? carts.error ?? settings.error;
  const loading = confirmed.isPending || carts.isPending || settings.isPending;
  const pendingCount = pending.data?.length ?? 0;

  return (
    <main className="print-page">
      <div className="print-controls no-print">
        <Link to="/admin/reservas" className="button secondary">
          Voltar ao painel
        </Link>
        <div className="print-date-nav">
          <button type="button" className="icon-button bordered" aria-label="Dia letivo anterior" onClick={() => goTo(nextSchoolDay(date, -1))}>
            ‹
          </button>
          <input type="date" aria-label="Data" value={date} onChange={(event) => event.target.value && goTo(event.target.value)} />
          <button type="button" className="icon-button bordered" aria-label="Próximo dia letivo" onClick={() => goTo(nextSchoolDay(date, 1))}>
            ›
          </button>
        </div>
        <button type="button" className="button primary" disabled={loading} onClick={() => window.print()}>
          Imprimir
        </button>
      </div>

      <header className="print-header">
        <h1>Agenda de Chromebooks</h1>
        <p>{formatDateLong(date)}</p>
      </header>

      {loading && <StatusMessage kind="loading">Carregando reservas…</StatusMessage>}
      {error && <StatusMessage kind="error">{errorMessage(error)}</StatusMessage>}
      {pendingCount > 0 && (
        <p className="print-note">
          {plural(pendingCount, "pedido ainda aguarda", "pedidos ainda aguardam")} aprovação neste dia e não{" "}
          {pendingCount === 1 ? "aparece" : "aparecem"} abaixo.
        </p>
      )}

      {!loading &&
        !error &&
        groups.map(({ cart, reservations }) => (
          <section key={cart.id} className="print-cart">
            <h2>
              <span className="swatch" style={{ backgroundColor: cart.color }} aria-hidden="true" /> {cart.name}
            </h2>
            {reservations.length === 0 ? (
              <p className="print-empty">Sem reservas aprovadas.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Horário</th>
                    <th>Aula</th>
                    <th>Turma</th>
                    <th>Professor</th>
                    <th>Observação</th>
                    <th className="print-check">Entregue</th>
                    <th className="print-check">Recolhido</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map((reservation) => (
                    <tr key={reservation.id}>
                      <td>{formatTimeRange(reservation.startTime, reservation.endTime)}</td>
                      <td>{periodLabel(schedules, reservation)}</td>
                      <td>{reservation.className}</td>
                      <td>{reservation.teacherName}</td>
                      <td className="print-notes">{reservation.notes ?? ""}</td>
                      <td className="print-check">
                        <span className="print-box" aria-hidden="true" />
                      </td>
                      <td className="print-check">
                        <span className="print-box" aria-hidden="true" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
    </main>
  );
}
