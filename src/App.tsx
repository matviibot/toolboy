/* toolboy surface — App orchestrator. Owns theme, panes, wires, palette, and the
   trust chrome. Entities are loaded from a git manifest (toolboy.json) at boot —
   the registry is the source of truth, not a hardcoded dataset. Home → palette →
   tool / toolchain → split → wire → trust. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Button, Glass, IconButton, Kbd, FavStar, Icon } from "./components";
import markUrl from "./assets/logo/toolboy-mark.svg";
import { aggregatePerms, loadRegistry, revalidate, type LoadedRegistry, type RegistryUpdate } from "./loader/load";
import { keyring } from "./runtime/keyring";
import { originColors } from "./shell/origin";
import type { AggPerms, Entity, Pane, Perms, Tool, Wire } from "./shell/types";
import { Palette } from "./shell/Palette";
import { SplitSurface } from "./shell/Panes";
import { TrustDialog, type TrustSubject } from "./shell/Trust";
import { loadFavourites, saveFavourites, toggleFavourite, type Favourite } from "./shell/favourites";
import type { DiscoveryCard } from "./loader/discovery";

let UID = 1;
const mkPane = (toolId: string): Pane => ({ uid: "p" + UID++, toolId, inputs: {}, lastOutputs: {} });
const equalize = (n: number) => Array(n).fill(100 / n) as number[];

/** A flat read-model over every loaded repo: the palette searches `all`, panes resolve
    tools via `toolsById`. There is no built-in registry — the app starts empty and
    grows as the user loads repos (favourites at boot, discovery/load-by-source after). */
interface MergedRegistry {
  all: Entity[];
  toolsById: Record<string, Tool>;
}

/** Merge the per-source registries into one view; a later source wins a shared id. */
function mergeAll(regs: Record<string, LoadedRegistry>): MergedRegistry {
  const byId = new Map<string, Entity>();
  const toolsById: Record<string, Tool> = {};
  for (const r of Object.values(regs)) {
    for (const e of r.all) byId.set(e.id, e);
    Object.assign(toolsById, r.toolsById);
  }
  return { all: [...byId.values()], toolsById };
}

/** would adding from→to close a directed loop? (to already reaches from, or self) */
function wouldCycle(wires: Wire[], from: string, to: string): boolean {
  if (from === to) return true;
  const adj = new Map<string, string[]>();
  wires.forEach((w) => adj.set(w.from, [...(adj.get(w.from) ?? []), w.to]));
  const seen = new Set<string>();
  const stack = [to];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === from) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    (adj.get(n) ?? []).forEach((x) => stack.push(x));
  }
  return false;
}

type PaletteState = false | "open" | { splitFrom: string };

interface TrustState {
  subject: TrustSubject;
  perms: Perms | AggPerms;
  secretsNeeded: string[];
  action: () => void;
}

function BootSurface() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
      <img src={markUrl} width={64} height={64} alt="toolboy" style={{ filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.35))", animation: "tbPulse 1.6s var(--ease-in-out) infinite" }} />
      <div style={{ font: "var(--type-body)", color: "var(--fg-3)", textAlign: "center", maxWidth: 420 }}>Loading your toolbox…</div>
    </div>
  );
}

/** A single home tile. A favourite resolves to a live entity (clickable, origin-tinted)
    or — if its repo didn't load (private without a token, offline, deleted) — renders
    a dimmed "unavailable" card you can still unpin. The star unpins on hover. */
