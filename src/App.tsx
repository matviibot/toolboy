/* toolboy surface — App orchestrator. Owns theme, panes, wires, palette, and the
   trust chrome. Entities are loaded from a git manifest (toolboy.json) at boot —
   the registry is the source of truth, not a hardcoded dataset. Home → palette →
   tool / toolchain → split → wire → trust. */
import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Glass, IconButton, Kbd, Icon } from "./components";
import markUrl from "./assets/logo/toolboy-mark.svg";
import { aggregatePerms, loadRegistry, type LoadedRegistry, type LoadIssue } from "./loader/load";
import type { AggPerms, Entity, Pane, Perms, Wire } from "./shell/types";
import { Palette } from "./shell/Palette";
import { SplitSurface } from "./shell/Panes";
import { TrustDialog, type TrustSubject } from "./shell/Trust";

/** the manifest the app boots from — the bundled demo registry, served same-origin */
const BOOT_SOURCE = "self";

let UID = 1;
const mkPane = (toolId: string, input: unknown = null): Pane => ({ uid: "p" + UID++, toolId, input, lastOutput: null });
const equalize = (n: number) => Array(n).fill(100 / n) as number[];

type PaletteState = false | "open" | { splitFrom: string };

interface TrustState {
  subject: TrustSubject;
  perms: Perms | AggPerms;
  secretsNeeded: string[];
  action: () => void;
}

function BootSurface({ error }: { error: string | null }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
      <img src={markUrl} width={64} height={64} alt="toolboy" style={{ filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.35))", animation: error ? "none" : "tbPulse 1.6s var(--ease-in-out) infinite" }} />
      <div style={{ font: "var(--type-body)", color: error ? "var(--danger)" : "var(--fg-3)", textAlign: "center", maxWidth: 420 }}>
        {error ? `Couldn't load your toolbox — ${error}` : "Loading your toolbox…"}
      </div>
    </div>
  );
}

