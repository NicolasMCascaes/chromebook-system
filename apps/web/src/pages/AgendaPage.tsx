import { useState } from "react";
import { useCalendarController } from "@fullcalendar/react";
import { schoolNow } from "@chromebook/shared";
import { useCalendar, type DateRange } from "../api/hooks";
import { errorMessage, isAccessDenied } from "../api/client";
import { StatusMessage } from "../components/StatusMessage";
import { useMediaQuery } from "../lib/useMediaQuery";
import { formatWeekday } from "../lib/format";
import { AgendaToolbar } from "../features/agenda/AgendaToolbar";
import { CartFilter, ScheduleLegend } from "../features/agenda/CartFilter";
import { DayDetails } from "../features/agenda/DayDetails";
import { ReservationDialog, type ReservationPrefill } from "../features/agenda/ReservationDialog";
import { ReservationDetailsDialog } from "../features/agenda/ReservationDetailsDialog";
import { ScheduleCalendar, type CalendarView } from "../features/agenda/ScheduleCalendar";
import { nearestSchoolDay, nextSchoolDay } from "../features/agenda/schedule-model";
import "../features/agenda/agenda.css";

export function AgendaPage() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const controller = useCalendarController();
  const [today] = useState(() => schoolNow(new Date()).date);
  const [view, setView] = useState<CalendarView>("dayGridMonth");
  const [range, setRange] = useState<DateRange | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => nearestSchoolDay(today));
  const [hiddenCartIds, setHiddenCartIds] = useState<string[]>([]);
  const [prefill, setPrefill] = useState<ReservationPrefill | null>(null);
  const [openReservationId, setOpenReservationId] = useState<string | null>(null);

  const mobileRange = { from: selectedDate, to: selectedDate };
  const calendar = useCalendar(isMobile ? mobileRange : range);
  const data = calendar.data;
  const carts = data?.carts ?? [];
  const visibleCartIds = carts.map((cart) => cart.id).filter((id) => !hiddenCartIds.includes(id));

  const setVisibleCartIds = (ids: string[]) =>
    setHiddenCartIds(carts.map((cart) => cart.id).filter((id) => !ids.includes(id)));

  const selectDate = (date: string) => setSelectedDate(date);

  const scheduleButton = (
    <button type="button" className="button primary" disabled={!data} onClick={() => setPrefill({ date: selectedDate })}>
      Agendar
    </button>
  );

  if (isAccessDenied(calendar.error)) {
    return (
      <section className="page agenda-page">
        <div className="card access-denied">
          <h1>Agenda de Chromebooks</h1>
          <p>Para ver a agenda e reservar um carrinho, abra o link enviado pelo TI da escola.</p>
          <p className="muted small-text">
            Se você já usou o link e esta mensagem apareceu, ele foi substituído. Peça o link atualizado ao TI.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="page agenda-page">
      <header className="page-header agenda-header">
        <h1>Agenda</h1>
        {scheduleButton}
      </header>

      {calendar.isError && !isAccessDenied(calendar.error) && <StatusMessage kind="error">{errorMessage(calendar.error)}</StatusMessage>}

      {isMobile ? (
        <div className="agenda-mobile">
          <div className="mobile-day-nav">
            <button
              type="button"
              className="icon-button bordered"
              aria-label="Dia anterior"
              onClick={() => selectDate(nextSchoolDay(selectedDate, -1))}
            >
              ‹
            </button>
            <label className="mobile-day-picker">
              <span>{formatWeekday(selectedDate)}</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => event.target.value && selectDate(nearestSchoolDay(event.target.value))}
              />
            </label>
            <button
              type="button"
              className="icon-button bordered"
              aria-label="Próximo dia"
              onClick={() => selectDate(nextSchoolDay(selectedDate, 1))}
            >
              ›
            </button>
            {selectedDate !== today && (
              <button type="button" className="button secondary small" onClick={() => selectDate(nearestSchoolDay(today))}>
                Hoje
              </button>
            )}
          </div>
          {carts.length > 1 && (
            <CartFilter carts={carts} visibleCartIds={visibleCartIds} onChange={setVisibleCartIds} compact />
          )}
          <div className="card">
            <DayDetails
              date={selectedDate}
              visibleCartIds={visibleCartIds}
              onSchedule={setPrefill}
              onOpenReservation={setOpenReservationId}
            />
          </div>
        </div>
      ) : (
        <div className="agenda-layout">
          <div className="card agenda-main">
            <AgendaToolbar controller={controller} view={view} onViewChange={setView} />
            {calendar.isPending && range !== null && <StatusMessage kind="loading">Carregando agenda…</StatusMessage>}
            <ScheduleCalendar
              controller={controller}
              initialView={view}
              initialDate={today}
              calendar={data}
              visibleCartIds={visibleCartIds}
              selectedDate={selectedDate}
              onRangeChange={setRange}
              onSelectDate={selectDate}
              onOpenReservation={setOpenReservationId}
            />
          </div>
          <aside className="agenda-sidebar">
            <div className="card">
              <DayDetails
                date={selectedDate}
                visibleCartIds={visibleCartIds}
                onSchedule={setPrefill}
                onOpenReservation={setOpenReservationId}
                headingLevel="h3"
              />
            </div>
            {carts.length > 0 && (
              <div className="card">
                <CartFilter carts={carts} visibleCartIds={visibleCartIds} onChange={setVisibleCartIds} />
              </div>
            )}
            <div className="card">
              <ScheduleLegend />
            </div>
          </aside>
        </div>
      )}

      {data && prefill && (
        <ReservationDialog
          open
          prefill={prefill}
          schedule={data}
          onClose={() => setPrefill(null)}
        />
      )}
      <ReservationDetailsDialog
        reservationId={openReservationId}
        schedules={data?.schedules ?? []}
        onClose={() => setOpenReservationId(null)}
      />
    </section>
  );
}
