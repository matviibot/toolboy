/* toolboy command palette — ⌘K. Weightless centered glass popover over a dimmed
   surface. Mixed tool + toolchain results with origin; full keyboard control.

   Three sources, one ranked list: the user's own loaded tools (instant, local), the
   discovery index (debounced, cross-repo, when a backend is configured), and a direct
   "load this repo" action when the query is itself a gh: source. The home screen is
   built from favourites, so each local row carries a star to pin/unpin it. */
import { useEffect, useMemo, useState } from "react";
import { Glass, Input, Kbd, EntityRow, FavStar, Icon } from "../components";
import type { Entity } from "./types";
import { discover, discoveryEnabled, type DiscoveryCard } from "../loader/discovery";
import { parseSource } from "../loader/resolver";

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

/** Does the query parse as a loadable gh: source the user can open directly? Returns
    the trimmed spec, or null. Discovery is a finder; this is the "I already know the
    repo" path — paste gh:owner/repo@ref to load it (private repos need a token). */
function loadableSource(q: string): string | null {
  const spec = q.trim();
  if (!spec.startsWith("gh:")) return null;
  try { parseSource(spec); return spec; } catch { return null; }
}

type Item =
  | { t: "local"; e: Entity }
  | { t: "remote"; c: DiscoveryCard }
  | { t: "source"; spec: string };

/** thin section label above a group of rows */
function Eyebrow({ icon, children }: { icon?: string; children: React.ReactNode }) {
  return (
    <div className="tb-eyebrow" style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 8px 5px" }}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </div>
  );
}

export interface PaletteProps {
  entities: Entity[];
  favIds: Set<string>;
  onPick: (entity: Entity, split: boolean) => void;
  onToggleFav: (entity: Entity) => void;
  onPickDiscovered: (card: DiscoveryCard) => void;
  onLoadSource: (source: string) => void;
  onClose: () => void;
}

