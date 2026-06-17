import type { HTMLAttributes } from "react";

/**
 * Kbd — a keyboard key chip in mono. For ⌘K hints, shortcut rows, and any key
 * the user is meant to press. Not for icons.
 */
export function Kbd({ children, style, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "20px",
        padding: "4px 7px",
        font: "var(--type-kbd)",
        color: "var(--fg-1)",
        background: "var(--glass-fill-strong)",
        border: "1px solid var(--glass-stroke)",
        borderRadius: "var(--radius-xs)",
        boxShadow: "var(--shadow-1), inset 0 1px 0 var(--glass-highlight)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </kbd>
  );
}
