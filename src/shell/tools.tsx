/* toolboy surface — tool interiors. Some match the glass language (authored for
   toolboy); "foreign" ones deliberately do NOT — they're sandboxed, authored by
   anyone, and must still sit gracefully inside the shell frame. */
import { useEffect, useState } from "react";
import type { Tool } from "./types";

type OnOutput = (value: unknown) => void;

// ---- NATIVE: Color Picker (provides x-toolboy/color) ----
function ColorTool({ onOutput }: { onOutput?: OnOutput }) {
  const swatches = ["#3D7FFF", "#22B07D", "#E6A23C", "#E0556B", "#8B5CF6", "#16B1C9"];
  const [c, setC] = useState("#3D7FFF");
  useEffect(() => { onOutput?.(c); }, [c]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16, height: "100%", boxSizing: "border-box" }}>
      <div style={{ height: 86, borderRadius: "var(--radius-lg)", background: c, boxShadow: "var(--shadow-2)", border: "1px solid var(--glass-stroke)" }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {swatches.map((s) => (
          <button key={s} onClick={() => setC(s)} style={{ width: 34, height: 34, borderRadius: "var(--radius-sm)", background: s, cursor: "pointer", border: c === s ? "2px solid var(--fg-1)" : "1px solid var(--glass-stroke)", boxShadow: "var(--shadow-1)" }} />
        ))}
      </div>
      <div style={{ font: "var(--type-mono)", color: "var(--fg-2)", marginTop: "auto" }}>{c.toUpperCase()} · x-toolboy/color</div>
    </div>
  );
}

// ---- NATIVE: Fetcher ----
function FetcherTool({ onOutput }: { onOutput?: OnOutput }) {
  const url = "api.github.com/repos/matviibot/toolboy";
  return (
    <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14, height: "100%", boxSizing: "border-box" }}>
      <div className="tb-inset" style={{ padding: "11px 13px", font: "var(--type-mono-sm)", color: "var(--fg-2)", background: "var(--glass-fill-inset)", border: "1px solid var(--glass-stroke-lo)", borderRadius: "var(--radius-md)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.18)" }}>GET {url}</div>
      <button onClick={() => onOutput?.({ stars: 128, name: "toolboy", open_issues: 7 })}
        style={{ alignSelf: "flex-start", padding: "9px 15px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", font: "var(--weight-medium) var(--text-base) var(--font-sans)", boxShadow: "var(--shadow-2)" }}>Run request</button>
      <div style={{ font: "var(--type-caption)", color: "var(--fg-3)", marginTop: "auto" }}>Emits application/json on its output port.</div>
    </div>
  );
}

// ---- NATIVE: jq ----
function JqTool({ input, onOutput }: { input?: unknown; onOutput?: OnOutput }) {
  const [q, setQ] = useState(".name");
  const inObj = input && typeof input === "object" ? (input as Record<string, unknown>) : { name: "toolboy", stars: 128, open_issues: 7 };
  const result = q === ".name" ? inObj.name : q === ".stars" ? inObj.stars : inObj;
  useEffect(() => { onOutput?.(result); }, [q, JSON.stringify(inObj)]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12, height: "100%", boxSizing: "border-box" }}>
      <input value={q} onChange={(e) => setQ(e.target.value)}
        style={{ padding: "10px 13px", font: "var(--type-mono)", color: "var(--fg-1)", outline: "none", borderRadius: "var(--radius-md)", background: "var(--glass-fill-inset)", border: "1px solid var(--glass-stroke-lo)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.18)" }} />
      <pre style={{ margin: 0, padding: 13, flex: 1, overflow: "auto", font: "var(--type-mono-sm)", color: "var(--accent)", background: "var(--glass-fill-inset)", border: "1px solid var(--glass-stroke-lo)", borderRadius: "var(--radius-md)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.18)" }}>{JSON.stringify(result, null, 2)}</pre>
    </div>
  );
}

// ---- NATIVE: JSON View ----
function JsonViewTool({ input }: { input?: unknown }) {
  const obj = input ?? { waiting: "wire an input →" };
  return (
    <div style={{ padding: 22, height: "100%", boxSizing: "border-box" }}>
      <pre style={{ margin: 0, padding: 14, height: "100%", boxSizing: "border-box", overflow: "auto", font: "var(--type-mono-sm)", color: "var(--fg-1)", background: "var(--glass-fill-inset)", border: "1px solid var(--glass-stroke-lo)", borderRadius: "var(--radius-md)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.18)" }}>{JSON.stringify(obj, null, 2)}</pre>
    </div>
  );
}

// ---- FOREIGN: Summarize (looks like someone else's app — warm, serif, light) ----
function ForeignSummarize({ input }: { input?: unknown }) {
  const text = typeof input === "string" ? input : "Paste or wire text to summarize.";
  return (
    <div style={{ height: "100%", boxSizing: "border-box", background: "#fbf7ef", color: "#2b2622", fontFamily: "Georgia, 'Times New Roman', serif", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>✶ Summarize</div>
      <div style={{ borderTop: "2px solid #e3d9c6", paddingTop: 12, fontSize: 15, lineHeight: 1.6, color: "#5c5346" }}>{text}</div>
      <button style={{ alignSelf: "flex-start", marginTop: "auto", background: "#2b2622", color: "#fbf7ef", border: "none", padding: "10px 18px", borderRadius: 2, fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>Generate summary →</button>
      <div style={{ fontSize: 11, color: "#9b8e78", fontFamily: "monospace" }}>foreign UI · sandboxed · matvii/shared</div>
    </div>
  );
}

// ---- FOREIGN: Regex Lab (neon dark terminal look) ----
function ForeignRegex({ input }: { input?: unknown }) {
  return (
    <div style={{ height: "100%", boxSizing: "border-box", background: "#0a0e0a", color: "#7CFFB2", fontFamily: "'Courier New', monospace", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ color: "#5BE0FF", fontSize: 13 }}>// regex-lab v2 — sandboxed</div>
      <div style={{ border: "1px solid #1f3a28", padding: "8px 10px", borderRadius: 4, background: "#0d140d" }}>/(\w+)@(\w+)/g</div>
      <div style={{ fontSize: 13, lineHeight: 1.7 }}>
        <div>matched: <span style={{ color: "#FFE45B" }}>3</span></div>
        <div style={{ color: "#4f7a5e" }}>{(typeof input === "string" ? input : "user@toolboy host@local").slice(0, 60)}</div>
      </div>
      <div style={{ marginTop: "auto", color: "#3a5a44", fontSize: 11 }}>acme/scenes · looks nothing like toolboy</div>
    </div>
  );
}

export function ToolInterior({ tool, input, onOutput }: { tool: Tool; input?: unknown; onOutput?: OnOutput }) {
  switch (tool.interior) {
    case "color": return <ColorTool onOutput={onOutput} />;
    case "fetcher": return <FetcherTool onOutput={onOutput} />;
    case "jq": return <JqTool input={input} onOutput={onOutput} />;
    case "jsonview": return <JsonViewTool input={input} />;
    case "foreign": return <ForeignSummarize input={input} />;
    case "foreign2": return <ForeignRegex input={input} />;
    default: return <div style={{ padding: 22, color: "var(--fg-3)" }}>—</div>;
  }
}
