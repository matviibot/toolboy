import type { Origin } from "../components";

/** The accent/public color set the UI tints origin-bearing chrome with. One source
    for the "yours → accent, public → public" mapping that was previously copy-pasted
    as an inline ternary across the home tiles, pane headers, and trust dialog. */
export function originColors(origin: Origin) {
  return origin === "public"
    ? { fg: "var(--public)", soft: "var(--public-soft)", faint: "var(--public-faint)", ring: "var(--public-ring)" }
    : { fg: "var(--accent)", soft: "var(--accent-soft)", faint: "var(--accent-faint)", ring: "var(--accent-ring)" };
}
