import type { ApiErrorBody } from "@chromebook/shared";
import { env } from "../lib/env";
import { supabase } from "../lib/supabase";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = "ApiError";
  }

  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.body.details ?? []).map((detail) => [detail.path, detail.message]));
  }
}

const NETWORK_ERROR: ApiErrorBody = {
  code: "NETWORK_ERROR",
  message: "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
};

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(options.headers);
  if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }

  const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const body =
      payload && typeof payload === "object" && "message" in payload
        ? (payload as ApiErrorBody)
        : { code: "UNKNOWN_ERROR", message: "Ocorreu um erro inesperado. Tente novamente." };
    throw new ApiError(response.status, body);
  }
  return payload as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Ocorreu um erro inesperado. Tente novamente.";
}
