import { normalizeTime, type ReservationDto, type SchoolNow } from "@chromebook/shared";
import type { AuthUser } from "@/lib/auth/authenticate";
import type { ReservationView } from "./repository";
import { startsInFuture } from "./rules";

export function canCancelReservation(view: ReservationView, viewer: AuthUser, now: SchoolNow): boolean {
  if (view.status !== "CONFIRMED") return false;
  if (viewer.role === "ADMIN") return true;
  return view.userId === viewer.id && startsInFuture(view.reservationDate, view.startTime, now);
}

export function toReservationDto(view: ReservationView, viewer: AuthUser, now: SchoolNow): ReservationDto {
  const isOwner = view.userId === viewer.id;
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
    notes: isOwner || viewer.role === "ADMIN" ? view.notes : null,
    isOwner,
    canCancel: canCancelReservation(view, viewer, now),
    createdAt: view.createdAt.toISOString(),
  };
}
