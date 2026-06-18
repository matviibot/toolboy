/* toolboy command palette — ⌘K. Weightless centered glass popover over a dimmed
   surface. Mixed tool + toolchain results with origin; full keyboard control.

   Two sources, one list: the user's own registry (instant, local) and — when a
   backend is configured — the discovery index (debounced, cross-repo). Discovery
   hits are cards; picking one loads its source repo through the normal trust path. */
import { useEffect, useState } from "react";
import { Glass, Input, Kbd, EntityRow, Icon } from "../components";
import type { Entity } from "./types";
import { discover, discoveryEnabled, type DiscoveryCard } from "../loader/discovery";

function score(name: string, description: string, kind: string, q: string): number {
  if (!q) return 1;
  const hay = (name + " " + (description || "") + " " + kind).toLowerCase();
  const needle = q.toLowerCase();
  if (hay.includes(needle)) return 2;
  // loose fuzzy: all chars in order
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length ? 1 : 0;
}

type Item = { t: "local"; e: Entity } | { t: "remote"; c: DiscoveryCard };

export interface PaletteProps {
  entities: Entity[];
  onPick: (entity: Entity, split: boolean) => void;
  onPickDiscovered: (card: DiscoveryCard) => void;
  onClose: () => void;
}

export function Palette({ entities, onPick, onPickDiscovered, onClose }: PaletteProps) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [remote, setRemote] = useState<DiscoveryCard[]>([]);

  // debounced discovery query (additive — never blocks or breaks local results)
  useEffect(() => {
    if (!discoveryEnabled) return;
    const query = q.trim();
    if (query.length < 2) { setRemote([]); return; }
    let cancelled = false;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      discover(query, ctrl.signal).then((cards) => { if (!cancelled) setRemote(cards); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const localResults = entities
    .map((e) => ({ e, s: score(e.name, e.description, e.kind, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.e);

  // a discovered card the user already has (same id locally) is redundant — hide it;
  // dedupe the remote list itself by source+id too
  const localIds = new Set(entities.map((e) => e.id));
  const seen = new Set<string>();
  const remoteResults = remote.filter((c) => {
    if (localIds.has(c.id)) return false;
    const key = c.source + "::" + c.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const items: Item[] = [
    ...localResults.map((e): Item => ({ t: "local", e })),
    ...remoteResults.map((c): Item => ({ t: "remote", c })),
  ];
  const remoteStart = localResults.length;

  useEffect(() => { setSel(0); }, [q]);
  // keep selection in range as async discovery results arrive
  useEffect(() => { setSel((s) => Math.min(s, Math.max(0, items.length - 1))); }, [items.length]);

  const choose = (it: Item, split: boolean) => {
    if (it.t === "local") onPick(it.e, split);
    else onPickDiscovered(it.c);
  };

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") { ev.preventDefault(); onClose(); }
      else if (ev.key === "ArrowDown") { ev.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if (ev.key === "Enter") { ev.preventDefault(); if (items[sel]) choose(items[sel], ev.metaKey || ev.ctrlKey); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, sel]); // eslint-disable-line react-hooks/exhaustive-deps

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
            placeholder={discoveryEnabled ? "Search your tools — and discover new ones…" : "Search your tools and toolchains…"}
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
          {items.length === 0 ? (
            <div style={{ padding: "30px 16px", textAlign: "center", color: "var(--fg-3)", font: "var(--type-body)" }}>
              No tools match “{q}”.
            </div>
          ) : (
            <>
              {localResults.map((e, i) => (
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
              ))}

              {remoteResults.length > 0 && (
                <div className="tb-eyebrow" style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 6px 6px" }}>
                  <Icon name="globe" size={12} /> From other repos
                </div>
              )}
              {remoteResults.map((c, j) => {
                const idx = remoteStart + j;
                return (
                  <EntityRow
                    key={c.source + "::" + c.id}
                    kind={c.kind}
                    name={c.name}
                    description={c.description}
                    origin="public"
                    toolCount={undefined}
                    icon={<Icon name={c.icon} size={18} />}
                    selected={idx === sel}
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => onPickDiscovered(c)}
                    meta={`↵ add · ${c.repoName}`}
                  />
                );
              })}
            </>
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
