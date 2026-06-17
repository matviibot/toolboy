/* toolboy command palette — ⌘K. Weightless centered glass popover over a dimmed
   surface. Mixed tool + toolchain results with origin; full keyboard control. */
import { useEffect, useState } from "react";
import { Glass, Input, Kbd, EntityRow, Icon } from "../components";
import type { Entity } from "./types";

function score(entity: Entity, q: string): number {
  if (!q) return 1;
  const hay = (entity.name + " " + (entity.description || "") + " " + entity.kind).toLowerCase();
  const needle = q.toLowerCase();
  if (hay.includes(needle)) return 2;
  // loose fuzzy: all chars in order
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length ? 1 : 0;
}

export interface PaletteProps {
  entities: Entity[];
  onPick: (entity: Entity, split: boolean) => void;
  onClose: () => void;
}

export function Palette({ entities, onPick, onClose }: PaletteProps) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  const results = entities
    .map((e) => ({ e, s: score(e, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.e);

  useEffect(() => { setSel(0); }, [q]);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") { ev.preventDefault(); onClose(); }
      else if (ev.key === "ArrowDown") { ev.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if (ev.key === "Enter") { ev.preventDefault(); if (results[sel]) onPick(results[sel], ev.metaKey || ev.ctrlKey); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [results, sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const empty = q.length === 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: "var(--z-palette)" as unknown as number,
        background: "var(--system-scrim)",
        backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "14vh",
        animation: "tbFade var(--dur-base) var(--ease-out)",
      }}
    >
      <Glass
        elevation="popover"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(640px, 92vw)", overflow: "hidden", animation: "tbPaletteIn var(--dur-base) var(--ease-out)" }}
      >
        <div style={{ padding: 14, borderBottom: "1px solid var(--glass-stroke)" }}>
          <Input
            size="lg"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your tools and toolchains…"
            leading={<Icon name="search" size={18} />}
            trailing={<Kbd>Esc</Kbd>}
            style={{ background: "transparent", border: "none", boxShadow: "none", padding: "2px 4px" }}
            autoFocus
          />
        </div>

        <div style={{ maxHeight: "46vh", overflowY: "auto", padding: 8 }}>
          {empty && (
            <div style={{ padding: "6px 8px 4px" }}>
              <div className="tb-eyebrow" style={{ padding: "8px 6px" }}>Recent</div>
            </div>
          )}
          {results.length === 0 ? (
            <div style={{ padding: "30px 16px", textAlign: "center", color: "var(--fg-3)", font: "var(--type-body)" }}>
              No tools match “{q}”.
            </div>
          ) : (
            results.map((e, i) => (
              <EntityRow
                key={e.id}
                kind={e.kind}
                name={e.name}
                description={e.description}
                origin={e.origin}
                toolCount={e.kind === "toolchain" ? e.tools.length : undefined}
                icon={<Icon name={e.icon} size={18} />}
                selected={i === sel}
                onMouseEnter={() => setSel(i)}
                onClick={(ev) => onPick(e, ev.metaKey || ev.ctrlKey)}
                meta={e.kind === "toolchain" ? "↵ open scene" : "↵ open · ⌘↵ split"}
              />
            ))
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", borderTop: "1px solid var(--glass-stroke)", font: "var(--type-caption)", color: "var(--fg-3)" }}>
          <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><Kbd>↵</Kbd> open</span>
          <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><Kbd>⌘</Kbd><Kbd>↵</Kbd> split</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>
            <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }} /> yours</span>
            <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--public)" }} /> public</span>
          </span>
        </div>
      </Glass>
    </div>
  );
}
