import { asc, eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import type { CartDto } from "@chromebook/shared";
import type { Database } from "@/lib/db/client";
import { carts, chromebooks, type CartRow } from "@/lib/db/schema";

const countWhere = (condition: SQL) => sql<number>`count(${chromebooks.id}) filter (where ${condition})`.mapWith(Number);

const cartWithEquipmentColumns = {
  ...getTableColumns(carts),
  total: sql<number>`count(${chromebooks.id})`.mapWith(Number),
  available: countWhere(sql`${chromebooks.status} = 'AVAILABLE'`),
  maintenance: countWhere(sql`${chromebooks.status} = 'MAINTENANCE'`),
  inactive: countWhere(sql`${chromebooks.status} = 'INACTIVE'`),
};

type CartWithEquipmentRow = CartRow & { total: number; available: number; maintenance: number; inactive: number };

function selectCartsWithEquipment(db: Database) {
  return db
    .select(cartWithEquipmentColumns)
    .from(carts)
    .leftJoin(chromebooks, eq(chromebooks.cartId, carts.id))
    .groupBy(carts.id)
    .$dynamic();
}

export async function listCartsWithEquipment(db: Database, options: { onlyActive: boolean }): Promise<CartWithEquipmentRow[]> {
  const query = selectCartsWithEquipment(db);
  if (options.onlyActive) query.where(eq(carts.active, true));
  return query.orderBy(asc(carts.displayOrder), asc(carts.name));
}

export async function findCartWithEquipment(db: Database, id: string): Promise<CartWithEquipmentRow | undefined> {
  const [row] = await selectCartsWithEquipment(db).where(eq(carts.id, id));
  return row;
}

export async function insertCart(db: Database, values: typeof carts.$inferInsert): Promise<CartRow> {
  const [row] = await db.insert(carts).values(values).returning();
  return row!;
}

export async function updateCart(
  db: Database,
  id: string,
  patch: Partial<typeof carts.$inferInsert>,
): Promise<CartRow | undefined> {
  const [row] = await db.update(carts).set(patch).where(eq(carts.id, id)).returning();
  return row;
}

export function toCartDto(row: CartWithEquipmentRow): CartDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    displayOrder: row.displayOrder,
    active: row.active,
    equipment: {
      total: row.total,
      available: row.available,
      maintenance: row.maintenance,
      inactive: row.inactive,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
