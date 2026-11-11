import { asc, eq } from "drizzle-orm";
import type { UserDto } from "@chromebook/shared";
import type { Database } from "@/lib/db/client";
import { users, type UserRow } from "@/lib/db/schema";

export async function findUserById(db: Database, id: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}

export async function findUserByEmail(db: Database, email: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row;
}

export async function listUsers(db: Database): Promise<UserRow[]> {
  return db.select().from(users).orderBy(asc(users.name));
}

export async function insertUser(db: Database, values: typeof users.$inferInsert): Promise<UserRow> {
  const [row] = await db.insert(users).values(values).returning();
  return row!;
}

export async function updateUser(
  db: Database,
  id: string,
  patch: Partial<Pick<UserRow, "name" | "role" | "active">>,
): Promise<UserRow | undefined> {
  const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
  return row;
}

export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
