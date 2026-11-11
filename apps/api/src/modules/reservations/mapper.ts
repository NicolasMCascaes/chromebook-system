import { isActiveReservationStatus, normalizeTime, type AdminReservationDto, type ReservationDto, type SchoolNow } from "@chromebook/shared";
import type { ReservationView } from "./repository";
import { startsInFuture } from "./rules";

export type ReservationAudience = "public" | "owner" | "admin";

export function canCancelReservation(view: ReservationView, audience: ReservationAudience, now: SchoolNow): boolean {
  if (!isActiveReservationStatus(view.status)) return false;
  if (audience === "admin") return true;
  return startsInFuture(view.reservationDate, view.startTime, now);
}

export function toReservationDto(view: ReservationView, audience: ReservationAudience, now: SchoolNow): ReservationDto {
  return {
    id: view.id,
    cartId: view.cartId,
    cartName: view.cartName,
    cartColor: view.cartColor,
    teacherName: view.teacherName,
    className: view.className,
    date: view.reservationDate,
    startTime: normalizeTime(view.startTime),
    endTime: normalizeTime(view.endTime),
    status: view.status,
    notes: audience === "public" ? null : view.notes,
    canCancel: canCancelReservation(view, audience, now),
    createdAt: view.createdAt.toISOString(),
  };
}

export function toAdminReservationDto(view: ReservationView, now: SchoolNow): AdminReservationDto {
  return {
    ...toReservationDto(view, "admin", now),
    cancelReason: view.cancelReason,
    cancelledAt: view.cancelledAt?.toISOString() ?? null,
    decisionReason: view.decisionReason,
    decidedAt: view.decidedAt?.toISOString() ?? null,
    updatedAt: view.updatedAt.toISOString(),
  };
}
