import { isWeekend, timeToMinutes, type SchoolHoursDto, type SchoolNow } from "@chromebook/shared";
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

export function assertDateAndTimeRules(slot: RequestedSlot, now: SchoolNow): void {
  if (isWeekend(slot.date)) {
    throw ruleViolation("WEEKEND", "Não é possível reservar aos sábados e domingos.");
  }
  if (timeToMinutes(slot.endTime) <= timeToMinutes(slot.startTime)) {
    throw ruleViolation("INVALID_TIME_RANGE", "O horário de término deve ser posterior ao de início.");
  }
  if (slot.date < now.date || (slot.date === now.date && timeToMinutes(slot.startTime) < now.minutes)) {
    throw ruleViolation("PAST", "Não é possível reservar uma data ou horário que já passou.");
  }
}

export function assertWithinSchoolHours(slot: RequestedSlot, hours: SchoolHoursDto): void {
  const start = timeToMinutes(slot.startTime);
  const end = timeToMinutes(slot.endTime);
  if (start < timeToMinutes(hours.openingTime) || end > timeToMinutes(hours.closingTime)) {
    throw ruleViolation(
      "OUTSIDE_SCHOOL_HOURS",
      `As reservas devem estar dentro do horário de funcionamento (${hours.openingTime} às ${hours.closingTime}).`,
    );
  }
  if (start % hours.slotMinutes !== 0 || end % hours.slotMinutes !== 0) {
    throw ruleViolation(
      "SLOT_MISALIGNED",
      `Os horários devem ser múltiplos de ${hours.slotMinutes} minutos (ex.: 07:00, 07:${String(hours.slotMinutes).padStart(2, "0")}).`,
    );
  }
}