function HomeSurface({ entities, onOpen }: { entities: Entity[]; onOpen: (e: Entity, split: boolean) => void }) {
  const pinned = entities.slice(0, 6);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, animation: "tbFade var(--dur-slow) var(--ease-out)" }}>
      <img src={markUrl} width={76} height={76} alt="toolboy" style={{ filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.35))" }} />
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ font: "var(--type-display)", fontSize: 44, letterSpacing: "var(--tracking-tight)", color: "var(--fg-1)" }}>toolboy</div>
        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, font: "var(--type-body)", color: "var(--fg-3)" }}>
          Press <Kbd>⌘</Kbd><Kbd>K</Kbd> to summon a tool
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap", justifyContent: "center", maxWidth: 620 }}>
        {pinned.map((e) => (
          <Glass key={e.id} elevation="card" origin={e.origin === "public" ? "public" : undefined}
            onClick={() => onOpen(e, false)}
            style={{ width: 138, padding: 14, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, transition: "transform var(--dur-fast) var(--ease-out)" }}
            onMouseEnter={(ev) => (ev.currentTarget.style.transform = "translateY(-3px)")}
            onMouseLeave={(ev) => (ev.currentTarget.style.transform = "translateY(0)")}>
            <span style={{ display: "inline-grid", placeItems: "center", width: 32, height: 32, borderRadius: "var(--radius-sm)", background: e.origin === "public" ? "var(--public-soft)" : "var(--accent-soft)", color: e.origin === "public" ? "var(--public)" : "var(--accent)" }}>
              <Icon name={e.icon} size={17} />
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ font: "var(--type-label)", color: "var(--fg-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
              <span style={{ font: "var(--type-caption)", color: "var(--fg-4)" }}>{e.kind === "toolchain" ? "scene · " + e.tools.length : "tool"}</span>
            </div>
          </Glass>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [registry, setRegistry] = useState<LoadedRegistry | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [panes, setPanes] = useState<Pane[]>([]);
  const [sizes, setSizes] = useState<number[]>([]);
  const [wires, setWires] = useState<Wire[]>([]);
  const [palette, setPalette] = useState<PaletteState>(false);
  const [trust, setTrust] = useState<TrustState | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: "info" | "success" | "error" }[]>([]);

  const pushToast = useCallback((message: string, tone: "info" | "success" | "error") => {
    const id = UID++;
    setToasts((ts) => [...ts, { id, message, tone }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3200);
  }, []);

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);

  // boot: load the registry from its git manifest
  useEffect(() => {
    let live = true;
    const issues: LoadIssue[] = [];
    loadRegistry(BOOT_SOURCE, (i) => issues.push(i))
      .then((reg) => {
        if (!live) return;
        setRegistry(reg);
        issues.forEach((i) => console.warn(`[toolboy] skipped "${i.id}": ${i.reason}`));
      })
      .catch((err) => { if (live) setBootError(err instanceof Error ? err.message : String(err)); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => (p ? false : "open"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openSingle = useCallback((toolId: string, input: unknown) => {
    setPanes([mkPane(toolId, input)]); setSizes([100]); setWires([]);
  }, []);

  const addPane = useCallback((toolId: string) => {
    setPanes((ps) => { const next = [...ps, mkPane(toolId)]; setSizes(equalize(next.length)); return next; });
  }, []);

  const openToolchain = useCallback((chain: Extract<Entity, { kind: "toolchain" }>) => {
    const ps = chain.tools.map((tid) => mkPane(tid, null));
    const idByTool: Record<string, string> = {};
    chain.tools.forEach((tid, i) => { idByTool[tid] = ps[i].uid; });
    const ws: Wire[] = chain.wires.map(([a, b]) => ({ from: idByTool[a], to: idByTool[b] }));
    setPanes(ps); setSizes(equalize(ps.length)); setWires(ws);
  }, []);

  // pick from palette / home
  const pick = useCallback((entity: Entity, split: boolean) => {
    if (!registry) return;
    setPalette((cur) => {
      const splitFrom = typeof cur === "object" && cur && "splitFrom" in cur;
      const doOpen = () => {
        if (entity.kind === "toolchain") { openToolchain(entity); return; }
        if (splitFrom || split) addPane(entity.id); else openSingle(entity.id, null);
      };
      // trust gate: public entities, toolchains, or anything needing secrets
      const perms: Perms | AggPerms = entity.kind === "toolchain" ? aggregatePerms(entity, registry.toolsById) : entity.perms;
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
      return false; // close palette
    });
  }, [registry, openSingle, addPane, openToolchain]);

  const onOutput = useCallback((uid: string, value: unknown) => {
    setPanes((ps) => {
      const downstream = wires.filter((w) => w.from === uid).map((w) => w.to);
      return ps.map((p) => {
        if (p.uid === uid) return { ...p, lastOutput: value };
        if (downstream.includes(p.uid)) return { ...p, input: value };
        return p;
      });
    });
  }, [wires]);

  const onSend = useCallback((fromUid: string, toUid: string) => {
    setWires((ws) => (ws.some((w) => w.from === fromUid && w.to === toUid) ? ws : [...ws, { from: fromUid, to: toUid }]));
    setPanes((ps) => {
      const src = ps.find((p) => p.uid === fromUid);
      const seed = src && src.lastOutput != null ? src.lastOutput : { from: src && registry ? registry.toolsById[src.toolId]?.name ?? "?" : "?" };
      return ps.map((p) => (p.uid === toUid ? { ...p, input: seed } : p));
    });
  }, [registry]);

  const closePane = useCallback((uid: string) => {
    setPanes((ps) => { const next = ps.filter((p) => p.uid !== uid); setSizes(equalize(next.length)); return next; });
    setWires((ws) => ws.filter((w) => w.from !== uid && w.to !== uid));
  }, []);

  const booted = !!registry;
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
          <IconButton label="Open command palette" onClick={() => setPalette("open")}><Icon name="command" size={17} /></IconButton>
          <IconButton label="Toggle theme" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
          </IconButton>
        </div>
      )}

      {/* surface body */}
      {!booted ? (
        <BootSurface error={bootError} />
      ) : home ? (
        <HomeSurface entities={registry.all} onOpen={pick} />
      ) : (
        <div style={{ position: "absolute", inset: 0, padding: "62px 20px 20px", boxSizing: "border-box" }}>
          <SplitSurface
            panes={panes}
            toolsById={registry.toolsById}
            wires={wires}
            sizes={sizes}
            onResize={setSizes}
            onClose={closePane}
            onSplit={(uid) => setPalette({ splitFrom: uid })}
            onSend={onSend}
            onOutput={onOutput}
            theme={theme}
            onToast={pushToast}
          />
        </div>
      )}

      {palette && registry && <Palette entities={registry.all} onClose={() => setPalette(false)} onPick={pick} />}

      {trust && (
        <TrustDialog
          subject={trust.subject}
          perms={trust.perms}
          secretsNeeded={trust.secretsNeeded}
          onCancel={() => setTrust(null)}
          onGrant={() => { const a = trust.action; setTrust(null); a?.(); }}
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
