import { useMemo } from "react";
import FullCalendar, {
  type CalendarController,
  type DateClickInfo,
  type DatesSetInfo,
  type DayCellInfo,
  type DayHeaderInfo,
  type DayLaneInfo,
  type EventClickInfo,
  type EventDisplayInfo,
  type EventInput,
} from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import ptBrLocale from "@fullcalendar/react/locales/pt-br";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import { addDays, schoolNow, type CalendarDto, type ReservationDto } from "@chromebook/shared";
import { blockLabel, computeDayStatus } from "./schedule-model";
import { cartStyle } from "./cart-style";
import type { DateRange } from "../../api/hooks";
import { useMyReservationIds } from "../../lib/my-reservations";

export type CalendarView = "dayGridMonth" | "timeGridWeek" | "timeGridDay";

interface ScheduleCalendarProps {
  controller: CalendarController;
  initialView: CalendarView;
  initialDate: string;
  calendar: CalendarDto | undefined;
  visibleCartIds: string[];
  selectedDate: string;
  onRangeChange: (range: DateRange) => void;
  onSelectDate: (date: string) => void;
  onOpenReservation: (reservationId: string) => void;
}

type EventKind =
  | { type: "reservation"; reservation: ReservationDto; isMine: boolean }
  | { type: "block"; label: string; color: string };

const TIME_FORMAT = { hour: "2-digit", minute: "2-digit", hour12: false } as const;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function floatingNow(): string {
  const now = schoolNow(new Date());
  return `${now.date}T${now.time}:00`;
}

function buildEvents(
  calendar: CalendarDto | undefined,
  visibleCartIds: string[],
  myReservations: Record<string, string>,
): EventInput[] {
  if (!calendar) return [];
  const cartsById = new Map(calendar.carts.map((cart) => [cart.id, cart]));

  const reservations: EventInput[] = calendar.reservations
    .filter((reservation) => visibleCartIds.includes(reservation.cartId))
    .map((reservation) => ({
      id: reservation.id,
      title: `${reservation.teacherName}, ${reservation.className}`,
      start: `${reservation.date}T${reservation.startTime}:00`,
      end: `${reservation.date}T${reservation.endTime}:00`,
      classNames: ["schedule-event"],
      extendedProps: {
        kind: { type: "reservation", reservation, isMine: reservation.id in myReservations } satisfies EventKind,
      },
    }));

  const blocks: EventInput[] = calendar.blocks.flatMap((block): EventInput[] => {
    const cart = block.cartId === null ? null : cartsById.get(block.cartId);
    if (block.cartId !== null && (!cart || !visibleCartIds.includes(block.cartId))) return [];
    const label = cart ? `${cart.name}: ${blockLabel(block)}` : blockLabel(block);
    return [
      {
        id: `block-${block.id}`,
        title: label,
        start: block.startDate,
        end: addDays(block.endDate, 1),
        allDay: true,
        classNames: ["schedule-block"],
        extendedProps: { kind: { type: "block", label, color: cart?.color ?? "#9aa5b1" } satisfies EventKind },
      },
    ];
  });

  return [...blocks, ...reservations];
}

function EventContent({ info }: { info: EventDisplayInfo }) {
  const kind = info.event.extendedProps.kind as EventKind | undefined;
  if (!kind) return null;
  if (kind.type === "block") {
    return (
      <span className="event-chip is-blocked" style={cartStyle(kind.color)} title={kind.label}>
        <span className="event-line">{kind.label}</span>
      </span>
    );
  }
  const reservation = kind.reservation;
  const pending = reservation.status === "PENDING";
  const label = `${reservation.startTime} às ${reservation.endTime}, ${reservation.teacherName}, ${reservation.className}, ${reservation.cartName}${pending ? ", aguardando aprovação" : ""}`;
  const chipClass = ["event-chip", kind.isMine ? "is-own" : "", pending ? "is-pending" : ""].filter(Boolean).join(" ");
  return (
    <span className={chipClass} style={cartStyle(reservation.cartColor)} title={label}>
      <span className="event-line">
        <span className="event-time">
          {reservation.startTime}–{reservation.endTime}
        </span>{" "}
        {reservation.cartName}
      </span>
      <span className="event-line">
        {reservation.teacherName}
        {kind.isMine && <span className="event-own-tag"> (sua)</span>}
      </span>
      <span className="event-line event-meta">{reservation.className}</span>
      {pending && <span className="event-line event-pending">Aguardando aprovação</span>}
    </span>
  );
}

