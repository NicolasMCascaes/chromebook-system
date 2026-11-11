import type { z } from "zod";

export type FieldErrors = Record<string, string>;

export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    result[path] ??= issue.message;
  }
  return result;
}
