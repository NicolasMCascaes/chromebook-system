import { ApiError } from "../api/client";
import type { FieldErrors } from "./zod-errors";

export { zodFieldErrors } from "./zod-errors";
export type { FieldErrors } from "./zod-errors";

export function apiFieldErrors(error: unknown): FieldErrors {
  return error instanceof ApiError ? error.fieldErrors() : {};
}
