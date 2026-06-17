import type { CSSProperties, ElementType, ReactNode, HTMLAttributes } from "react";

/**
 * Glass — the toolboy material wrapper. Frosted translucent panel with a
 * hairline + light-catch edge and layered shadow. Everything floating over the
 * surface (panes, popovers, cards) is built on this.
 */
export type GlassElevation = "card" | "panel" | "popover";

export interface GlassProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  elevation?: GlassElevation;
  inset?: boolean;
  edge?: boolean;
  /** undefined | "public" — tints the edge amber */
  origin?: "public" | "yours";
  children?: ReactNode;
}

export function Glass({
  as: Tag = "div",
  elevation = "panel",
  inset = false,
  edge = true,
  origin,
  style,
  children,
  ...rest
}: GlassProps) {
  const radius = { card: "var(--radius-lg)", panel: "var(--radius-xl)", popover: "var(--radius-xl)" }[elevation];
  const blur = elevation === "popover" ? "var(--blur-xl)" : "var(--blur-md)";
  const shadow = { card: "var(--shadow-2)", panel: "var(--shadow-3)", popover: "var(--shadow-4)" }[elevation];

  if (inset) {
    return (
      <Tag
        style={{
          background: "var(--glass-fill-inset)",
          border: "1px solid var(--glass-stroke-lo)",
          borderRadius: "var(--radius-md)",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.18)",
          ...style,
        }}
        {...rest}
      >
        {children}
      </Tag>
    );
  }

  const edgeColorHi = origin === "public" ? "var(--public-ring)" : "var(--glass-stroke-hi)";

  return (
    <Tag
      style={{
        position: "relative",
        background: "var(--glass-fill)",
        WebkitBackdropFilter: `blur(${blur}) saturate(var(--blur-saturate))`,
        backdropFilter: `blur(${blur}) saturate(var(--blur-saturate))`,
        border: "1px solid var(--glass-stroke)",
        borderRadius: radius,
        boxShadow: `${shadow}, var(--shadow-inset)`,
        ...style,
      }}
      {...rest}
    >
      {edge && (
        <span
          aria-hidden="true"
          style={
            {
              position: "absolute",
              inset: 0,
              borderRadius: "inherit",
              padding: "1px",
              background: `linear-gradient(160deg, ${edgeColorHi} 0%, transparent 32%, transparent 68%, var(--glass-stroke-lo) 100%)`,
              WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              WebkitMaskComposite: "xor",
              mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              maskComposite: "exclude",
              pointerEvents: "none",
            } as CSSProperties
          }
        />
      )}
      {children}
    </Tag>
  );
}
