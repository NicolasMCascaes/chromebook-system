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

export const TEST_ISSUER = "http://supabase.test/auth/v1";

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
  const container: AppContainer = {
    db,
    tokenVerifier: new JwtTokenVerifier(publicKey, TEST_ISSUER),
    authAdmin,
    clock,
  };
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
      truncate app.reservations, app.calendar_blocks, app.chromebooks, app.carts, app.users cascade;
      update app.school_settings set opening_time = '07:00', closing_time = '18:00', slot_minutes = 5;
    `);
    authAdmin.idsByEmail.clear();
    clock.set(DEFAULT_TEST_NOW);
  }

  async function close(): Promise<void> {
    setContainer(undefined);
    await client.end();
  }

  return { db, client, container, authAdmin, clock, token, createUser, reset, close };
}

export type TestContext = Awaited<ReturnType<typeof createTestContext>>;
