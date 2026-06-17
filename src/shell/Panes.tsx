/* toolboy split surface — one continuous glass plane. Resizable panes with
   draggable dividers and typed half-circle ports on the facing edges: a tool's
   output ports stack low on its right edge, its input ports high on the left edge.
   Wires run through the channel between tools; drag an output nub onto a
   type-compatible input nub to connect. A tool may declare multiple ports — each
   gets its own nub, and wires are qualified by the exact (pane, port) they join. */
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Glass, IconButton, OriginBadge, Icon } from "../components";
import type { Pane, Tool, Wire } from "./types";
import { originColors } from "./origin";
import { SandboxedTool } from "../runtime/SandboxedTool";

/** an output's type can feed an input port when types match (json coerces to text). */
function compatible(outType: string, inType: string): boolean {
  return inType === outType || (outType === "application/json" && inType === "text/plain");
}

interface WirePath { id: string; d: string; x2: number; y2: number; }

/** Node-graph bezier: leaves the output and enters the input horizontally
    (perpendicular to the tools' vertical edges); the bend lives in the channel. */
function curve(x1: number, y1: number, x2: number, y2: number): string {
  const cx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
}

const wireId = (w: Wire) => `${w.from}.${w.fromPort}->${w.to}.${w.toPort}`;
const outNubId = (uid: string, port: string) => `port-out-${uid}-${port}`;
const inNubId = (uid: string, port: string) => `port-in-${uid}-${port}`;

interface LinkDrag { fromUid: string; fromPort: string; type: string; x: number; y: number; }

// ---- port nub (the connection point) — rounded on the gap-facing end only ----
function PortNub({ direction, wired, pulse, target }: { direction: "in" | "out"; wired: boolean; pulse?: boolean; target?: boolean }) {
  const lit = wired || !!target;
  const isOut = direction === "out";
  return (
    <div
      aria-hidden="true"
      style={{
        width: 10,
        height: 18,
        borderRadius: isOut ? "0 5px 5px 0" : "5px 0 0 5px",
        background: lit ? "var(--accent)" : "var(--glass-fill-strong)",
        border: `1px solid ${lit ? "var(--accent)" : "var(--glass-stroke)"}`,
        boxShadow: lit ? "0 0 0 4px var(--accent-faint)" : "var(--shadow-1)",
        WebkitBackdropFilter: "blur(var(--blur-sm))",
        backdropFilter: "blur(var(--blur-sm))",
        transition: "background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
        animation: pulse ? "tbPortPulse 0.6s var(--ease-out)" : "none",
      }}
    />
  );
}

// ---- WireLayer: committed wires + a data pulse that travels on new data ----
function WireLayer({ wires, link, flow, containerRef, tick }: {
  wires: Wire[];
  link: LinkDrag | null;
  flow: Record<string, number>;
  containerRef: React.RefObject<HTMLDivElement>;
  tick: number;
}) {
  const [paths, setPaths] = useState<WirePath[]>([]);
  const [live, setLive] = useState<{ d: string; x2: number; y2: number } | null>(null);

  useLayoutEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const cr = cont.getBoundingClientRect();
    const center = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - cr.left, y: r.top + r.height / 2 - cr.top };
    };

    const next: WirePath[] = [];
    wires.forEach((w) => {
      const a = center(document.getElementById(outNubId(w.from, w.fromPort)));
      const b = center(document.getElementById(inNubId(w.to, w.toPort)));
      if (!a || !b) return;
      next.push({ id: wireId(w), d: curve(a.x, a.y, b.x, b.y), x2: b.x, y2: b.y });
    });
    setPaths(next);

    if (link) {
      const a = center(document.getElementById(outNubId(link.fromUid, link.fromPort)));
      setLive(a ? { d: curve(a.x, a.y, link.x, link.y), x2: link.x, y2: link.y } : null);
    } else {
      setLive(null);
    }
  }, [wires, tick, link]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: "var(--z-wire)", overflow: "visible" } as CSSProperties}>
      {paths.map((p) => (
        <g key={p.id}>
          <path d={p.d} pathLength={1} fill="none" stroke="var(--accent)" strokeWidth="2" strokeOpacity="0.85"
            style={{ filter: "drop-shadow(0 0 4px var(--accent-faint))", strokeDasharray: 1, strokeDashoffset: 0, animation: "tbWireDraw var(--dur-base) var(--ease-out)" }} />
          <circle cx={p.x2} cy={p.y2} r="3.5" fill="var(--accent)" />
          {flow[p.id] ? (
            <path
              key={flow[p.id]}
              d={p.d}
              pathLength={1}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3.5"
              strokeLinecap="round"
              style={{ strokeDasharray: "0.18 2", strokeDashoffset: 0.18, filter: "drop-shadow(0 0 6px var(--accent))", animation: "tbWireFlow 0.55s var(--ease-out) forwards" }}
            />
          ) : null}
        </g>
      ))}
      {live && (
        <g>
          <path d={live.d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeOpacity="0.9"
            strokeDasharray="5 5" style={{ filter: "drop-shadow(0 0 4px var(--accent-faint))" }} />
          <circle cx={live.x2} cy={live.y2} r="4" fill="var(--accent)" />
        </g>
      )}
    </svg>
  );
}

