import { ACCESS_CODE_PATTERN } from "@chromebook/shared";

const ACCESS_CODE_KEY = "chromebook.accessCode";
export const ACCESS_CODE_PARAM = "acesso";

let memoryCode: string | null = null;

export function getAccessCode(): string | null {
  try {
    return localStorage.getItem(ACCESS_CODE_KEY) ?? memoryCode;
  } catch {
    return memoryCode;
  }
}

export function rememberAccessCode(code: string): void {
  memoryCode = code;
  try {
    localStorage.setItem(ACCESS_CODE_KEY, code);
  } catch {
    return;
  }
}

export function captureAccessCodeFromUrl(): void {
  const url = new URL(window.location.href);
  const code = url.searchParams.get(ACCESS_CODE_PARAM);
  if (code === null) return;
  if (ACCESS_CODE_PATTERN.test(code)) rememberAccessCode(code);
  url.searchParams.delete(ACCESS_CODE_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function publicAgendaLink(code: string): string {
  return `${window.location.origin}/?${ACCESS_CODE_PARAM}=${encodeURIComponent(code)}`;
}
