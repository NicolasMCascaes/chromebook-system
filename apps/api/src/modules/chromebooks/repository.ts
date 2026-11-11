import { and, asc, eq, getTableColumns, type SQL } from "drizzle-orm";
import type { ChromebookDto, ChromebookStatus } from "@chromebook/shared";
import type { Database } from "@/lib/db/client";
import { carts, chromebooks, type ChromebookRow } from "@/lib/db/schema";

type ChromebookWithCartRow = ChromebookRow & { cartName: string };

function selectChromebooksWithCart(db: Database) {
  return db
    .select({ ...getTableColumns(chromebooks), cartName: carts.name })
    .from(chromebooks)
    .innerJoin(carts, eq(carts.id, chromebooks.cartId))
    .$dynamic();
}

export async function listChromebooks(
  db: Database,
  filters: { cartId?: string; status?: ChromebookStatus },
): Promise<ChromebookWithCartRow[]> {
  const conditions: SQL[] = [];
  if (filters.cartId) conditions.push(eq(chromebooks.cartId, filters.cartId));
  if (filters.status) conditions.push(eq(chromebooks.status, filters.status));
  return selectChromebooksWithCart(db)
    .where(and(...conditions))
    .orderBy(asc(carts.displayOrder), asc(chromebooks.assetTag));
}

export async function findChromebook(db: Database, id: string): Promise<ChromebookWithCartRow | undefined> {
  const [row] = await selectChromebooksWithCart(db).where(eq(chromebooks.id, id));
  return row;
}

export async function insertChromebook(db: Database, values: typeof chromebooks.$inferInsert): Promise<ChromebookRow> {
  const [row] = await db.insert(chromebooks).values(values).returning();
  return row!;
}

export async function updateChromebook(
  db: Database,
  id: string,
  patch: Partial<typeof chromebooks.$inferInsert>,
): Promise<ChromebookRow | undefined> {
  const [row] = await db.update(chromebooks).set(patch).where(eq(chromebooks.id, id)).returning();
  return row;
}

export function toChromebookDto(row: ChromebookWithCartRow): ChromebookDto {
  return {
    id: row.id,
    assetTag: row.assetTag,
    name: row.name,
    brandModel: row.brandModel,
    cartId: row.cartId,
    cartName: row.cartName,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
