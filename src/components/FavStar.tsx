import type { CSSProperties, MouseEvent } from "react";
import { Icon } from "./Icon";

/**
 * FavStar — the pin-to-home toggle. A filled amber star when favourited, a faint
 * outline otherwise. Stops click/mousedown propagation so it never triggers the row
 * open or a pane drag it lives inside. Used in the ⌘K palette, pane headers, and home.
 */
export interface FavStarProps {
  on: boolean;
  onToggle: () => void;
  size?: number;
  /** dim the outline state to near-invisible until hovered/selected (palette rows) */
  subtle?: boolean;
  title?: string;
  style?: CSSProperties;
}

export function FavStar({ on, onToggle, size = 15, subtle = false, title, style }: FavStarProps) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title ?? (on ? "Remove from home" : "Pin to home")}
      onMouseDown={stop}
      onClick={(e) => { stop(e); onToggle(); }}
      className="tb-favstar"
      data-on={on || undefined}
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: size + 13,
        height: size + 13,
        flex: "none",
        padding: 0,
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        border: "none",
        background: "transparent",
        color: on ? "var(--warn)" : "var(--fg-4)",
        opacity: on ? 1 : subtle ? 0 : 0.8,
        transition: "color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)",
        ...style,
      }}
    >
      <Icon name="star" size={size} style={{ fill: on ? "currentColor" : "none" }} />
    </button>
  );
}
