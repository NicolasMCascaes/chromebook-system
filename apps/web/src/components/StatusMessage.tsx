import type { ReactNode } from "react";

type Kind = "loading" | "error" | "success" | "empty" | "info";

export function StatusMessage({ kind, children }: { kind: Kind; children: ReactNode }) {
  const role = kind === "error" ? "alert" : "status";
  return (
    <div className={`status status-${kind}`} role={role} aria-live="polite">
      {children}
    </div>
  );
}
