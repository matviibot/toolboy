import type { ButtonHTMLAttributes } from "react";

/**
 * IconButton — square, quiet control for an icon-only action (close, split, pin).
 * Glass-hover lift; accent focus. Pass an <Icon /> or any node.
 */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
  active?: boolean;
  /** accessible name (also a native tooltip) */
  label: string;
}

export function IconButton({
  size = "md",
  active = false,
  label,
  style,
  children,
  ...rest
}: IconButtonProps) {
  const dim = { sm: 28, md: 34, lg: 40 }[size];
  return (
    <button
      aria-label={label}
      title={label}
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: dim,
        height: dim,
        color: active ? "var(--accent)" : "var(--fg-2)",
        background: active ? "var(--accent-faint)" : "transparent",
        border: "1px solid transparent",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        transition:
          "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)",
        WebkitTapHighlightColor: "transparent",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--glass-fill-strong)";
          e.currentTarget.style.color = "var(--fg-1)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--fg-2)";
        }
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.92)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      {...rest}
    >
      {children}
    </button>
  );
}
