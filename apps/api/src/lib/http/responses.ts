import { z } from "zod";
import { AppError } from "./errors";
import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, pgErrorCode } from "../db/errors";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(error.toBody(), { status: error.status });
  }
  const code = pgErrorCode(error);
  if (code === PG_UNIQUE_VIOLATION) {
    return Response.json(AppError.conflict("Já existe um registro com esses dados.").toBody(), { status: 409 });
  }
  if (code === PG_FOREIGN_KEY_VIOLATION) {
    return Response.json(AppError.validation("Um dos registros relacionados não existe.").toBody(), { status: 422 });
  }
  console.error("Unhandled API error", error);
  return Response.json(
    { code: "INTERNAL_ERROR", message: "Ocorreu um erro inesperado. Tente novamente em instantes." },
    { status: 500 },
  );
}

export function zodDetails(error: z.ZodError) {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.output<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw AppError.validation("O corpo da requisição deve ser um JSON válido.");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw AppError.validation("Verifique os campos informados.", zodDetails(result.error));
  }
  return result.data;
}

export function parseQuery<T extends z.ZodType>(request: Request, schema: T): z.output<T> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    throw AppError.validation("Parâmetros de consulta inválidos.", zodDetails(result.error));
  }
  return result.data;
}

const idSchema = z.uuid();

export function parseId(value: string | undefined): string {
  const result = idSchema.safeParse(value);
  if (!result.success) throw AppError.notFound();
  return result.data;
}
