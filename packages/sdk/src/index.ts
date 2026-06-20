/* @toolboy/sdk — the contract a tool is written against.
 *
 * A tool runs inside toolboy's cross-origin sandboxed iframe. The frame runtime
 * (toolboy's src/runtime/frameRuntime.ts) exposes ONE global, `window.toolboy.tool`,
 * and hands your mount function a `ctx` that proxies every capability over a
 * MessagePort to the host. This package is just types + a thin, typed wrapper over
 * that global — there is no runtime dependency; importing it pulls in no code beyond
 * the few lines below. The React flavor lives in `@toolboy/sdk/react`.
 *
 * The shapes here mirror the live protocol (toolboy's src/runtime/protocol.ts); keep
 * them in lockstep if the boundary changes.
 */

/** Per-tool key/value store, namespaced to your tool, backed by IndexedDB on the host. */
export interface ToolStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** Secrets are existence-only. The raw value NEVER crosses into tool code — declare it
    in your manifest's `permissions.net[].inject` and the host injects it into the
    matching outbound request. `has` is for branching UI ("connect a key" vs "run"). */
export interface ToolSecrets {
  has(name: string): Promise<boolean>;
}

/** A serialized response. The host performs the real fetch (injecting declared secrets,
    enforcing the domain allowlist); you get back this Response-like façade. */
export interface ToolResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

/** fetch, bridged to the host. Restricted to the domains your manifest declares; the
    frame itself has `connect-src 'none'`, so this is the only way out. */
export interface ToolNet {
  fetch(input: string, init?: RequestInit): Promise<ToolResponse>;
}

/** Tool-to-tool data flow over your declared ports. Tools never address each other —
    you emit/subscribe your own ports and the shell owns the wiring between panes. */
export interface ToolBus {
  emit(port: string, value: unknown): void;
  on<T = unknown>(port: string, fn: (value: T) => void): () => void;
}

export type ToastTone = "info" | "success" | "error";

/** Host-drawn UI affordances — toasts the host renders (unspoofable) and the live
    theme tokens so a tool can match the glass look. */
export interface ToolUi {
  toast(message: string, tone?: ToastTone): void;
  theme: { name: "dark" | "light"; vars: Record<string, string> };
}

/** Everything a tool can touch. There is no ambient capability beyond this object. */
export interface ToolContext {
  storage: ToolStorage;
  secrets: ToolSecrets;
  net: ToolNet;
  bus: ToolBus;
  ui: ToolUi;
  meta: { id: string; visibility: "public" | "private" };
}

/** A tool's entry point. Receives `ctx` and the root element to render into; may
    return a cleanup function the host calls on unmount. */
export type ToolMount = (ctx: ToolContext, root: HTMLElement) => void | (() => void);

export interface ToolboyGlobal {
  tool(fn: ToolMount): void;
}

declare global {
  interface Window {
    toolboy?: ToolboyGlobal;
  }
}

/** Register your tool's mount function. Framework-free — for React, use
    `defineTool` from `@toolboy/sdk/react`.

    ```ts
    import { tool } from "@toolboy/sdk";
    tool((ctx, root) => {
      root.textContent = "hello from a toolboy tool";
      const off = ctx.bus.on("in", (v) => (root.textContent = String(v)));
      return off; // cleanup on unmount
    });
    ``` */
export function tool(fn: ToolMount): void {
  const g = typeof window !== "undefined" ? window.toolboy : undefined;
  if (!g) {
    throw new Error(
      "@toolboy/sdk: window.toolboy is missing — a tool only runs inside the toolboy sandbox runtime.",
    );
  }
  g.tool(fn);
}