function HomeTile({ fav, entity, onOpen, onRemove }: { fav: Favourite; entity: Entity | undefined; onOpen: () => void; onRemove: () => void }) {
  const available = !!entity;
  const origin = entity?.origin ?? "yours";
  const icon = entity?.icon ?? fav.icon;
  const sub = !available
    ? "unavailable"
    : entity!.kind === "toolchain"
      ? "scene · " + entity!.tools.length
      : "tool";
  return (
    <Glass
      elevation="card"
      origin={available && origin === "public" ? "public" : undefined}
      onClick={available ? onOpen : undefined}
      className={available ? "tb-hometile tb-hometile--live" : "tb-hometile"}
      style={{
        position: "relative", width: 150, padding: 14, display: "flex", flexDirection: "column", gap: 10,
        cursor: available ? "pointer" : "default", opacity: available ? 1 : 0.55,
      }}
    >
      <div style={{ position: "absolute", top: 6, right: 6, zIndex: 1 }} className="tb-hometile-star">
        <FavStar on onToggle={onRemove} size={14} subtle title="Remove from home" />
      </div>
      <span style={{ display: "inline-grid", placeItems: "center", width: 32, height: 32, borderRadius: "var(--radius-sm)", background: originColors(origin).soft, color: originColors(origin).fg }}>
        <Icon name={icon} size={17} />
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ font: "var(--type-label)", color: "var(--fg-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entity?.name ?? fav.name}</span>
        <span style={{ font: "var(--type-caption)", color: "var(--fg-4)" }}>{sub}</span>
      </div>
    </Glass>
  );
}

function HomeSurface({ favourites, entityById, onOpen, onRemove }: {
  favourites: Favourite[];
  entityById: Map<string, Entity>;
  onOpen: (e: Entity, split: boolean) => void;
  onRemove: (fav: Favourite) => void;
}) {
  const empty = favourites.length === 0;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: 24, boxSizing: "border-box", animation: "tbFade var(--dur-slow) var(--ease-out)" }}>
      <img src={markUrl} width={76} height={76} alt="toolboy" style={{ filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.35))" }} />
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ font: "var(--type-display)", fontSize: 44, letterSpacing: "var(--tracking-tight)", color: "var(--fg-1)" }}>toolboy</div>
        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, font: "var(--type-body)", color: "var(--fg-3)" }}>
          {empty ? <>Press <Kbd>⌘</Kbd><Kbd>K</Kbd> to find a tool, then ★ it to pin it here</> : <>Press <Kbd>⌘</Kbd><Kbd>K</Kbd> to summon a tool</>}
        </div>
      </div>
      {!empty && (
        <div style={{ display: "flex", gap: 12, marginTop: 6, padding: 16, flexWrap: "wrap", justifyContent: "center", maxWidth: 692, maxHeight: "46vh", overflowY: "auto", overflowX: "hidden" }}>
          {favourites.map((fav) => {
            const entity = entityById.get(fav.id);
            return <HomeTile key={fav.id} fav={fav} entity={entity} onOpen={() => entity && onOpen(entity, false)} onRemove={() => onRemove(fav)} />;
          })}
        </div>
      )}
    </div>
  );
}

/** Passive "updates available" affordance (loading.md): a quiet pill that opens a
    popover listing what changed. Never auto-applies — the swap happens only on accept. */
