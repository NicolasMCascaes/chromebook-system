export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
export const PG_CHECK_VIOLATION = "23514";
export const PG_EXCLUSION_VIOLATION = "23P01";

interface PgErrorLike {
  code?: string;
  constraint_name?: string;
  constraint?: string;
  cause?: unknown;
}

function findPgError(error: unknown): PgErrorLike | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const candidate = current as PgErrorLike;
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return candidate;
    }
    current = candidate.cause;
  }
  return undefined;
}

export function pgErrorCode(error: unknown): string | undefined {
  return findPgError(error)?.code;
}

export function pgConstraint(error: unknown): string | undefined {
  const pgError = findPgError(error);
  return pgError?.constraint_name ?? pgError?.constraint;
}

export function isPgError(error: unknown, code: string, constraint?: string): boolean {
  if (pgErrorCode(error) !== code) return false;
  return constraint === undefined || pgConstraint(error) === constraint;
}
