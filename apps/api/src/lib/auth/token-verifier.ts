import { createRemoteJWKSet, jwtVerify, type CryptoKey, type JWTVerifyGetKey, type KeyObject } from "jose";
import { AppError } from "../http/errors";

export interface VerifiedToken {
  userId: string;
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

export const SUPABASE_AUDIENCE = "authenticated";

type VerificationKey = JWTVerifyGetKey | CryptoKey | KeyObject | Uint8Array;

export class JwtTokenVerifier implements TokenVerifier {
  constructor(
    private readonly key: VerificationKey,
    private readonly issuer: string,
    private readonly audience: string = SUPABASE_AUDIENCE,
  ) {}

  async verify(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, this.key as JWTVerifyGetKey, {
        issuer: this.issuer,
        audience: this.audience,
      });
      if (!payload.sub) throw AppError.unauthorized();
      return { userId: payload.sub };
    } catch {
      throw AppError.unauthorized();
    }
  }
}

export function supabaseIssuer(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/auth/v1`;
}

export function createSupabaseTokenVerifier(supabaseUrl: string): TokenVerifier {
  const issuer = supabaseIssuer(supabaseUrl);
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return new JwtTokenVerifier(jwks, issuer);
}