export function Palette({ entities, favIds, onPick, onToggleFav, onPickDiscovered, onLoadSource, onClose }: PaletteProps) {
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

  const localResults = useMemo(
    () =>
      entities
        .map((e) => ({ e, s: score(e.name, e.description, e.kind, q) }))
        .filter((x) => x.s > 0)
        // favourites first, then score, then name — a stable, scannable order
        .sort((a, b) => Number(favIds.has(b.e.id)) - Number(favIds.has(a.e.id)) || b.s - a.s || a.e.name.localeCompare(b.e.name))
        .map((x) => x.e),
    [entities, q, favIds],
  );

  // a discovered card the user already has (same id locally) is redundant — hide it;
  // dedupe the remote list itself by source+id too
  const remoteResults = useMemo(() => {
    const localIds = new Set(entities.map((e) => e.id));
    const seen = new Set<string>();
    return remote.filter((c) => {
      if (localIds.has(c.id)) return false;
      const key = c.source + "::" + c.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [remote, entities]);

  // an explicit "load this repo" action when the query is a gh: source — pinned to the
  // top so Enter loads it; offsets every other row's index by one.
  const sourceSpec = loadableSource(q);
  const offset = sourceSpec ? 1 : 0;
  const items: Item[] = [
    ...(sourceSpec ? [{ t: "source", spec: sourceSpec } as Item] : []),
    ...localResults.map((e): Item => ({ t: "local", e })),
    ...remoteResults.map((c): Item => ({ t: "remote", c })),
  ];
  const remoteStart = offset + localResults.length;

  useEffect(() => { setSel(0); }, [q]);
  // keep selection in range as async discovery results arrive
  useEffect(() => { setSel((s) => Math.min(s, Math.max(0, items.length - 1))); }, [items.length]);

  const choose = (it: Item, split: boolean) => {
    if (it.t === "local") onPick(it.e, split);
    else if (it.t === "remote") onPickDiscovered(it.c);
    else onLoadSource(it.spec);
  };

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") { ev.preventDefault(); onClose(); }
      else if (ev.key === "ArrowDown") { ev.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if (ev.key === "Enter") { ev.preventDefault(); if (items[sel]) choose(items[sel], ev.metaKey || ev.ctrlKey); }
      // ⌘F / ⌘D — toggle favourite on the selected local row
      else if ((ev.metaKey || ev.ctrlKey) && (ev.key === "d" || ev.key === "D")) {
        const it = items[sel];
        if (it?.t === "local") { ev.preventDefault(); onToggleFav(it.e); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasLocal = localResults.length > 0;
  const hasRemote = remoteResults.length > 0;
  // when discovery is off and nothing is loaded yet, the help text leans on load-by-source
  const placeholder = discoveryEnabled
    ? "Search your tools, discover new ones, or paste a gh: source…"
    : "Search your tools, or paste a gh:owner/repo@ref to load one…";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: "var(--z-palette)" as unknown as number,
        background: "var(--system-scrim)",
        backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "13vh",
        animation: "tbFade var(--dur-base) var(--ease-out)",
      }}
    >
      <Glass
        elevation="popover"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(660px, 92vw)", overflow: "hidden", animation: "tbPaletteIn var(--dur-base) var(--ease-out)" }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--glass-stroke)" }}>
          <Input
            size="lg"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            leading={<Icon name="search" size={18} />}
            trailing={<Kbd>Esc</Kbd>}
            style={{ background: "transparent", border: "none", boxShadow: "none", padding: "2px 4px" }}
            autoFocus
          />
        </div>

        <div style={{ maxHeight: "48vh", overflowY: "auto", padding: "6px 8px 8px" }}>
          {items.length === 0 ? (
            <EmptyState q={q} discoveryEnabled={discoveryEnabled} />
          ) : (
            <>
              {sourceSpec && (
                <EntityRow
                  key="__load_source__"
                  kind="tool"
                  name={`Load ${sourceSpec}`}
                  description="Open this repository directly"
                  origin="yours"
                  icon={<Icon name="git-branch" size={18} />}
                  selected={0 === sel}
                  onMouseEnter={() => setSel(0)}
                  onClick={() => onLoadSource(sourceSpec)}
                  meta="↵ load repo"
                />
              )}

              {hasLocal && <Eyebrow icon="sparkles">Your tools</Eyebrow>}
              {localResults.map((e, i) => {
                const idx = offset + i;
                const on = favIds.has(e.id);
                return (
                  <EntityRow
                    key={e.id}
                    kind={e.kind}
                    name={e.name}
                    description={e.description}
                    origin={e.origin}
                    toolCount={e.kind === "toolchain" ? e.tools.length : undefined}
                    icon={<Icon name={e.icon} size={18} />}
                    selected={idx === sel}
                    onMouseEnter={() => setSel(idx)}
                    onClick={(ev) => onPick(e, ev.metaKey || ev.ctrlKey)}
                    meta={e.kind === "toolchain" ? "↵ scene" : "⌘↵ split"}
                    trailing={
                      <FavStar
                        on={on}
                        onToggle={() => onToggleFav(e)}
                        subtle={idx !== sel && !on}
                        title={on ? "Remove from home" : "Pin to home (⌘D)"}
                      />
                    }
                  />
                );
              })}

              {hasRemote && <Eyebrow icon="globe">From other repos</Eyebrow>}
              {remoteResults.map((c, j) => {
                const idx = remoteStart + j;
                return (
                  <EntityRow
                    key={c.source + "::" + c.id}
                    kind={c.kind}
                    name={c.name}
                    description={c.description}
                    origin="public"
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
          <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><Kbd>⌘</Kbd><Kbd>D</Kbd> pin</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 10, alignItems: "center" }}>
            <Legend color="var(--accent)" label="yours" />
            <Legend color="var(--public)" label="public" />
            <Legend color="var(--warn)" label="pinned" />
          </span>
        </div>
      </Glass>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} /> {label}
    </span>
  );
}

/** Empty result set — guidance, not a dead end. The home screen ships no default tools,
    so the first run lands here: tell the user how to get tools in. */
function EmptyState({ q, discoveryEnabled }: { q: string; discoveryEnabled: boolean }) {
  const searching = q.trim().length > 0;
  return (
    <div style={{ padding: "34px 22px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <span style={{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: "var(--radius-md)", background: "var(--glass-fill-strong)", border: "1px solid var(--glass-stroke)", color: "var(--fg-3)" }}>
        <Icon name={searching ? "search" : "sparkles"} size={20} />
      </span>
      <div style={{ font: "var(--type-subhead)", color: "var(--fg-1)" }}>
        {searching ? `No tools match “${q.trim()}”` : "No tools yet"}
      </div>
      <div style={{ font: "var(--type-caption)", color: "var(--fg-3)", maxWidth: 340, lineHeight: 1.5 }}>
        {discoveryEnabled
          ? "Keep typing to discover tools across repos, or paste a "
          : "Paste a "}
        <code style={{ font: "var(--type-mono-sm)", color: "var(--fg-2)", background: "var(--glass-fill-strong)", padding: "1px 5px", borderRadius: "var(--radius-xs)" }}>gh:owner/repo@ref</code>
        {" "}source to load a repo, then ★ a tool to pin it to home.
      </div>
    </div>
  );
}
