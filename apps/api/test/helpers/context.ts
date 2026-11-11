import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import type { UserRole } from "@chromebook/shared";
import { createDatabase } from "@/lib/db/client";
import { users, type UserRow } from "@/lib/db/schema";
import { setContainer, type AppContainer } from "@/lib/container";
import { JwtTokenVerifier, SUPABASE_AUDIENCE } from "@/lib/auth/token-verifier";
import type { AuthAdminGateway } from "@/lib/auth/auth-admin";
import type { Clock } from "@/lib/clock";
import type { EmailMessage, EmailSender } from "@/lib/email/sender";

export const TEST_ISSUER = "http://supabase.test/auth/v1";
export const TEST_CRON_SECRET = "test-cron-secret-0123456789abcdefghij";

export class FakeAuthAdminGateway implements AuthAdminGateway {
  readonly idsByEmail = new Map<string, string>();

  async ensureUser(email: string): Promise<string> {
    const existing = this.idsByEmail.get(email);
    if (existing) return existing;
    const id = randomUUID();
    this.idsByEmail.set(email, id);
    return id;
  }
}

export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  failure: Error | null = null;

  async send(message: EmailMessage): Promise<void> {
    if (this.failure) throw this.failure;
    this.sent.push(message);
  }

  clear(): void {
    this.sent.length = 0;
    this.failure = null;
  }
}

export const DEFAULT_TEST_NOW = new Date("2030-03-04T13:00:00Z");

export class FixedClock implements Clock {
  private current = DEFAULT_TEST_NOW;

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(instant: Date | string): void {
    this.current = new Date(instant);
  }
}

export interface TokenOptions {
  issuer?: string;
  audience?: string;
  expiresAt?: number;
}

export type TestUser = UserRow & { token: string };

export async function createTestContext() {
  const { db, client } = createDatabase(inject("databaseUrl"), { max: 10 });
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const authAdmin = new FakeAuthAdminGateway();
  const clock = new FixedClock();
  const emailSender = new FakeEmailSender();
  const backgroundTasks: (() => Promise<void>)[] = [];
  const container: AppContainer = {
    db,
    tokenVerifier: new JwtTokenVerifier(publicKey, TEST_ISSUER),
    authAdmin,
    clock,
    emailSender,
    runAfterResponse: (task) => backgroundTasks.push(task),
    cronSecret: TEST_CRON_SECRET,
    appPublicUrl: "http://escola.test",
  };

  async function runBackgroundTasks(): Promise<void> {
    const tasks = backgroundTasks.splice(0);
    for (const task of tasks) await task();
  }
  setContainer(container);

  async function token(userId: string, options: TokenOptions = {}): Promise<string> {
    return new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "ES256" })
      .setSubject(userId)
      .setIssuer(options.issuer ?? TEST_ISSUER)
      .setAudience(options.audience ?? SUPABASE_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(options.expiresAt ?? "1h")
      .sign(privateKey);
  }

  async function createUser(role: UserRole, overrides: Partial<typeof users.$inferInsert> = {}): Promise<TestUser> {
    const id = overrides.id ?? randomUUID();
    const [row] = await db
      .insert(users)
      .values({
        id,
        email: `${role.toLowerCase()}-${id.slice(0, 8)}@escola.test`,
        name: role === "ADMIN" ? "Admin Teste" : "Professora Teste",
        role,
        ...overrides,
      })
      .returning();
    return { ...row!, token: await token(id) };
  }

  async function reset(): Promise<void> {
    await client.unsafe(`
      truncate app.notification_outbox, app.reservations, app.calendar_blocks, app.chromebooks, app.carts, app.users cascade;
      update app.school_settings set opening_time = '07:00', closing_time = '18:00', slot_minutes = 5, notification_emails = '{}';
      delete from app.class_periods;
      insert into app.class_periods (name, start_time, end_time) values
        ('1ª aula', '07:20', '08:10'),
        ('2ª aula', '08:10', '09:00'),
        ('3ª aula', '09:00', '09:50'),
        ('4ª aula', '10:10', '11:00'),
        ('5ª aula', '11:00', '11:50');
    `);
    authAdmin.idsByEmail.clear();
    emailSender.clear();
    backgroundTasks.length = 0;
    clock.set(DEFAULT_TEST_NOW);
  }

  async function close(): Promise<void> {
    setContainer(undefined);
    await client.end();
  }

  return { db, client, container, authAdmin, clock, emailSender, runBackgroundTasks, token, createUser, reset, close };
}

export type TestContext = Awaited<ReturnType<typeof createTestContext>>;
