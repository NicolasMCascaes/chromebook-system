import { useSyncExternalStore } from "react";

const TOKENS_KEY = "chromebook.cancelTokens";
const TEACHER_NAME_KEY = "chromebook.teacherName";
const listeners = new Set<() => void>();
let cache: Record<string, string> | null = null;

function readTokens(): Record<string, string> {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TOKENS_KEY) ?? "{}");
    cache = parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function persistTokens(tokens: Record<string, string>): void {
  try {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    return;
  }
}

function writeTokens(tokens: Record<string, string>): void {
  cache = tokens;
  persistTokens(tokens);
  listeners.forEach((listener) => listener());
}

export function newCancelToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function rememberReservation(id: string, cancelToken: string): void {
  writeTokens({ ...readTokens(), [id]: cancelToken });
}

export function cancelTokenFor(id: string): string | undefined {
  return readTokens()[id];
}

export function useMyReservationIds(): Record<string, string> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    readTokens,
    () => ({}),
  );
}

export function lastTeacherName(): string {
  try {
    return localStorage.getItem(TEACHER_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberTeacherName(name: string): void {
  try {
    localStorage.setItem(TEACHER_NAME_KEY, name);
  } catch {
    return;
  }
}