export function ScheduleCalendar({
  controller,
  initialView,
  initialDate,
  calendar,
  visibleCartIds,
  selectedDate,
  onRangeChange,
  onSelectDate,
  onOpenReservation,
}: ScheduleCalendarProps) {
  const myReservations = useMyReservationIds();
  const events = useMemo(
    () => buildEvents(calendar, visibleCartIds, myReservations),
    [calendar, visibleCartIds, myReservations],
  );
  const hours = calendar?.hours;

  const statusFor = (date: string) => {
    if (!calendar) return null;
    return computeDayStatus(date, calendar, visibleCartIds, schoolNow(new Date()));
  };

  const dayCellTop = (info: DayCellInfo) => {
    const date = isoDate(info.date);
    const status = info.isOther ? null : statusFor(date);
    return (
      <span className="day-top">
        {status?.label ? <span className={`day-status is-${status.kind}`}>{status.label}</span> : <span />}
        <span className={info.isToday ? "day-number is-today" : "day-number"} aria-label={info.text}>
          {info.dayNumberText}
        </span>
      </span>
    );
  };

  const dayCellClass = (info: DayCellInfo) => {
    const date = isoDate(info.date);
    const status = statusFor(date);
    return [status ? `day-cell-${status.kind}` : "", date === selectedDate ? "is-selected" : ""].filter(Boolean).join(" ");
  };

  const dayLaneClass = (info: DayLaneInfo) => {
    const status = statusFor(isoDate(info.date));
    return status ? `day-cell-${status.kind}` : "";
  };

  const dayHeaderContent = (info: DayHeaderInfo) => {
    if (info.view.type === "dayGridMonth") return <span>{info.text}</span>;
    const date = isoDate(info.date);
    const status = statusFor(date);
    return (
      <span className="week-header">
        <span className={info.isToday ? "week-header-date is-today" : "week-header-date"}>{info.text}</span>
        {status?.label && <span className={`day-status is-${status.kind}`}>{status.label}</span>}
      </span>
    );
  };

  return (
    <div className="schedule-calendar">
      <FullCalendar
        controller={controller}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, classicThemePlugin]}
        locale={ptBrLocale}
        timeZone="UTC"
        now={floatingNow}
        initialView={initialView}
        initialDate={initialDate}
        headerToolbar={false}
        weekends={false}
        firstDay={1}
        height="auto"
        fixedWeekCount={false}
        dayMaxEvents={3}
        moreLinkClass="schedule-more-link"
        moreLinkClick={(info) => {
          onSelectDate(isoDate(info.date));
          return "popover";
        }}
        allDaySlot
        nowIndicator
        slotMinTime={hours ? `${hours.openingTime}:00` : "07:00:00"}
        slotMaxTime={hours ? `${hours.closingTime}:00` : "18:00:00"}
        slotDuration="00:10:00"
        slotHeaderInterval="00:30:00"
        slotHeaderFormat={TIME_FORMAT}
        eventTimeFormat={TIME_FORMAT}
        dayHeaderFormat={{ weekday: "short", day: "2-digit", month: "2-digit" }}
        views={{ dayGridMonth: { dayHeaderFormat: { weekday: "long" } } }}
        events={events}
        eventContent={(info: EventDisplayInfo) => <EventContent info={info} />}
        dayCellTopContent={dayCellTop}
        dayCellClass={dayCellClass}
        dayLaneClass={dayLaneClass}
        dayHeaderContent={dayHeaderContent}
        datesSet={(info: DatesSetInfo) =>
          onRangeChange({ from: info.startStr.slice(0, 10), to: addDays(info.endStr.slice(0, 10), -1) })
        }
        dateClick={(info: DateClickInfo) => onSelectDate(info.dateStr.slice(0, 10))}
        eventClick={(info: EventClickInfo) => {
          const kind = info.event.extendedProps.kind as EventKind | undefined;
          if (kind?.type === "reservation") onOpenReservation(kind.reservation.id);
        }}
      />
    </div>
  );
}
