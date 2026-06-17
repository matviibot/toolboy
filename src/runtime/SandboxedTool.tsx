/* toolboy runtime — React host for a single sandboxed tool.

   Renders the iframe, wires a ToolBridge to it on load, and translates the
   shell's prop-based data flow (input down, onOutput up) into bus messages over
   the boundary. The srcdoc is memoized per tool so input/theme changes travel
   over the port — re-rendering srcdoc would reload the frame and wipe its state. */
import { useEffect, useMemo, useRef } from "react";
import { ToolBridge } from "./host";
import { buildSrcdoc } from "./srcdoc";
import type { ThemePayload } from "./protocol";
import type { Tool } from "../shell/types";

/** color/radius/shadow tokens forwarded into the frame so toolboy-native tools
    match the glass look. Fonts are intentionally excluded (see srcdoc.ts). */
const THEME_TOKENS = [
  "--accent", "--accent-soft", "--accent-faint", "--accent-strong",
  "--fg-1", "--fg-2", "--fg-3", "--fg-4",
  "--glass-fill-inset", "--glass-fill-strong", "--glass-stroke", "--glass-stroke-lo",
  "--radius-xs", "--radius-sm", "--radius-md", "--radius-lg",
  "--shadow-1", "--shadow-2", "--ok", "--warn",
];

function readThemeVars(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const vars: Record<string, string> = {};
  for (const t of THEME_TOKENS) {
    const v = cs.getPropertyValue(t).trim();
    if (v) vars[t] = v;
  }
  return vars;
}

export interface SandboxedToolProps {
  tool: Tool;
  /** latest value per input port id */
  inputs: Record<string, unknown>;
  theme: "dark" | "light";
  onOutput: (port: string, value: unknown) => void;
  onToast: (message: string, tone: "info" | "success" | "error") => void;
}

export function SandboxedTool({ tool, inputs, theme, onOutput, onToast }: SandboxedToolProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<ToolBridge | null>(null);
  // last value sent per port, so we only forward genuine changes (not re-renders)
  const sentRef = useRef<Record<string, unknown>>({});

  const srcDoc = useMemo(() => buildSrcdoc(tool.source || "/* missing tool source */"), [tool.source]);

  // latest callbacks/inputs without re-running the bridge-setup effect
  const onOutputRef = useRef(onOutput);
  const onToastRef = useRef(onToast);
  const inputsRef = useRef(inputs);
  const themeRef = useRef(theme);
  onOutputRef.current = onOutput;
  onToastRef.current = onToast;
  inputsRef.current = inputs;
  themeRef.current = theme;

  // build the bridge once the frame document has loaded; tear down on unmount/reload
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    function attach() {
      bridgeRef.current?.dispose();
      sentRef.current = {};
      const themePayload: ThemePayload = { name: themeRef.current, vars: readThemeVars() };
      const bridge = new ToolBridge(iframe!, {
        toolId: tool.id,
        visibility: tool.origin === "public" ? "public" : "private",
        perms: tool.perms,
        theme: themePayload,
        onOutput: (port, v) => onOutputRef.current(port, v),
        onToast: (m, t) => onToastRef.current(m, t),
      });
      bridgeRef.current = bridge;
      // flush whatever inputs the pane already holds (e.g. seeded by a wire)
      for (const [port, value] of Object.entries(inputsRef.current)) {
        bridge.sendInput(port, value);
        sentRef.current[port] = value;
      }
    }

    iframe.addEventListener("load", attach);
    return () => {
      iframe.removeEventListener("load", attach);
      bridgeRef.current?.dispose();
      bridgeRef.current = null;
    };
  }, [tool.id, srcDoc]);

  // input changes flow over the port, not by reloading the frame; only forward
  // ports whose value actually changed since we last sent it
  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    for (const [port, value] of Object.entries(inputs)) {
      if (sentRef.current[port] !== value) {
        bridge.sendInput(port, value);
        sentRef.current[port] = value;
      }
    }
  }, [inputs]);

  // theme toggle re-pushes tokens to the live frame
  useEffect(() => {
    bridgeRef.current?.sendTheme(readThemeVars());
  }, [theme]);

  return (
    <iframe
      ref={iframeRef}
      title={tool.name}
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      // the frame is a replaced element in the host document: prohibit it from
      // being caught in a host-side selection (e.g. while dragging a wire or a
      // divider across it). This is scoped to the host doc and does not affect
      // text selection inside the tool's own document.
      style={{ width: "100%", height: "100%", border: "none", display: "block", background: "transparent", userSelect: "none", WebkitUserSelect: "none" }}
    />
  );
}
