import { setTheme, useTheme } from "../lib/theme";

export function ThemeToggle() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="button secondary small theme-toggle"
      aria-pressed={theme === "dark"}
      onClick={() => setTheme(next)}
    >
      {theme === "dark" ? "Modo claro" : "Modo escuro"}
    </button>
  );
}
