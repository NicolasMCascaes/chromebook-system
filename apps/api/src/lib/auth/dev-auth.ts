import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import type { AuthAdminGateway } from "./auth-admin";
import { JwtTokenVerifier, SUPABASE_AUDIENCE, type TokenVerifier } from "./token-verifier";

export const DEV_AUTH_ISSUER = "chromebook-dev-auth";
const DEV_TOKEN_TTL = "8h";

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export function createDevTokenVerifier(secret: string): TokenVerifier {
  return new JwtTokenVerifier(secretKey(secret), DEV_AUTH_ISSUER);
}

export function signDevToken(secret: string, userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(DEV_AUTH_ISSUER)
    .setAudience(SUPABASE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(DEV_TOKEN_TTL)
    .sign(secretKey(secret));
}

export class DevAuthAdminGateway implements AuthAdminGateway {
  constructor(private readonly db: Database) {}

  async ensureUser(email: string): Promise<string> {
    const [existing] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    return existing?.id ?? randomUUID();
  }
}