function UpdateBanner({ update, onApply, onDismiss }: { update: RegistryUpdate; onApply: () => void; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  const { added, changed, removed } = update.summary;
  const n = added.length + changed.length + removed.length;

  const line = (label: string, names: string[], color: string) =>
    names.length === 0 ? null : (
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span style={{ font: "var(--type-caption)", color, flex: "none", width: 52 }}>{label}</span>
        <span style={{ font: "var(--type-caption)", color: "var(--fg-2)" }}>{names.join(", ")}</span>
      </div>
    );

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px",
          borderRadius: "var(--radius-pill)", cursor: "pointer",
          background: "var(--glass-fill-strong)", border: "1px solid var(--glass-stroke)",
          backdropFilter: "blur(var(--blur-sm))", WebkitBackdropFilter: "blur(var(--blur-sm))",
          boxShadow: "var(--shadow-1)", font: "var(--type-label)", color: "var(--fg-1)",
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", animation: "tbPulse 1.6s var(--ease-in-out) infinite" }} />
        <Icon name="download" size={15} />
        {n} update{n === 1 ? "" : "s"} available
      </button>

      {open && (
        <Glass elevation="popover" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 308, padding: 16, display: "flex", flexDirection: "column", gap: 12, animation: "tbFade var(--dur-base) var(--ease-out)" }}>
          <div style={{ font: "var(--type-label)", color: "var(--fg-1)" }}>Tools changed upstream</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {line("New", added, "var(--ok)")}
            {line("Updated", changed, "var(--accent)")}
            {line("Removed", removed, "var(--danger)")}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
            <Button variant="primary" size="sm" iconLeft={<Icon name="check" size={15} />} onClick={() => { setOpen(false); onApply(); }} style={{ flex: 1 }}>
              Update now
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setOpen(false); onDismiss(); }}>
              Dismiss
            </Button>
          </div>
          <div style={{ font: "var(--type-caption)", color: "var(--fg-4)" }}>
            Pinned to {update.pin.slice(0, 11)} · applied only when you accept
          </div>
        </Glass>
      )}
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  // one LoadedRegistry per loaded source spec; the merged view is derived. Starts empty
  // — there are no default tools, only repos the user loads (favourites, discovery, …).
  const [regs, setRegs] = useState<Record<string, LoadedRegistry>>({});
  const [booted, setBooted] = useState(false);
  const [favourites, setFavourites] = useState<Favourite[]>(() => loadFavourites());
  const [panes, setPanes] = useState<Pane[]>([]);
  const [sizes, setSizes] = useState<number[]>([]);
  const [wires, setWires] = useState<Wire[]>([]);
  // pane whose tool frame should grab keyboard focus — set on open so the user
  // can type into a freshly-summoned tool without clicking it first. (A future
  // setting could gate this: always focus the opened tool, or never — keeping
  // focus where it was.)
  const [focusUid, setFocusUid] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteState>(false);
  const [trust, setTrust] = useState<TrustState | null>(null);
  const [update, setUpdate] = useState<RegistryUpdate | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: "info" | "success" | "error" }[]>([]);

  const pushToast = useCallback((message: string, tone: "info" | "success" | "error") => {
    const id = UID++;
    setToasts((ts) => [...ts, { id, message, tone }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3200);
  }, []);

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);

  // derived read-models over the loaded repos
  const registry = useMemo(() => mergeAll(regs), [regs]);
  const entityById = useMemo(() => new Map(registry.all.map((e) => [e.id, e])), [registry]);
  // which source each entity came from — needed to record a favourite's reload pointer
  const sourceById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [src, r] of Object.entries(regs)) for (const e of r.all) m[e.id] = src;
    return m;
  }, [regs]);
  const favIds = useMemo(() => new Set(favourites.map((f) => f.id)), [favourites]);

  // boot: there's no default registry — reload the repos behind the user's favourites
  // (the home screen) so their tiles resolve. Each source is independent; one failing
  // (private without a token, offline) just leaves its tiles "unavailable", never blocks.
  useEffect(() => {
    let live = true;
    const sources = [...new Set(loadFavourites().map((f) => f.source))];
    if (sources.length === 0) { setBooted(true); return; }
    Promise.all(
      sources.map((s) =>
        loadRegistry(s, (i) => console.warn(`[toolboy] skipped "${i.id}": ${i.reason}`))
          .then((r) => [s, r] as const)
          .catch((err) => { console.warn(`[toolboy] couldn't load ${s}:`, err instanceof Error ? err.message : err); return null; }),
      ),
    ).then((results) => {
      if (!live) return;
      const map: Record<string, LoadedRegistry> = {};
      for (const r of results) if (r) map[r[0]] = r[1];
      setRegs(map);
      setBooted(true);
    });
    return () => { live = false; };
  }, []);

  // background revalidation (loading.md): while online + visible, poll the source's
  // mutable pointer for something newer than the pinned bytes we're running. A hit is
  // surfaced passively via UpdateBanner; it's never applied until the user accepts.
  const updatePin = useRef<string | null>(null);   // pin currently surfaced (don't re-set it)
  const dismissedPin = useRef<string | null>(null); // pin the user waved off (don't re-prompt)
  const polling = useRef(false);                    // in-flight guard — no overlapping polls
  useEffect(() => { updatePin.current = update?.pin ?? null; }, [update]);
  useEffect(() => {
    const sources = Object.keys(regs);
    if (sources.length === 0) return;
    let live = true;
    const poll = async () => {
      if (polling.current || !navigator.onLine || document.visibilityState !== "visible") return;
      polling.current = true;
      try {
        // each loaded repo is polled independently; surface the first update found and
        // let the user act on it before checking the rest (one banner at a time).
        for (const s of sources) {
          const found = await revalidate(regs[s], (i) => console.warn(`[toolboy] update skipped "${i.id}": ${i.reason}`));
          if (!live || !found) continue;
          if (found.pin === dismissedPin.current || found.pin === updatePin.current) continue;
          setUpdate(found);
          break;
        }
      } catch (err) {
        console.warn("[toolboy] revalidate failed:", err instanceof Error ? err.message : err);
      } finally {
        polling.current = false;
      }
    };
    const id = window.setInterval(poll, 5 * 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") poll(); };
    window.addEventListener("online", poll);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      window.clearInterval(id);
      window.removeEventListener("online", poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [regs]);

  const applyUpdate = useCallback(async () => {
    if (!update) return;
    await update.commit();          // promote the new pointer so the next boot starts here
    dismissedPin.current = null;
    // swap in the prepared, bundle-verified registry for just that source
    setRegs((prev) => ({ ...prev, [update.registry.source]: update.registry }));
    setUpdate(null);
    pushToast("Tools updated", "success");
  }, [update, pushToast]);

  const dismissUpdate = useCallback(() => {
    if (update) dismissedPin.current = update.pin;
    setUpdate(null);
  }, [update]);

  // ⌘K toggles the palette. A focused tool frame swallows this keydown, so the
  // frame runtime forwards it back over the bridge as a "cmd-k" hotkey — both
  // paths land here so the shortcut works whether the host or a tool has focus.
  const togglePalette = useCallback(() => setPalette((p) => (p ? false : "open")), []);
  const onToolHotkey = useCallback((combo: string) => {
    if (combo === "cmd-k") togglePalette();
  }, [togglePalette]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePalette]);

  const openSingle = useCallback((toolId: string) => {
    const p = mkPane(toolId);
    setPanes([p]); setSizes([100]); setWires([]); setFocusUid(p.uid);
  }, []);

  const addPane = useCallback((toolId: string) => {
    const p = mkPane(toolId);
    setPanes((ps) => { const next = [...ps, p]; setSizes(equalize(next.length)); return next; });
    setFocusUid(p.uid);
  }, []);

  const openToolchain = useCallback((chain: Extract<Entity, { kind: "toolchain" }>) => {
    const ps = chain.tools.map((t) => mkPane(t.toolId));
    const uidByInstance: Record<string, string> = {};
    chain.tools.forEach((t, i) => { uidByInstance[t.instance] = ps[i].uid; });
    const ws: Wire[] = chain.wires.map((w) => ({ from: uidByInstance[w.from], fromPort: w.fromPort, to: uidByInstance[w.to], toPort: w.toPort }));
    setPanes(ps); setSizes(equalize(ps.length)); setWires(ws);
    if (ps.length) setFocusUid(ps[0].uid); // focus the head of the scene
  }, []);

  // shared open path: trust-gate an entity against a registry, then open/split it.
  // Used by both the local palette pick and the discovered-entity flow.
  const runOpen = useCallback((entity: Entity, reg: MergedRegistry, split: boolean) => {
    const doOpen = () => {
      if (entity.kind === "toolchain") { openToolchain(entity); return; }
      if (split) addPane(entity.id); else openSingle(entity.id);
    };
    // trust gate: public entities, toolchains, or anything needing secrets
    const perms: Perms | AggPerms = entity.kind === "toolchain" ? aggregatePerms(entity, reg.toolsById) : entity.perms;
    const needsTrust = entity.origin === "public" || entity.kind === "toolchain" || (perms.secrets && perms.secrets.length > 0);
    if (needsTrust) {
      setTrust({
        subject: { name: entity.name, kind: entity.kind, origin: entity.origin, toolCount: entity.kind === "toolchain" ? entity.tools.length : 0 },
        perms,
        secretsNeeded: perms.secrets || [],
        action: doOpen,
      });
    } else {
      doOpen();
    }
  }, [openSingle, addPane, openToolchain]);

  // pick from palette / home
  const pick = useCallback((entity: Entity, split: boolean) => {
    if (!booted) return;
    setPalette((cur) => {
      const splitFrom = typeof cur === "object" && cur && "splitFrom" in cur;
      runOpen(entity, registry, splitFrom || split);
      return false; // close palette
    });
  }, [booted, registry, runOpen]);

  // pin/unpin an entity to the home screen. `sourceById` tells us which repo to record
  // so the favourite can be reloaded at boot; removal needs no source.
  const toggleFav = useCallback((entity: { id: string; name: string; icon: string; kind: "tool" | "toolchain" }) => {
    setFavourites((favs) => {
      const next = toggleFavourite(favs, entity, sourceById[entity.id]);
      saveFavourites(next);
      return next;
    });
  }, [sourceById]);

  // pick a discovered entity: load its source repo through the normal loader (the
  // index is a finder, not a trust shortcut), add it, then open via the trust gate
  const pickDiscovered = useCallback(async (card: DiscoveryCard) => {
    if (!booted) return;
    setPalette(false);
    pushToast(`Loading ${card.name} from ${card.repoName}…`, "info");
    try {
      const reg = await loadRegistry(card.source);
      const entity = reg.all.find((e) => e.id === card.id);
      if (!entity) { pushToast(`Couldn't find “${card.name}” in ${card.repoName}`, "error"); return; }
      setRegs((prev) => ({ ...prev, [reg.source]: reg }));
      runOpen(entity, reg, false);
    } catch (err) {
      pushToast(`Couldn't load “${card.name}”: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }, [booted, runOpen, pushToast]);

  // load an arbitrary gh: source typed straight into the palette (private repos need
  // VITE_GITHUB_TOKEN). Same trust path as discovery: load → add → open the first
  // entity through the trust gate; the rest join the registry for later search.
  const loadSource = useCallback(async (source: string) => {
    if (!booted) return;
    setPalette(false);
    pushToast(`Loading ${source}…`, "info");
    try {
      const reg = await loadRegistry(source);
      if (reg.all.length === 0) { pushToast(`No tools found in ${reg.repoName || source}`, "error"); return; }
      setRegs((prev) => ({ ...prev, [reg.source]: reg }));
      pushToast(`Loaded ${reg.all.length} from ${reg.repoName}`, "info");
      runOpen(reg.all[0], reg, false);
    } catch (err) {
      pushToast(`Couldn't load ${source}: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }, [booted, runOpen, pushToast]);

  const onOutput = useCallback((uid: string, port: string, value: unknown) => {
    setPanes((ps) => {
      const targets = wires.filter((w) => w.from === uid && w.fromPort === port).map((w) => w.toPort && { uid: w.to, port: w.toPort });
      return ps.map((p) => {
        let np = p;
        if (np.uid === uid) np = { ...np, lastOutputs: { ...np.lastOutputs, [port]: value } };
        const t = targets.find((t) => t && t.uid === np.uid);
        if (t) np = { ...np, inputs: { ...np.inputs, [t.port]: value } };
        return np;
      });
    });
  }, [wires]);

  const onSend = useCallback((fromUid: string, fromPort: string, toUid: string, toPort: string) => {
    if (wouldCycle(wires, fromUid, toUid)) { pushToast("That wire would create a loop", "error"); return; }
    setWires((ws) =>
      ws.some((w) => w.from === fromUid && w.fromPort === fromPort && w.to === toUid && w.toPort === toPort)
        ? ws
        : [...ws, { from: fromUid, fromPort, to: toUid, toPort }],
    );
    setPanes((ps) => {
      const src = ps.find((p) => p.uid === fromUid);
      // only seed when the source already has a real value on that port — never
      // fabricate a placeholder that violates the target port's declared type
      const seed = src ? src.lastOutputs[fromPort] : undefined;
      if (seed === undefined) return ps;
      return ps.map((p) => (p.uid === toUid ? { ...p, inputs: { ...p.inputs, [toPort]: seed } } : p));
    });
  }, [wires, pushToast]);

  const closePane = useCallback((uid: string) => {
    setPanes((ps) => { const next = ps.filter((p) => p.uid !== uid); setSizes(equalize(next.length)); return next; });
    setWires((ws) => ws.filter((w) => w.from !== uid && w.to !== uid));
  }, []);

  const home = panes.length === 0;

  return (
    <div className="tb-ambient" style={{ position: "fixed", inset: 0, overflow: "hidden", fontFamily: "var(--font-sans)" }}>
      {/* corner: app mark */}
      <div style={{ position: "absolute", top: 18, left: 20, display: "flex", alignItems: "center", gap: 9, zIndex: "var(--z-header)" } as CSSProperties}>
        <img src={markUrl} width={26} height={26} alt="" style={{ cursor: "pointer" }} onClick={() => { setPanes([]); setWires([]); }} />
        {booted && !home && <span style={{ font: "var(--type-label)", color: "var(--fg-2)" }}>toolboy</span>}
      </div>

      {/* corner: theme */}
      {booted && (
        <div style={{ position: "absolute", top: 16, right: 18, display: "flex", alignItems: "center", gap: 10, zIndex: "var(--z-header)" } as CSSProperties}>
          {update && <UpdateBanner update={update} onApply={applyUpdate} onDismiss={dismissUpdate} />}
          <IconButton label="Open command palette" onClick={() => setPalette("open")}><Icon name="command" size={17} /></IconButton>
          <IconButton label="Toggle theme" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
          </IconButton>
        </div>
      )}

      {/* surface body */}
      {!booted ? (
        <BootSurface />
      ) : home ? (
        <HomeSurface favourites={favourites} entityById={entityById} onOpen={pick} onRemove={toggleFav} />
      ) : (
        <div style={{ position: "absolute", inset: 0, padding: "62px 20px 20px", boxSizing: "border-box" }}>
          <SplitSurface
            panes={panes}
            toolsById={registry.toolsById}
            wires={wires}
            sizes={sizes}
            focusUid={focusUid}
            favIds={favIds}
            onToggleFav={toggleFav}
            onResize={setSizes}
            onClose={closePane}
            onSplit={(uid) => setPalette({ splitFrom: uid })}
            onSend={onSend}
            onOutput={onOutput}
            theme={theme}
            onToast={pushToast}
            onHotkey={onToolHotkey}
          />
        </div>
      )}

      {palette && booted && <Palette entities={registry.all} favIds={favIds} onClose={() => setPalette(false)} onPick={pick} onToggleFav={toggleFav} onPickDiscovered={pickDiscovered} onLoadSource={loadSource} />}

      {trust && (
        <TrustDialog
          subject={trust.subject}
          perms={trust.perms}
          secretsNeeded={trust.secretsNeeded}
          onCancel={() => setTrust(null)}
          onGrant={(secrets) => {
            // persist entered secrets into the host keyring before running — the host
            // injects them into ctx.net requests; tool code never sees them
            Object.entries(secrets).forEach(([name, value]) => { if (value) keyring.set(name, value); });
            const a = trust.action; setTrust(null); a?.();
          }}
        />
      )}

      {/* ctx.ui.toast — host chrome, drawn outside any tool frame */}
      {toasts.length > 0 && (
        <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 8, zIndex: "var(--z-popover)", alignItems: "center" } as CSSProperties}>
          {toasts.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 14px", borderRadius: "var(--radius-pill)", background: "var(--glass-fill)", border: "1px solid var(--glass-stroke)", backdropFilter: "blur(var(--blur-md))", boxShadow: "var(--shadow-2)", font: "var(--type-caption)", color: "var(--fg-1)", animation: "tbFade var(--dur-base) var(--ease-out)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: t.tone === "error" ? "var(--danger)" : t.tone === "success" ? "var(--ok)" : "var(--accent)" }} />
              {t.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
