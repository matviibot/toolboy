import type { HTMLAttributes, ReactNode } from "react";
import { OriginBadge, type Origin } from "./OriginBadge";
import { Icon } from "./Icon";

/**
 * EntityRow — a single result in the command palette. Renders a tool or a
 * toolchain, each marked with its origin (yours/public). A toolchain reads as a
 * "scene": stacked-card shadow + a count of wired tools. Keyboard-selectable.
 */
export interface EntityRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  kind?: "tool" | "toolchain";
  name: string;
  description?: string;
  /** node (<Icon />) or emoji string */
  icon?: ReactNode;
  origin?: Origin;
  /** toolchain: number of tools in the scene */
  toolCount?: number;
  /** optional right-aligned mono meta (e.g. "⌘↵ split"), shown only when selected */
  meta?: string;
  /** optional trailing control (e.g. a favourite star), always rendered */
  trailing?: ReactNode;
  selected?: boolean;
}

export function EntityRow({
  kind = "tool",
  name,
  description,
  icon,
  origin = "yours",
  toolCount,
  meta,
  trailing,
  selected = false,
  style,
  ...rest
}: EntityRowProps) {
  const isChain = kind === "toolchain";
  const accent = origin === "public" ? "var(--public)" : "var(--accent)";
  const soft = origin === "public" ? "var(--public-soft)" : "var(--accent-soft)";

  // stacked-card shadow so a toolchain reads as several tools
  const chainStack = isChain
    ? `, -3px 4px 0 -1px var(--glass-fill-strong), -6px 8px 0 -2px var(--glass-fill)`
    : "";

  return (
    <div
      role="option"
      aria-selected={selected}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: "13px",
        padding: "11px 14px",
        marginLeft: isChain ? "6px" : 0,
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        background: selected ? soft : "transparent",
        boxShadow: selected ? "var(--shadow-1)" : "none",
        transition: "background var(--dur-fast) var(--ease-out)",
        ...style,
      }}
      {...rest}
    >
      {selected && (
        <span
          aria-hidden="true"
          style={{ position: "absolute", left: "5px", top: "18%", bottom: "18%", width: "3px", borderRadius: "3px", background: accent }}
        />
      )}

      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: "38px",
          height: "38px",
          flex: "none",
          borderRadius: "var(--radius-sm)",
          background: soft,
          color: accent,
          font: "var(--text-lg) var(--font-mono)",
          boxShadow: `var(--shadow-1)${chainStack}`,
          border: isChain ? `1px solid ${origin === "public" ? "var(--public-ring)" : "var(--accent-ring)"}` : "1px solid transparent",
        }}
      >
        {typeof icon === "string" ? icon : (icon ?? <Icon name={isChain ? "workflow" : "box"} size={18} />)}
      </span>

      <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <span style={{ font: "var(--type-subhead)", color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          {isChain && (
            <span style={{ font: "var(--type-kbd)", color: "var(--fg-3)", padding: "1px 6px", borderRadius: "var(--radius-pill)", background: "var(--glass-fill-strong)", border: "1px solid var(--glass-stroke)" }}>
              scene · {toolCount ?? 0}
            </span>
          )}
          <OriginBadge origin={origin} style={{ marginLeft: "auto", flex: "none" }} />
        </div>
        {description && (
          <span style={{ font: "var(--type-caption)", color: "var(--fg-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{description}</span>
        )}
      </div>

      {meta && selected && <span style={{ font: "var(--type-mono-sm)", color: "var(--fg-3)", flex: "none" }}>{meta}</span>}
      {trailing}
    </div>
  );
}
