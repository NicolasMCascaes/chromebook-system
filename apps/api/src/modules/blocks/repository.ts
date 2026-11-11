import { and, asc, eq, gte, isNull, lte, or, type SQL } from "drizzle-orm";
import type { CalendarBlockDto } from "@chromebook/shared";
import type { DbExecutor } from "@/lib/db/client";
import { calendarBlocks, type CalendarBlockRow } from "@/lib/db/schema";

function appliesToCart(cartId: string | undefined): SQL | undefined {
  if (!cartId) return undefined;
  return or(isNull(calendarBlocks.cartId), eq(calendarBlocks.cartId, cartId));
}

export async function listBlocksInRange(
  db: DbExecutor,
  range: { from: string; to: string; cartId?: string },
): Promise<CalendarBlockRow[]> {
  return db
    .select()
    .from(calendarBlocks)
    .where(and(lte(calendarBlocks.startDate, range.to), gte(calendarBlocks.endDate, range.from), appliesToCart(range.cartId)))
    .orderBy(asc(calendarBlocks.startDate), asc(calendarBlocks.createdAt));
}

export async function findBlockingEntry(db: DbExecutor, cartId: string, date: string): Promise<CalendarBlockRow | undefined> {
  const [row] = await listBlocksInRange(db, { from: date, to: date, cartId });
  return row;
}

export function toCalendarBlockDto(row: CalendarBlockRow): CalendarBlockDto {
  return {
    id: row.id,
    kind: row.kind,
    startDate: row.startDate,
    endDate: row.endDate,
    reason: row.reason,
    cartId: row.cartId,
  };
}
