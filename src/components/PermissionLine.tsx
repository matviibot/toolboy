import type { HTMLAttributes } from "react";
import { Icon } from "./Icon";

/**
 * PermissionLine — one declared capability in a trust summary (storage / secret /
 * network). Host chrome only. Icon + plain label + the specific resource in mono.
 */
const KIND = {
  storage: { icon: "database", label: "Local storage", tone: "var(--fg-2)" },
  secret: { icon: "key", label: "Secret", tone: "var(--public)" },
  net: { icon: "globe", label: "Network", tone: "var(--accent)" },
} as const;

export interface PermissionLineProps extends HTMLAttributes<HTMLDivElement> {
  kind?: keyof typeof KIND;
  /** the specific resource: domain, secret name, etc. */
  value?: string;
  /** optional one-line rationale */
  detail?: string;
  /** undefined = pending; true/false = decided */
  granted?: boolean;
}

export function PermissionLine({ kind = "net", value, detail, granted, style, ...rest }: PermissionLineProps) {
  const k = KIND[kind];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "11px 13px",
        borderRadius: "var(--radius-md)",
        background: "var(--glass-fill)",
        border: "1px solid var(--glass-stroke)",
        ...style,
      }}
      {...rest}
    >
      <span style={{ display: "inline-grid", placeItems: "center", width: "30px", height: "30px", flex: "none", borderRadius: "var(--radius-sm)", background: "var(--glass-fill-inset)", color: k.tone }}>
        <Icon name={k.icon} size={16} />
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span style={{ font: "var(--type-label)", color: "var(--fg-1)" }}>{k.label}</span>
          {value && <span style={{ font: "var(--type-mono-sm)", color: k.tone, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>}
        </div>
        {detail && <span style={{ font: "var(--type-caption)", color: "var(--fg-3)" }}>{detail}</span>}
      </div>
      {granted !== undefined && (
        <span style={{ font: "var(--type-kbd)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase", color: granted ? "var(--ok)" : "var(--fg-4)" }}>
          {granted ? "granted" : "denied"}
        </span>
      )}
    </div>
  );
}
