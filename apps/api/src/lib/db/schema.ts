import { sql } from "drizzle-orm";
import { boolean, integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ChromebookStatus, UserRole } from "@chromebook/shared";

export const app = pgSchema("app");

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = app.table("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").$type<UserRole>().notNull().default("PROFESSOR"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const carts = app.table("carts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const chromebooks = app.table("chromebooks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  assetTag: text("asset_tag").notNull(),
  name: text("name").notNull(),
  brandModel: text("brand_model").notNull(),
  cartId: uuid("cart_id")
    .notNull()
    .references(() => carts.id, { onDelete: "restrict" }),
  status: text("status").$type<ChromebookStatus>().notNull().default("AVAILABLE"),
  ...timestamps,
});

export type UserRow = typeof users.$inferSelect;
export type CartRow = typeof carts.$inferSelect;
export type ChromebookRow = typeof chromebooks.$inferSelect;
