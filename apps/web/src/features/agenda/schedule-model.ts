import {
  addDays,
  CALENDAR_BLOCK_KIND_LABELS,
  computeFreeIntervals,
  isWeekend,
  minutesToTime,
  timeToMinutes,
  type CalendarBlockDto,
  type CalendarDto,
  type ClassPeriodDto,
  type ClassScheduleDto,
  type ReservationDto,
  type SchoolHoursDto,
  type SchoolNow,
} from "@chromebook/shared";

export type DayStatusKind = "blocked" | "closed" | "empty" | "available" | "full";

export interface DayStatus {
  kind: DayStatusKind;
  label: string;
  reservationCount: number;
  blockReason?: string;
}

export function blockLabel(block: Pick<CalendarBlockDto, "kind" | "reason">): string {
  return `${CALENDAR_BLOCK_KIND_LABELS[block.kind]}: ${block.reason}`;
}

export function blocksOnDate(blocks: CalendarBlockDto[], date: string): CalendarBlockDto[] {
  return blocks.filter((block) => block.startDate <= date && block.endDate >= date);
}

export function earliestBookableTime(date: string, now: SchoolNow, hours: SchoolHoursDto): string | undefined {
  if (date !== now.date) return undefined;
  return minutesToTime(Math.ceil(now.minutes / hours.slotMinutes) * hours.slotMinutes);
}

export function computeDayStatus(
  date: string,
  calendar: Pick<CalendarDto, "hours" | "blocks" | "reservations">,
  cartIds: string[],
  now: SchoolNow,
): DayStatus {
  const dayBlocks = blocksOnDate(calendar.blocks, date);
  const reservations = calendar.reservations.filter(
    (reservation) => reservation.date === date && cartIds.includes(reservation.cartId),
  );
  const reservationCount = reservations.length;

  const globalBlock = dayBlocks.find((block) => block.cartId === null);
  if (globalBlock) {
    return { kind: "blocked", label: "Bloqueado", reservationCount, blockReason: blockLabel(globalBlock) };
  }

  const openCartIds = cartIds.filter((cartId) => !dayBlocks.some((block) => block.cartId === cartId));
  if (cartIds.length > 0 && openCartIds.length === 0) {
    return { kind: "blocked", label: "Bloqueado", reservationCount, blockReason: blockLabel(dayBlocks[0]!) };
  }

  const pastClosing = date === now.date && now.minutes >= timeToMinutes(calendar.hours.closingTime);
  if (isWeekend(date) || date < now.date || pastClosing) {
    return { kind: "closed", label: "", reservationCount };
  }

  if (reservationCount === 0) return { kind: "empty", label: "Sem reservas", reservationCount };

  const notBefore = earliestBookableTime(date, now, calendar.hours);
  const hasFreeTime = openCartIds.some((cartId) => {
    const busy = reservations
      .filter((reservation) => reservation.cartId === cartId)
      .map((reservation) => ({ start: reservation.startTime, end: reservation.endTime }));
    return computeFreeIntervals(calendar.hours.openingTime, calendar.hours.closingTime, busy, notBefore).length > 0;
  });

  return hasFreeTime
    ? { kind: "available", label: "Horários livres", reservationCount }
    : { kind: "full", label: "Sem horários livres", reservationCount };
}

export interface PeriodSelection {
  fromPeriodId: string;
  toPeriodId: string;
}

export function periodRangeTimes(
  periods: ClassPeriodDto[],
  selection: PeriodSelection,
): { startTime: string; endTime: string } | null {
  const fromIndex = periods.findIndex((period) => period.id === selection.fromPeriodId);
  const toIndex = periods.findIndex((period) => period.id === selection.toPeriodId);
  if (fromIndex < 0 || toIndex < 0 || toIndex < fromIndex) return null;
  return { startTime: periods[fromIndex]!.startTime, endTime: periods[toIndex]!.endTime };
}

export function matchPeriods(periods: ClassPeriodDto[], startTime: string, endTime: string): PeriodSelection | null {
  const from = periods.find((period) => period.startTime === startTime);
  const to = periods.find((period) => period.endTime === endTime);
  if (!from || !to || to.endTime <= from.startTime) return null;
  return { fromPeriodId: from.id, toPeriodId: to.id };
}

export function describePeriodRange(periods: ClassPeriodDto[], startTime: string, endTime: string): string | null {
  const selection = matchPeriods(periods, startTime, endTime);
  if (!selection) return null;
  const from = periods.find((period) => period.id === selection.fromPeriodId)!;
  const to = periods.find((period) => period.id === selection.toPeriodId)!;
  return from.id === to.id ? from.name : `${from.name} até ${to.name}`;
}

export function describeWithSchedules(schedules: ClassScheduleDto[], startTime: string, endTime: string): string | null {
  const matches = schedules
    .map((schedule) => ({ schedule, label: describePeriodRange(schedule.periods, startTime, endTime) }))
    .filter((entry): entry is { schedule: ClassScheduleDto; label: string } => entry.label !== null);
  if (matches.length === 0) return null;
  if (schedules.length === 1 || matches.length === schedules.length) return matches[0]!.label;
  return matches.map((entry) => `${entry.label}, ${entry.schedule.name}`).join("; ");
}

export function findMatchingSchedule(
  schedules: ClassScheduleDto[],
  startTime: string,
  endTime: string,
): { schedule: ClassScheduleDto; selection: PeriodSelection } | null {
  for (const schedule of schedules) {
    const selection = matchPeriods(schedule.periods, startTime, endTime);
    if (selection) return { schedule, selection };
  }
  return null;
}

export function overlapsReservation(
  reservations: Pick<ReservationDto, "startTime" | "endTime">[],
  startTime: string,
  endTime: string,
): boolean {
  return reservations.some((reservation) => reservation.startTime < endTime && reservation.endTime > startTime);
}

export function nextSchoolDay(date: string, direction: 1 | -1): string {
  let candidate = addDays(date, direction);
  while (isWeekend(candidate)) candidate = addDays(candidate, direction);
  return candidate;
}

export function nearestSchoolDay(date: string): string {
  return isWeekend(date) ? nextSchoolDay(date, 1) : date;
}
