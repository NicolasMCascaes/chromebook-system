import { asc, eq } from "drizzle-orm";
import { normalizeTime, type ClassPeriodDto, type SchoolHoursDto } from "@chromebook/shared";
import type { DbExecutor } from "@/lib/db/client";
import { classPeriods, schoolSettings } from "@/lib/db/schema";

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

export async function listClassPeriods(db: DbExecutor): Promise<ClassPeriodDto[]> {
  const rows = await db.select().from(classPeriods).orderBy(asc(classPeriods.startTime));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    startTime: normalizeTime(row.startTime),
    endTime: normalizeTime(row.endTime),
  }));
}

export async function getNotificationEmails(db: DbExecutor): Promise<string[]> {
  const [row] = await db
    .select({ notificationEmails: schoolSettings.notificationEmails })
    .from(schoolSettings)
    .where(eq(schoolSettings.id, 1));
  return row?.notificationEmails ?? [];
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

export async function replaceClassPeriods(
  db: DbExecutor,
  periods: { name: string; startTime: string; endTime: string }[],
): Promise<void> {
  await db.delete(classPeriods);
  if (periods.length > 0) await db.insert(classPeriods).values(periods);
}
