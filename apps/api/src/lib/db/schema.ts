import { sql } from "drizzle-orm";
import { boolean, date, integer, jsonb, pgSchema, smallint, text, time, timestamp, uuid } from "drizzle-orm/pg-core";
import type {
  CalendarBlockKind,
  ChromebookStatus,
  NotificationStatus,
  ReservationStatus,
  UserRole,
} from "@chromebook/shared";

export type NotificationType = "RESERVATION_CREATED" | "RESERVATION_REQUESTED";

export interface ReservationNotificationPayload {
  teacherName: string;
  className: string;
  cartName: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string | null;
  approvalToken?: string;
}

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

export const schoolSettings = app.table("school_settings", {
  id: smallint("id").primaryKey().default(1),
  openingTime: time("opening_time").notNull(),
  closingTime: time("closing_time").notNull(),
  slotMinutes: smallint("slot_minutes").notNull(),
  notificationEmails: text("notification_emails").array().notNull().default(sql`'{}'`),
  publicAccessCode: text("public_access_code").notNull(),
  ...timestamps,
});

export const calendarBlocks = app.table("calendar_blocks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  kind: text("kind").$type<CalendarBlockKind>().notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  reason: text("reason").notNull(),
  cartId: uuid("cart_id").references(() => carts.id, { onDelete: "restrict" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }),
  ...timestamps,
});

export const reservations = app.table("reservations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  cartId: uuid("cart_id")
    .notNull()
    .references(() => carts.id, { onDelete: "restrict" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
  teacherName: text("teacher_name").notNull(),
  className: text("class_name").notNull(),
  reservationDate: date("reservation_date", { mode: "string" }).notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  status: text("status").$type<ReservationStatus>().notNull().default("PENDING"),
  notes: text("notes"),
  idempotencyKey: uuid("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  cancelTokenHash: text("cancel_token_hash"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "restrict" }),
  cancelReason: text("cancel_reason"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "restrict" }),
  decisionReason: text("decision_reason"),
  approvalTokenHash: text("approval_token_hash"),
  ...timestamps,
});

export const classSchedules = app.table("class_schedules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  displayOrder: smallint("display_order").notNull().default(0),
  classNames: text("class_names").array().notNull().default(sql`'{}'`),
  ...timestamps,
});

export const classPeriods = app.table("class_periods", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  scheduleId: uuid("schedule_id")
    .notNull()
    .references(() => classSchedules.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  ...timestamps,
});

export const notificationOutbox = app.table("notification_outbox", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").$type<NotificationType>().notNull(),
  reservationId: uuid("reservation_id")
    .notNull()
    .references(() => reservations.id, { onDelete: "restrict" }),
  recipient: text("recipient").notNull(),
  payload: jsonb("payload").$type<ReservationNotificationPayload>().notNull(),
  status: text("status").$type<NotificationStatus>().notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  ...timestamps,
});

export type UserRow = typeof users.$inferSelect;
export type CartRow = typeof carts.$inferSelect;
export type ChromebookRow = typeof chromebooks.$inferSelect;
export type SchoolSettingsRow = typeof schoolSettings.$inferSelect;
export type CalendarBlockRow = typeof calendarBlocks.$inferSelect;
export type ReservationRow = typeof reservations.$inferSelect;
export type ClassPeriodRow = typeof classPeriods.$inferSelect;
export type NotificationRow = typeof notificationOutbox.$inferSelect;
