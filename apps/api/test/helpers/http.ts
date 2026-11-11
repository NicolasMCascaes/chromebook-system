interface RequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
  accessCode?: string | null;
}

export const DEFAULT_ACCESS_CODE = "codigo-de-acesso-de-teste";

export function apiRequest(path: string, options: RequestOptions = {}): Request {
  const headers = new Headers(options.headers);
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  const accessCode = options.accessCode === undefined ? DEFAULT_ACCESS_CODE : options.accessCode;
  if (accessCode !== null && !headers.has("x-access-code")) headers.set("x-access-code", accessCode);
  const hasBody = options.body !== undefined || options.rawBody !== undefined;
  if (hasBody) headers.set("content-type", "application/json");
  return new Request(`http://localhost${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.rawBody ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });
}

export function params<P extends Record<string, string>>(value: P = {} as P) {
  return { params: Promise.resolve(value) };
}