function PaneHeader({ tool, onSplit, onClose, single }: { tool: Tool; onSplit: () => void; onClose: () => void; single: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 10px 9px 13px", borderBottom: "1px solid var(--glass-stroke)", flex: "none" }}>
      <span style={{ display: "inline-grid", placeItems: "center", width: 26, height: 26, borderRadius: "var(--radius-xs)", background: originColors(tool.origin).soft, color: originColors(tool.origin).fg, flex: "none" }}>
        <Icon name={tool.icon} size={15} />
      </span>
      <span style={{ font: "var(--type-label)", color: "var(--fg-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tool.name}</span>
      <OriginBadge origin={tool.origin} style={{ flex: "none" }} />
      <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
        <IconButton label="Split right" size="sm" onClick={onSplit}><Icon name="columns-2" size={15} /></IconButton>
        {!single && <IconButton label="Close" size="sm" onClick={onClose}><Icon name="x" size={15} /></IconButton>}
      </div>
    </div>
  );
}

export interface SplitSurfaceProps {
  panes: Pane[];
  toolsById: Record<string, Tool>;
  wires: Wire[];
  sizes: number[];
  onResize: (sizes: number[]) => void;
  onClose: (uid: string) => void;
  onSplit: (uid: string) => void;
  onSend: (fromUid: string, fromPort: string, toUid: string, toPort: string) => void;
  onOutput: (uid: string, port: string, value: unknown) => void;
  theme: "dark" | "light";
  onToast: (message: string, tone: "info" | "success" | "error") => void;
}

export function SplitSurface({ panes, toolsById, wires, sizes, onResize, onClose, onSplit, onSend, onOutput, theme, onToast }: SplitSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  useEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const ro = new ResizeObserver(bump);
    ro.observe(cont);
    window.addEventListener("resize", bump);
    const r = window.setTimeout(bump, 120);
    return () => { ro.disconnect(); window.removeEventListener("resize", bump); window.clearTimeout(r); };
  }, [panes.length]);

  // ---- data flow: bump a wire's pulse key when fresh data reaches its target port.
  //      Compare input values by REFERENCE (App produces a new value object on each
  //      emit) so we never JSON.stringify large payloads just to drive the animation.
  const prevInputs = useRef<Record<string, unknown>>({});
  const [flow, setFlow] = useState<Record<string, number>>({});
  useEffect(() => {
    const changed = new Set<string>(); // `${uid}:${port}`
    panes.forEach((p) => {
      Object.entries(p.inputs).forEach(([port, val]) => {
        const k = `${p.uid}:${port}`;
        if (k in prevInputs.current && prevInputs.current[k] !== val) changed.add(k);
        prevInputs.current[k] = val;
      });
    });
    if (changed.size) {
      setFlow((f) => {
        const n = { ...f };
        wires.forEach((w) => { if (changed.has(`${w.to}:${w.toPort}`)) n[wireId(w)] = (n[wireId(w)] || 0) + 1; });
        return n;
      });
    }
  }, [panes, wires]);

  // ---- divider drag (resize) — no text/element selection while dragging ----
  // `resizing` mirrors dragRef in state so the tool iframes can drop pointer
  // events mid-resize; otherwise the cursor crossing a tool swallows the
  // window-level mousemove/mouseup and the resize freezes (same as wire drag).
  const dragRef = useRef<{ i: number; x: number; w: number; sizes: number[] } | null>(null);
  const [resizing, setResizing] = useState(false);
  function startDrag(i: number, e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { i, x: e.clientX, w: containerRef.current!.getBoundingClientRect().width, sizes: [...sizes] };
    setResizing(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", endDrag);
  }
  function onDrag(e: MouseEvent) {
    const d = dragRef.current;
    if (!d) return;
    const deltaPct = ((e.clientX - d.x) / d.w) * 100;
    const next = [...d.sizes];
    next[d.i] = Math.max(16, d.sizes[d.i] + deltaPct);
    next[d.i + 1] = Math.max(16, d.sizes[d.i + 1] - deltaPct);
    onResize(next);
    bump();
  }
  function endDrag() {
    dragRef.current = null;
    setResizing(false);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", endDrag);
  }

  // ---- wire drag (connect) — pull from an output nub onto a compatible input ----
  const [link, setLink] = useState<LinkDrag | null>(null);
  const linkRef = useRef<LinkDrag | null>(null);
  function startLink(fromUid: string, fromPort: string, type: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const cr = containerRef.current!.getBoundingClientRect();
    const start: LinkDrag = { fromUid, fromPort, type, x: e.clientX - cr.left, y: e.clientY - cr.top };
    linkRef.current = start;
    setLink(start);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    window.addEventListener("mousemove", onLinkMove);
    window.addEventListener("mouseup", onLinkUp);
  }
  function onLinkMove(e: MouseEvent) {
    const cont = containerRef.current;
    if (!cont || !linkRef.current) return;
    const cr = cont.getBoundingClientRect();
    const cur = { ...linkRef.current, x: e.clientX - cr.left, y: e.clientY - cr.top };
    linkRef.current = cur;
    setLink(cur);
  }
  function onLinkUp(e: MouseEvent) {
    const d = linkRef.current;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tgt = el ? (el.closest("[data-in-uid]") as HTMLElement | null) : null;
    if (d && tgt) {
      const toUid = tgt.getAttribute("data-in-uid")!;
      const toPort = tgt.getAttribute("data-in-port")!;
      const inType = tgt.getAttribute("data-in-type") || "";
      if (toUid !== d.fromUid && compatible(d.type, inType)) onSend(d.fromUid, d.fromPort, toUid, toPort);
    }
    linkRef.current = null;
    setLink(null);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    window.removeEventListener("mousemove", onLinkMove);
    window.removeEventListener("mouseup", onLinkUp);
  }

  const incomingSet = new Set(wires.map((w) => `${w.to}:${w.toPort}`));
  const wiredOutSet = new Set(wires.map((w) => `${w.from}:${w.fromPort}`));

  return (
    <div ref={containerRef} style={{ position: "relative", display: "flex", width: "100%", height: "100%", gap: 0 }}>
      {panes.map((pane, i) => {
        const tool = toolsById[pane.toolId];
        const dragging = !!link && link.fromUid === pane.uid;

        return (
          <Fragment key={pane.uid}>
            {/* wrapper is NOT clipped, so the nubs can sit in the channel */}
            <div style={{ position: "relative", flex: `${sizes[i]} 1 0`, minWidth: 0, display: "flex" }}>
              <Glass elevation="panel" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: "var(--radius-lg)" }}>
                <PaneHeader tool={tool} single={panes.length === 1} onSplit={() => onSplit(pane.uid)} onClose={() => onClose(pane.uid)} />
                {/* While a wire is being dragged OR a divider is being resized,
                    iframes must not capture the pointer — otherwise the cursor
                    crossing a tool swallows the window-level mousemove/mouseup
                    and the drag freezes. */}
                <div style={{ flex: 1, minHeight: 0, overflow: "hidden", pointerEvents: link || resizing ? "none" : undefined }}>
                  <SandboxedTool tool={tool} inputs={pane.inputs} theme={theme} onOutput={(port, v) => onOutput(pane.uid, port, v)} onToast={onToast} />
                </div>
              </Glass>

              {/* INPUT nubs — stacked high on the left edge, each a wire drop target */}
              {tool.ports.accepts.map((inp, idx) => {
                const wired = incomingSet.has(`${pane.uid}:${inp.id}`);
                const isTarget = !!(link && pane.uid !== link.fromUid && compatible(link.type, inp.type));
                return (
                  <div
                    key={inp.id}
                    id={inNubId(pane.uid, inp.id)}
                    data-in-uid={pane.uid}
                    data-in-port={inp.id}
                    data-in-type={inp.type}
                    title={`input · ${inp.id} · ${inp.type}`}
                    style={{
                      position: "absolute", left: -10, top: 26 + idx * 28, zIndex: 50,
                      transform: isTarget ? "scale(1.18)" : "scale(1)",
                      transformOrigin: "left center",
                      transition: "transform var(--dur-fast) var(--ease-out)",
                    }}
                  >
                    <PortNub direction="in" wired={wired} pulse={wired} target={isTarget} />
                  </div>
                );
              })}

              {/* OUTPUT nubs — stacked low on the right edge, drag one onto an input */}
              {tool.ports.provides.map((out, idx) => {
                const wiredOut = wiredOutSet.has(`${pane.uid}:${out.id}`);
                const isDragging = dragging && link!.fromPort === out.id;
                return (
                  <div
                    key={out.id}
                    id={outNubId(pane.uid, out.id)}
                    onMouseDown={(e) => startLink(pane.uid, out.id, out.type, e)}
                    title={`output · ${out.id} · ${out.type} — drag onto an input`}
                    style={{
                      position: "absolute", right: -10, bottom: 26 + idx * 28, zIndex: 50,
                      cursor: isDragging ? "grabbing" : "grab",
                      transform: isDragging ? "scale(1.18)" : "scale(1)",
                      transformOrigin: "right center",
                      transition: "transform var(--dur-fast) var(--ease-out)",
                    }}
                  >
                    <PortNub direction="out" wired={wiredOut || isDragging} />
                  </div>
                );
              })}
            </div>

            {i < panes.length - 1 && (
              <div onMouseDown={(e) => startDrag(i, e)} style={{ width: 12, flex: "none", cursor: "col-resize", display: "grid", placeItems: "center", zIndex: "var(--z-divider)" } as CSSProperties}>
                <div
                  style={{ width: 1, height: "44%", borderRadius: 2, background: "var(--glass-stroke-hi)", transition: "background var(--dur-fast), width var(--dur-fast)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.width = "2px"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--glass-stroke-hi)"; e.currentTarget.style.width = "1px"; }}
                />
              </div>
            )}
          </Fragment>
        );
      })}
      <WireLayer wires={wires} link={link} flow={flow} containerRef={containerRef} tick={tick} />
    </div>
  );
}
