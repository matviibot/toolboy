import type { HTMLAttributes } from "react";

/**
 * Badge — a small pill for status or origin. Tone drives the color; "yours" and
 * "public" are the origin tones that carry meaning across the system.
 */
export type BadgeTone = "neutral" | "yours" | "public" | "ok" | "warn" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", children, style, ...rest }: BadgeProps) {
  const map = {
    neutral: { color: "var(--fg-2)", bg: "var(--glass-fill-strong)", bd: "var(--glass-stroke)" },
    yours: { color: "var(--accent)", bg: "var(--accent-faint)", bd: "var(--accent-ring)" },
    public: { color: "var(--public)", bg: "var(--public-faint)", bd: "var(--public-ring)" },
    ok: { color: "var(--ok)", bg: "var(--ok-soft)", bd: "var(--ok)" },
    warn: { color: "var(--warn)", bg: "var(--warn-soft)", bd: "var(--warn)" },
    danger: { color: "var(--danger)", bg: "var(--danger-soft)", bd: "var(--danger)" },
  }[tone];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "2px 8px",
        font: "var(--type-kbd)",
        letterSpacing: "var(--tracking-wide)",
        textTransform: tone === "yours" || tone === "public" ? "uppercase" : "none",
        color: map.color,
        background: map.bg,
        border: `1px solid ${map.bd}`,
        borderRadius: "var(--radius-pill)",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
