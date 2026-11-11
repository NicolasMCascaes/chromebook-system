import {
  checkReservationSlot,
  checkSchoolHours,
  timeToMinutes,
  type ReservationRuleViolation,
  type SchoolHoursDto,
  type SchoolNow,
} from "@chromebook/shared";
import { AppError } from "@/lib/http/errors";

export interface RequestedSlot {
  date: string;
  startTime: string;
  endTime: string;
}

export function ruleViolation(code: string, message: string): AppError {
  return new AppError(422, code, message);
}

export function startsInFuture(date: string, startTime: string, now: SchoolNow): boolean {
  return date > now.date || (date === now.date && timeToMinutes(startTime) > now.minutes);
}

function throwIfViolated(violation: ReservationRuleViolation | null): void {
  if (violation) throw ruleViolation(violation.code, violation.message);
}

export function assertDateAndTimeRules(slot: RequestedSlot, now: SchoolNow): void {
  throwIfViolated(checkReservationSlot(slot, now));
}

export function assertWithinSchoolHours(slot: RequestedSlot, hours: SchoolHoursDto): void {
  throwIfViolated(checkSchoolHours(slot, hours));
}
