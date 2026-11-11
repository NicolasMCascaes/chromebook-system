import { SCHOOL_TIME_ZONE } from "./enums";

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface TimeInterval {
  start: string;
  end: string;
}

function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  if (!ISO_DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function isValidIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

function toUtcDate(value: string): Date {
  const parts = parseIsoDate(value);
  if (!parts) throw new RangeError(`Invalid ISO date: ${value}`);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function weekdayOf(date: string): number {
  return toUtcDate(date).getUTCDay();
}

export function isWeekend(date: string): boolean {
  const weekday = weekdayOf(date);
  return weekday === 0 || weekday === 6;
}

export function addDays(date: string, days: number): string {
  const base = toUtcDate(date);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000);
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function normalizeTime(time: string): string {
  return time.slice(0, 5);
}

export interface SchoolNow {
  date: string;
  time: string;
  minutes: number;
}

const schoolClockFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHOOL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function schoolNow(instant: Date): SchoolNow {
  const parts = Object.fromEntries(schoolClockFormatter.formatToParts(instant).map((part) => [part.type, part.value]));
  const time = `${parts.hour}:${parts.minute}`;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time, minutes: timeToMinutes(time) };
}

export function computeFreeIntervals(
  opening: string,
  closing: string,
  busy: TimeInterval[],
  notBefore?: string,
): TimeInterval[] {
  const openingMinutes = Math.max(timeToMinutes(opening), notBefore ? timeToMinutes(notBefore) : 0);
  const closingMinutes = timeToMinutes(closing);
  const sorted = busy
    .map((interval) => ({ start: timeToMinutes(interval.start), end: timeToMinutes(interval.end) }))
    .sort((a, b) => a.start - b.start);

  const free: TimeInterval[] = [];
  let cursor = openingMinutes;
  for (const interval of sorted) {
    if (interval.start > cursor && cursor < closingMinutes) {
      free.push({ start: minutesToTime(cursor), end: minutesToTime(Math.min(interval.start, closingMinutes)) });
    }
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < closingMinutes) free.push({ start: minutesToTime(cursor), end: minutesToTime(closingMinutes) });
  return free;
}
