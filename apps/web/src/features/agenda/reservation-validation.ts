import {
  checkReservationDate,
  checkReservationSlot,
  checkSchoolHours,
  isValidIsoDate,
  reservationInputSchema,
  type AvailabilityDto,
  type CartAvailabilityDto,
  type SchoolHoursDto,
  type SchoolNow,
} from "@chromebook/shared";
import { zodFieldErrors, type FieldErrors } from "../../lib/zod-errors";
import { overlapsReservation } from "./schedule-model";

export interface ReservationDraft {
  teacherName: string;
  className: string;
  date: string;
  startTime: string;
  endTime: string;
  cartId: string;
  notes: string;
}

export interface ReservationValidationContext {
  now: SchoolNow;
  hours: SchoolHoursDto;
  availability?: AvailabilityDto;
  invalidPeriodRange?: boolean;
}

export interface CartSituation {
  text: string;
  unavailable: boolean;
}

const VALIDATION_CANCEL_TOKEN = "x".repeat(43);
export const INVALID_PERIOD_RANGE_MESSAGE = "A aula final deve ser igual ou posterior à aula inicial.";
export const CART_BUSY_MESSAGE = "Este carrinho não está livre nesse horário. Escolha outro carrinho ou horário.";

export function cartSituation(
  cart: CartAvailabilityDto | undefined,
  times: { startTime: string; endTime: string } | null,
): CartSituation | null {
  if (!cart) return null;
  if (cart.block) return { text: "Indisponível nesta data", unavailable: true };
  if (!times) return null;
  const busy = overlapsReservation(
    cart.busy.map((entry) => ({ startTime: entry.start, endTime: entry.end })),
    times.startTime,
    times.endTime,
  );
  return busy ? { text: "Ocupado neste horário", unavailable: true } : { text: "Livre neste horário", unavailable: false };
}

export function validateReservationForm(draft: ReservationDraft, context: ReservationValidationContext): FieldErrors {
  const parsed = reservationInputSchema.safeParse({ ...draft, cancelToken: VALIDATION_CANCEL_TOKEN });
  const errors: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
  const add = (field: string, message: string | null | undefined) => {
    if (message) errors[field] ??= message;
  };

  if (context.invalidPeriodRange) {
    delete errors.startTime;
    errors.endTime = INVALID_PERIOD_RANGE_MESSAGE;
  }
  if (!isValidIsoDate(draft.date)) return errors;

  const dateViolation = checkReservationDate(draft.date, context.now);
  add("date", dateViolation?.message);
  const availability = context.availability?.date === draft.date ? context.availability : undefined;
  if (availability && !availability.bookable) add("date", availability.reason ?? "Não há horários livres nesta data.");

  const times = draft.startTime && draft.endTime ? { startTime: draft.startTime, endTime: draft.endTime } : null;
  if (!times || errors.date) return errors;

  const slotViolation = checkReservationSlot({ date: draft.date, ...times }, context.now) ?? checkSchoolHours(times, context.hours);
  if (slotViolation) add(slotViolation.field, slotViolation.message);

  const cart = availability?.carts.find((entry) => entry.cartId === draft.cartId);
  if (cart?.block) add("cartId", `Este carrinho não está disponível nesta data (${cart.block.reason}).`);
  else if (!slotViolation && cartSituation(cart, times)?.unavailable) add("cartId", CART_BUSY_MESSAGE);

  return errors;
}
