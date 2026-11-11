import {
  CALENDAR_BLOCK_KIND_LABELS,
  computeFreeIntervals,
  isWeekend,
  minutesToTime,
  normalizeTime,
  schoolNow,
  timeToMinutes,
  type AvailabilityDto,
  type CalendarDto,
} from "@chromebook/shared";
import type { AppContainer } from "@/lib/container";
import { getSchoolHours, listClassSchedules } from "@/modules/settings/repository";
import { listBlocksInRange, toCalendarBlockDto } from "@/modules/blocks/repository";
import { listCarts } from "@/modules/carts/service";
import { listConfirmedReservations } from "@/modules/reservations/repository";
import { toReservationDto, type ReservationAudience } from "@/modules/reservations/mapper";

export async function getCalendar(
  container: AppContainer,
  audience: ReservationAudience,
  query: { from: string; to: string; cartId?: string },
): Promise<CalendarDto> {
  const now = schoolNow(container.clock.now());
  const [hours, schedules, carts, reservations, blocks] = await Promise.all([
    getSchoolHours(container.db),
    listClassSchedules(container.db),
    listCarts(container, { onlyActive: true }),
    listConfirmedReservations(container.db, query),
    listBlocksInRange(container.db, query),
  ]);
  return {
    today: now.date,
    nowTime: now.time,
    hours,
    schedules,
    carts,
    reservations: reservations.map((view) => toReservationDto(view, audience, now)),
    blocks: blocks.map(toCalendarBlockDto),
  };
}

export async function getAvailability(
  container: AppContainer,
  query: { date: string; cartId?: string },
): Promise<AvailabilityDto> {
  const now = schoolNow(container.clock.now());
  const range = { from: query.date, to: query.date, cartId: query.cartId };
  const [hours, allCarts, reservations, blocks] = await Promise.all([
    getSchoolHours(container.db),
    listCarts(container, { onlyActive: true }),
    listConfirmedReservations(container.db, range),
    listBlocksInRange(container.db, range),
  ]);

  const carts = query.cartId ? allCarts.filter((cart) => cart.id === query.cartId) : allCarts;
  const globalBlock = blocks.find((block) => block.cartId === null);

  let dayReason: string | null = null;
  if (isWeekend(query.date)) dayReason = "Não há reservas aos sábados e domingos.";
  else if (query.date < now.date) dayReason = "Esta data já passou.";
  else if (query.date === now.date && now.minutes >= timeToMinutes(hours.closingTime)) {
    dayReason = "O horário de funcionamento de hoje já foi encerrado.";
  } else if (globalBlock) {
    dayReason = `${CALENDAR_BLOCK_KIND_LABELS[globalBlock.kind]}: ${globalBlock.reason}`;
  }

  const notBefore =
    query.date === now.date ? minutesToTime(Math.ceil(now.minutes / hours.slotMinutes) * hours.slotMinutes) : undefined;

  const cartAvailability = carts.map((cart) => {
    const block = blocks.find((entry) => entry.cartId === null || entry.cartId === cart.id);
    const busy = reservations
      .filter((reservation) => reservation.cartId === cart.id)
      .map((reservation) => ({
        start: normalizeTime(reservation.startTime),
        end: normalizeTime(reservation.endTime),
        reservationId: reservation.id,
        teacherName: reservation.teacherName,
        className: reservation.className,
      }));
    const free = dayReason || block ? [] : computeFreeIntervals(hours.openingTime, hours.closingTime, busy, notBefore);
    return {
      cartId: cart.id,
      cartName: cart.name,
      cartColor: cart.color,
      availableEquipment: cart.equipment.available,
      block: block ? { kind: block.kind, reason: block.reason } : null,
      busy,
      free,
    };
  });

  return {
    date: query.date,
    bookable: dayReason === null && cartAvailability.some((cart) => cart.free.length > 0),
    reason: dayReason,
    hours,
    carts: cartAvailability,
  };
}
