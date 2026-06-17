import type { HTMLAttributes } from "react";

export type Origin = "yours" | "public";

/**
 * OriginBadge — signals whether an entity is the user's own or a public/guest
 * entity. Azure "yours" vs amber "public". Trusted-but-guest, never second-class.
 */
export interface OriginBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  origin?: Origin;
}

export function OriginBadge({ origin = "yours", style, ...rest }: OriginBadgeProps) {
  const isPublic = origin === "public";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "2px 8px 2px 6px",
        font: "var(--type-kbd)",
        letterSpacing: "var(--tracking-wide)",
        textTransform: "uppercase",
        color: isPublic ? "var(--public)" : "var(--accent)",
        background: isPublic ? "var(--public-faint)" : "var(--accent-faint)",
        border: `1px solid ${isPublic ? "var(--public-ring)" : "var(--accent-ring)"}`,
        borderRadius: "var(--radius-pill)",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden="true"
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: isPublic ? "var(--public)" : "var(--accent)",
        }}
      />
      {isPublic ? "public" : "yours"}
    </span>
  );
}
