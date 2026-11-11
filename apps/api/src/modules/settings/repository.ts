import { asc, eq } from "drizzle-orm";
import { normalizeTime, type ClassScheduleDto, type SchoolHoursDto } from "@chromebook/shared";
import type { DbExecutor } from "@/lib/db/client";
import { classPeriods, classSchedules, schoolSettings } from "@/lib/db/schema";

export async function getSchoolHours(db: DbExecutor, options: { lockForShare?: boolean } = {}): Promise<SchoolHoursDto> {
  const query = db.select().from(schoolSettings).where(eq(schoolSettings.id, 1)).$dynamic();
  if (options.lockForShare) query.for("share");
  const [row] = await query;
  if (!row) throw new Error("School settings row is missing; run the database migrations.");
  return {
    openingTime: normalizeTime(row.openingTime),
    closingTime: normalizeTime(row.closingTime),
    slotMinutes: row.slotMinutes,
  };
}

export async function listClassSchedules(db: DbExecutor): Promise<ClassScheduleDto[]> {
  const [schedules, periods] = await Promise.all([
    db.select().from(classSchedules).orderBy(asc(classSchedules.displayOrder), asc(classSchedules.name)),
    db.select().from(classPeriods).orderBy(asc(classPeriods.startTime)),
  ]);
  return schedules.map((schedule) => ({
    id: schedule.id,
    name: schedule.name,
    classNames: schedule.classNames,
    periods: periods
      .filter((period) => period.scheduleId === schedule.id)
      .map((period) => ({
        id: period.id,
        name: period.name,
        startTime: normalizeTime(period.startTime),
        endTime: normalizeTime(period.endTime),
      })),
  }));
}

export async function getNotificationEmails(db: DbExecutor): Promise<string[]> {
  const [row] = await db
    .select({ notificationEmails: schoolSettings.notificationEmails })
    .from(schoolSettings)
    .where(eq(schoolSettings.id, 1));
  return row?.notificationEmails ?? [];
}

export async function getPublicAccessCode(db: DbExecutor): Promise<string> {
  const [row] = await db
    .select({ publicAccessCode: schoolSettings.publicAccessCode })
    .from(schoolSettings)
    .where(eq(schoolSettings.id, 1));
  if (!row) throw new Error("School settings row is missing; run the database migrations.");
  return row.publicAccessCode;
}

export async function updatePublicAccessCode(db: DbExecutor, publicAccessCode: string): Promise<void> {
  await db.update(schoolSettings).set({ publicAccessCode }).where(eq(schoolSettings.id, 1));
}

export async function lockSchoolSettings(db: DbExecutor): Promise<void> {
  await db.select({ id: schoolSettings.id }).from(schoolSettings).where(eq(schoolSettings.id, 1)).for("update");
}

export async function updateSchoolSettings(
  db: DbExecutor,
  values: { openingTime: string; closingTime: string; slotMinutes: number; notificationEmails: string[] },
): Promise<void> {
  await db.update(schoolSettings).set(values).where(eq(schoolSettings.id, 1));
}

export async function replaceClassSchedules(
  db: DbExecutor,
  schedules: { name: string; classNames: string[]; periods: { name: string; startTime: string; endTime: string }[] }[],
): Promise<void> {
  await db.delete(classPeriods);
  await db.delete(classSchedules);
  for (const [index, schedule] of schedules.entries()) {
    const [row] = await db
      .insert(classSchedules)
      .values({ name: schedule.name, classNames: schedule.classNames, displayOrder: index + 1 })
      .returning({ id: classSchedules.id });
    if (schedule.periods.length > 0) {
      await db.insert(classPeriods).values(schedule.periods.map((period) => ({ ...period, scheduleId: row!.id })));
    }
  }
}
