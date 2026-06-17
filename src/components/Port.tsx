import type { HTMLAttributes } from "react";

/**
 * Port — a tool's typed input or output endpoint. Shows the MIME-style type in
 * mono and a small node that lights up when wired. Used on pane footers and the
 * wiring UI; the dot is what a wire connects to.
 */
export interface PortProps extends HTMLAttributes<HTMLSpanElement> {
  direction?: "in" | "out";
  type?: string;
  wired?: boolean;
  /** brief accent pulse when fresh data arrives */
  pulse?: boolean;
}

export function Port({ direction = "out", type = "application/json", wired = false, pulse = false, style, ...rest }: PortProps) {
  const isIn = direction === "in";
  const dot = (
    <span
      aria-hidden="true"
      style={{
        width: "9px",
        height: "9px",
        borderRadius: "50%",
        flex: "none",
        background: wired ? "var(--accent)" : "transparent",
        border: `1.5px solid ${wired ? "var(--accent)" : "var(--fg-4)"}`,
        boxShadow: wired ? "0 0 0 4px var(--accent-faint)" : "none",
        transition: "all var(--dur-base) var(--ease-out)",
        animation: pulse ? "tbPortPulse 0.6s var(--ease-out)" : "none",
      }}
    />
  );
  const typeChip = <span style={{ font: "var(--type-mono-sm)", color: wired ? "var(--accent)" : "var(--fg-3)" }}>{type}</span>;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        padding: "3px 9px",
        borderRadius: "var(--radius-pill)",
        background: wired ? "var(--accent-faint)" : "var(--glass-fill)",
        border: `1px solid ${wired ? "var(--accent-ring)" : "var(--glass-stroke)"}`,
        ...style,
      }}
      {...rest}
    >
      {isIn ? dot : null}
      {typeChip}
      {!isIn ? dot : null}
    </span>
  );
}
