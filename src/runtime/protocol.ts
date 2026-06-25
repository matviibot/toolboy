/* toolboy runtime — the wire protocol across the host↔tool boundary.

   This is the *entire* surface area between a tool and the world (principles.md:
   "ctx is the only interface"). A tool runs in a cross-origin sandboxed iframe
   with an opaque origin and `connect-src 'none'`; it can do nothing ambient.
   Everything it can touch — storage, secrets, net, bus, ui — is a message over a
   MessagePort the host hands it at init and mediates. Both sides import these
   types so the contract stays in one place.

   Transport: the host transfers a MessagePort into the frame via one
   `window.postMessage` (`InitPort`), then all traffic flows over that port. */

/** Capability namespaces a tool may RPC into. The host enforces grants per the
    tool's manifest before honoring any of these. */
export type RpcNamespace = "storage" | "secrets" | "net";

/** A serialized fetch Response — the host performs the real fetch (injecting
    declared secrets, enforcing the domain allowlist) and ships back a plain
    object. The frame rehydrates a Response-like façade around it. */
export interface NetResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

/** Theme handed to the frame so toolboy-native tools can match the glass look.
    Fonts deliberately do NOT cross the boundary (no `font-src`) — the frame is
    isolated; it gets color/radius/shadow tokens and falls back to system fonts. */
export interface ThemePayload {
  name: "dark" | "light";
  vars: Record<string, string>;
}

// ---- Host → Frame (the first one via window.postMessage, rest over the port) ----

/** Sent once via `window.postMessage(_, '*', [port])`. Carries the transferred
    MessagePort plus the tool's identity, granted capabilities, and theme. */
export interface InitPort {
  k: "init-port";
  toolId: string;
  visibility: "public" | "private";
  theme: ThemePayload;
}

export interface RpcResult {
  k: "rpc-res";
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
}

/** Data arriving on one of the tool's declared input ports (host-mediated bus). */
export interface InputMessage {
  k: "input";
  port: string;
  value: unknown;
}

export interface ThemeMessage {
  k: "theme";
  vars: Record<string, string>;
}

export type HostToFrame = RpcResult | InputMessage | ThemeMessage;

// ---- Frame → Host (all over the port) ----

export interface ReadyMessage {
  k: "ready";
}

export interface RpcCall {
  k: "rpc";
  id: number;
  ns: RpcNamespace;
  fn: string;
  args: unknown[];
}

/** The tool emitted on one of its declared output ports. */
export interface EmitMessage {
  k: "emit";
  port: string;
  value: unknown;
}

export interface ToastMessage {
  k: "toast";
  message: string;
  tone: "info" | "success" | "error";
}

/** A host-level shortcut the tool frame caught while focused and is handing back
    up (e.g. ⌘K). A focused iframe swallows keydown, so window-level host hotkeys
    only keep working if the frame forwards them — the host owns the action. */
export interface HotkeyMessage {
  k: "hotkey";
  combo: string;
}

export type FrameToHost = ReadyMessage | RpcCall | EmitMessage | ToastMessage | HotkeyMessage;

/** Type of the `init-port` envelope the frame listens for on `window`. */
export const INIT_KIND = "init-port" as const;
