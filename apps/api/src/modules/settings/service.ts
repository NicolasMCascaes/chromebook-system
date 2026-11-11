import { randomBytes } from "node:crypto";
import type { z } from "zod";
import {
  schoolNow,
  timeToMinutes,
  type SchoolHoursDto,
  type SchoolSettingsDto,
  type SchoolSettingsMutationDto,
  type schoolSettingsInputSchema,
} from "@chromebook/shared";
import type { AppContainer } from "@/lib/container";
import { listUpcomingConfirmedReservations, type ReservationView } from "@/modules/reservations/repository";
import { toAdminReservationDto } from "@/modules/reservations/mapper";
import { startsInFuture } from "@/modules/reservations/rules";
import {
  getNotificationEmails,
  getPublicAccessCode,
  getSchoolHours,
  listClassSchedules,
  lockSchoolSettings,
  replaceClassSchedules,
  updatePublicAccessCode,
  updateSchoolSettings,
} from "./repository";

export async function getSchoolSettings(container: AppContainer): Promise<SchoolSettingsDto> {
  const [hours, notificationEmails, schedules, publicAccessCode] = await Promise.all([
    getSchoolHours(container.db),
    getNotificationEmails(container.db),
    listClassSchedules(container.db),
    getPublicAccessCode(container.db),
  ]);
  return { ...hours, notificationEmails, schedules, publicAccessCode };
}

function fitsSchoolHours(view: ReservationView, hours: SchoolHoursDto): boolean {
  const start = timeToMinutes(view.startTime);
  const end = timeToMinutes(view.endTime);
  return (
    start >= timeToMinutes(hours.openingTime) &&
    end <= timeToMinutes(hours.closingTime) &&
    start % hours.slotMinutes === 0 &&
    end % hours.slotMinutes === 0
  );
}

export async function saveSchoolSettings(
  container: AppContainer,
  input: z.output<typeof schoolSettingsInputSchema>,
): Promise<SchoolSettingsMutationDto> {
  const { schedules, ...values } = input;
  await container.db.transaction(async (tx) => {
    await lockSchoolSettings(tx);
    await updateSchoolSettings(tx, values);
    await replaceClassSchedules(tx, schedules);
  });

  const settings = await getSchoolSettings(container);
  const now = schoolNow(container.clock.now());
  const upcoming = await listUpcomingConfirmedReservations(container.db, { from: now.date });
  const affectedReservations = upcoming
    .filter((view) => startsInFuture(view.reservationDate, view.startTime, now) && !fitsSchoolHours(view, settings))
    .map((view) => toAdminReservationDto(view, now));
  return { settings, affectedReservations };
}

export async function regeneratePublicAccessCode(container: AppContainer): Promise<SchoolSettingsDto> {
  await updatePublicAccessCode(container.db, randomBytes(24).toString("base64url"));
  return getSchoolSettings(container);
}
