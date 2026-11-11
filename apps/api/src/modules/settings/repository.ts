import { eq } from "drizzle-orm";
import { normalizeTime, type SchoolHoursDto } from "@chromebook/shared";
import type { DbExecutor } from "@/lib/db/client";
import { schoolSettings } from "@/lib/db/schema";

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
