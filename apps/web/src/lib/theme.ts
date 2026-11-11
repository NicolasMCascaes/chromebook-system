import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "chromebook.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();
let chosenTheme: Theme | null = null;

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function currentTheme(): Theme {
  return chosenTheme ?? storedTheme() ?? systemTheme();
}

export function applyTheme(): void {
  const theme = currentTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.colorScheme = theme;
}

function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    return;
  }
}

export function setTheme(theme: Theme): void {
  chosenTheme = theme;
  storeTheme(theme);
  applyTheme();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  const onSystemChange = () => {
    applyTheme();
    listener();
  };
  listeners.add(listener);
  media.addEventListener("change", onSystemChange);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => "light");
}
