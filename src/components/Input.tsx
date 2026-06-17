import React from "react";
import type { CSSProperties, InputHTMLAttributes, ReactNode } from "react";

/**
 * Input — a recessed glass well. Used for the palette search and any host field.
 * Optional leading/trailing nodes (search icon, kbd hint). Accent focus ring.
 */
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  leading?: ReactNode;
  trailing?: ReactNode;
  size?: "md" | "lg";
  /** wrapper style */
  style?: CSSProperties;
  inputStyle?: CSSProperties;
}

export function Input({ leading, trailing, size = "md", style, inputStyle, ...rest }: InputProps) {
  const [focus, setFocus] = React.useState(false);
  const pad = size === "lg" ? "14px 16px" : "10px 13px";
  const fs = size === "lg" ? "var(--text-lg)" : "var(--text-base)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: pad,
        background: "var(--glass-fill-inset)",
        border: "1px solid var(--glass-stroke-lo)",
        borderRadius: "var(--radius-md)",
        boxShadow: focus
          ? "inset 0 1px 2px rgba(0,0,0,0.18), 0 0 0 2px var(--accent-ring)"
          : "inset 0 1px 2px rgba(0,0,0,0.18)",
        transition: "box-shadow var(--dur-fast) var(--ease-out)",
        ...style,
      }}
    >
      {leading && <span style={{ display: "inline-flex", color: "var(--fg-3)", flex: "none" }}>{leading}</span>}
      <input
        {...rest}
        onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          outline: "none",
          background: "transparent",
          color: "var(--fg-1)",
          font: `var(--weight-regular) ${fs}/1.3 var(--font-sans)`,
          ...inputStyle,
        }}
      />
      {trailing && <span style={{ display: "inline-flex", color: "var(--fg-3)", flex: "none" }}>{trailing}</span>}
    </div>
  );
}
