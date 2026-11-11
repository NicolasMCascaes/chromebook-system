import type { CSSProperties } from "react";

export function cartStyle(color: string): CSSProperties {
  return { "--cart-color": color } as CSSProperties;
}
