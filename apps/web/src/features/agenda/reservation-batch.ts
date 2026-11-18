import {
  findOverlappingSlots,
  MAX_RESERVATION_SLOTS,
  SLOT_OVERLAP_MESSAGE,
  type ApiErrorBody,
} from "@chromebook/shared";
import type { FieldErrors } from "../../lib/form-errors";

export const MAX_SLOTS = MAX_RESERVATION_SLOTS;

export interface SlotValues {
  key: string;
  className: string;
  date: string;
  fromPeriodId: string;
  toPeriodId: string;
  cartId: string;
  notes: string;
}

export interface SlotTimes {
  startTime: string;
  endTime: string;
}

export interface BatchErrors {
  teacherName?: string;
  slots: FieldErrors[];
}

export function canAddSlot(count: number): boolean {
  return count < MAX_SLOTS;
}

export function newSlot(key: string, previous: SlotValues | undefined, defaults: { date: string; cartId: string }): SlotValues {
  return {
    key,
    className: "",
    date: previous?.date ?? defaults.date,
    fromPeriodId: "",
    toPeriodId: "",
    cartId: defaults.cartId,
    notes: "",
  };
}

export function overlapErrors(slots: { cartId: string; date: string; times: SlotTimes | null }[]): Set<number> {
  const keyed = slots.map((slot) => ({
    cartId: slot.times ? slot.cartId : "",
    date: slot.date,
    startTime: slot.times?.startTime ?? "",
    endTime: slot.times?.endTime ?? "",
  }));
  return new Set(findOverlappingSlots(keyed));
}

export function withOverlapErrors(errors: FieldErrors[], overlapping: Set<number>): FieldErrors[] {
  return errors.map((slotErrors, index) =>
    overlapping.has(index) && !slotErrors.cartId ? { ...slotErrors, cartId: SLOT_OVERLAP_MESSAGE } : slotErrors,
  );
}

export function splitServerErrors(details: ApiErrorBody["details"], slotCount: number, singleSlot: boolean): BatchErrors {
  const result: BatchErrors = { slots: Array.from({ length: slotCount }, () => ({})) };
  for (const detail of details ?? []) {
    if (detail.path === "teacherName") {
      result.teacherName ??= detail.message;
      continue;
    }
    const match = /^slots\.(\d+)\.(\w+)$/.exec(detail.path);
    const index = match ? Number(match[1]) : singleSlot ? 0 : -1;
    const field = match ? match[2]! : detail.path;
    const target = result.slots[index];
    if (target && field) target[field] ??= detail.message;
  }
  return result;
}

export function slotWithError(errors: BatchErrors): number {
  return errors.slots.findIndex((slotErrors) => Object.keys(slotErrors).length > 0);
}
