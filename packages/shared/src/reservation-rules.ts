import type { SchoolHoursDto } from "./dto";
import { isWeekend, timeToMinutes, type SchoolNow } from "./time";

export interface ReservationSlot {
  date: string;
  startTime: string;
  endTime: string;
}

export type ReservationRuleField = "date" | "startTime" | "endTime";

export interface ReservationRuleViolation {
  code: string;
  message: string;
  field: ReservationRuleField;
}

export const PAST_RESERVATION_MESSAGE = "Não é possível reservar uma data ou horário que já passou.";

export function checkReservationDate(date: string, now: SchoolNow): ReservationRuleViolation | null {
  if (isWeekend(date)) {
    return { code: "WEEKEND", message: "Não é possível reservar aos sábados e domingos.", field: "date" };
  }
  if (date < now.date) return { code: "PAST", message: PAST_RESERVATION_MESSAGE, field: "date" };
  return null;
}

export function checkReservationSlot(slot: ReservationSlot, now: SchoolNow): ReservationRuleViolation | null {
  if (isWeekend(slot.date)) return checkReservationDate(slot.date, now);
  if (timeToMinutes(slot.endTime) <= timeToMinutes(slot.startTime)) {
    return { code: "INVALID_TIME_RANGE", message: "O horário de término deve ser posterior ao de início.", field: "endTime" };
  }
  if (slot.date < now.date) return checkReservationDate(slot.date, now);
  if (slot.date === now.date && timeToMinutes(slot.startTime) < now.minutes) {
    return { code: "PAST", message: PAST_RESERVATION_MESSAGE, field: "startTime" };
  }
  return null;
}

export function checkSchoolHours(slot: Omit<ReservationSlot, "date">, hours: SchoolHoursDto): ReservationRuleViolation | null {
  const start = timeToMinutes(slot.startTime);
  const end = timeToMinutes(slot.endTime);
  if (start < timeToMinutes(hours.openingTime) || end > timeToMinutes(hours.closingTime)) {
    return {
      code: "OUTSIDE_SCHOOL_HOURS",
      message: `As reservas devem estar dentro do horário de funcionamento (${hours.openingTime} às ${hours.closingTime}).`,
      field: start < timeToMinutes(hours.openingTime) ? "startTime" : "endTime",
    };
  }
  if (start % hours.slotMinutes !== 0 || end % hours.slotMinutes !== 0) {
    return {
      code: "SLOT_MISALIGNED",
      message: `Os horários devem ser múltiplos de ${hours.slotMinutes} minutos (ex.: 07:00, 07:${String(hours.slotMinutes).padStart(2, "0")}).`,
      field: start % hours.slotMinutes !== 0 ? "startTime" : "endTime",
    };
  }
  return null;
}
