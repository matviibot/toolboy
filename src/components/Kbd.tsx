import type { HTMLAttributes } from "react";

/**
 * Kbd — a key the user is meant to press, set as type rather than as a 3D keycap.
 * Chips with borders, shadows and inset highlights read as buttons and pile up fast
 * in a footer full of hints; this is a quiet mono glyph on a faint wash instead.
 *
 * The wash is mixed from the foreground so it inverts with the theme on its own —
 * a fixed white fill disappears on the light surface, and a fixed dark one muddies it.
 */
export function Kbd({ children, style, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "18px",
        padding: "2px 5px",
        font: "var(--type-kbd)",
        color: "var(--fg-2)",
        background: "color-mix(in oklab, var(--fg-1) 9%, transparent)",
        borderRadius: "var(--radius-xs)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </kbd>
  );
}
