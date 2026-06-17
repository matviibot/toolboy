import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

/**
 * Button — primary action control. Quiet by default; the accent variant is the
 * one moment of color. Glass surfaces, soft press, accent focus ring.
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  /** "public" — recolors a primary to amber (act on a guest entity) */
  origin?: "public" | "yours";
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  origin,
  disabled = false,
  iconLeft,
  iconRight,
  style,
  children,
  ...rest
}: ButtonProps) {
  const pads = { sm: "6px 11px", md: "9px 15px", lg: "12px 20px" }[size];
  const fontSize = { sm: "var(--text-sm)", md: "var(--text-base)", lg: "var(--text-md)" }[size];

  const accentBase = origin === "public" ? "var(--public)" : "var(--accent)";

  const palette: CSSProperties = {
    primary: {
      background: accentBase,
      color: origin === "public" ? "#241800" : "var(--fg-on-accent)",
      border: "1px solid transparent",
      boxShadow: "var(--shadow-2), inset 0 1px 0 rgba(255,255,255,0.25)",
    },
    secondary: {
      background: "var(--glass-fill-strong)",
      color: "var(--fg-1)",
      border: "1px solid var(--glass-stroke)",
      boxShadow: "var(--shadow-1), var(--shadow-inset)",
      backdropFilter: "blur(var(--blur-sm))",
      WebkitBackdropFilter: "blur(var(--blur-sm))",
    },
    ghost: {
      background: "transparent",
      color: "var(--fg-2)",
      border: "1px solid transparent",
    },
    danger: {
      background: "var(--danger-soft)",
      color: "var(--danger)",
      border: "1px solid var(--danger)",
    },
  }[variant] as CSSProperties;

  return (
    <button
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        padding: pads,
        font: `var(--weight-medium) ${fontSize}/1 var(--font-sans)`,
        letterSpacing: "var(--tracking-snug)",
        borderRadius: "var(--radius-md)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition:
          "transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
        WebkitTapHighlightColor: "transparent",
        ...palette,
        ...style,
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.98)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
}
