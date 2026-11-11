import type { z } from "zod";
import { ApiError } from "../api/client";

export type FieldErrors = Record<string, string>;

export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    result[path] ??= issue.message;
  }
  return result;
}

export function apiFieldErrors(error: unknown): FieldErrors {
  return error instanceof ApiError ? error.fieldErrors() : {};
}
