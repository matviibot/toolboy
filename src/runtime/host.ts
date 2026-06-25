/* toolboy runtime — the host side of the boundary.

   One ToolBridge per live tool frame. It transfers a MessagePort into the frame,
   then mediates everything the tool asks for against that tool's manifest grants:
   storage (namespaced IndexedDB), secrets (existence only), net (domain allowlist
   + host-side secret injection), and the bus (emit → host, input → frame). The
   tool can do nothing this object doesn't choose to do for it. */

import { storage } from "./idb";
import { keyring } from "./keyring";
import { resolveNetRequest } from "./netPolicy";
import type { FrameToHost, InitPort, NetResponse, ThemePayload } from "./protocol";
import type { NetGrant } from "../shell/types";

/** Optional backend (backend/). When set, a direct fetch that fails on CORS or the
    network is retried through the relay (`<backend>/relay`), where same-origin rules
    don't apply. Unset → direct fetch only, and a CORS failure surfaces to the tool. */
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, "");
const NET_RELAY_URL = BACKEND_URL ? `${BACKEND_URL}/relay` : undefined;

export interface BridgePerms {
  storage: boolean;
  secrets: string[];
  net: NetGrant[];
}

export interface BridgeConfig {
  toolId: string;
  visibility: "public" | "private";
  perms: BridgePerms;
  theme: ThemePayload;
  /** the tool emitted on one of its output ports */
  onOutput: (port: string, value: unknown) => void;
  onToast: (message: string, tone: "info" | "success" | "error") => void;
  /** a host-level shortcut the focused frame forwarded back up (e.g. ⌘K) */
  onHotkey?: (combo: string) => void;
}

export class ToolBridge {
  private channel = new MessageChannel();
  private cfg: BridgeConfig;
  private frame: Window;
  private ready = false;
  private queue: { port: string; value: unknown }[] = [];
  private disposed = false;

  constructor(iframe: HTMLIFrameElement, cfg: BridgeConfig) {
    this.cfg = cfg;
    this.frame = iframe.contentWindow!;
    this.channel.port1.onmessage = (e) => this.onMessage(e.data as FrameToHost);

    const init: InitPort = {
      k: "init-port",
      toolId: cfg.toolId,
      visibility: cfg.visibility,
      theme: cfg.theme,
    };
    // null-origin frame → must target "*"; the transferred port is the real channel
    this.frame.postMessage(init, "*", [this.channel.port2]);
  }

  /** deliver data to one of the tool's declared input ports (host-mediated bus) */
  sendInput(port: string, value: unknown) {
    if (!this.ready) {
      this.queue.push({ port, value });
      return;
    }
    this.channel.port1.postMessage({ k: "input", port, value });
  }

  /** push updated theme tokens without reloading the frame */
  sendTheme(vars: Record<string, string>) {
    if (!this.ready) return;
    this.channel.port1.postMessage({ k: "theme", vars });
  }

  dispose() {
    this.disposed = true;
    this.channel.port1.onmessage = null;
    this.channel.port1.close();
  }

  private onMessage(m: FrameToHost) {
    if (this.disposed || !m) return;
    switch (m.k) {
      case "ready":
        this.ready = true;
        this.queue.forEach(({ port, value }) => this.sendInput(port, value));
        this.queue = [];
        break;
      case "emit":
        this.cfg.onOutput(m.port, m.value);
        break;
      case "toast":
        this.cfg.onToast(m.message, m.tone);
        break;
      case "hotkey":
        this.cfg.onHotkey?.(m.combo);
        break;
      case "rpc":
        this.handleRpc(m.id, m.ns, m.fn, m.args);
        break;
    }
  }

  private reply(id: number, ok: boolean, value?: unknown, error?: string) {
    if (this.disposed) return;
    this.channel.port1.postMessage({ k: "rpc-res", id, ok, value, error });
  }

  private async handleRpc(id: number, ns: string, fn: string, args: unknown[]) {
    try {
      if (ns === "storage") return this.reply(id, true, await this.storageRpc(fn, args));
      if (ns === "secrets") return this.reply(id, true, this.secretsRpc(fn, args));
      if (ns === "net") return this.reply(id, true, await this.netRpc(args));
      this.reply(id, false, undefined, `unknown capability: ${ns}`);
    } catch (e) {
      this.reply(id, false, undefined, e instanceof Error ? e.message : String(e));
    }
  }

  private storageRpc(fn: string, args: unknown[]) {
    if (!this.cfg.perms.storage) throw new Error("storage not granted to this tool");
    const id = this.cfg.toolId;
    switch (fn) {
      case "get": return storage.get(id, String(args[0]));
      case "set": return storage.set(id, String(args[0]), args[1]);
      case "delete": return storage.delete(id, String(args[0]));
      case "keys": return storage.keys(id);
      default: throw new Error(`unknown storage op: ${fn}`);
    }
  }

  private secretsRpc(fn: string, args: unknown[]) {
    if (fn !== "has") throw new Error(`unknown secrets op: ${fn}`);
    const name = String(args[0]);
    // only secrets the manifest declared are even acknowledged
    if (!this.cfg.perms.secrets.includes(name)) return false;
    return keyring.has(name);
  }

  private async netRpc(args: unknown[]): Promise<NetResponse> {
    const init = (args[1] as RequestInit | null) ?? {};
    // url/port/allowlist checks + host-side secret injection (netPolicy.ts); throws on any violation
    const { url, headers } = resolveNetRequest(String(args[0]), init, this.cfg.perms.net, (n) => keyring.read(n));

    // never auto-follow redirects: the allowlist + injection were validated against THIS
    // url only — a 30x to an off-allowlist host would otherwise leak headers/body
    const reqInit: RequestInit = { ...init, headers, redirect: "manual" };
    try {
      const res = await fetch(url.toString(), reqInit);
      return serializeResponse(url, res);
    } catch (e) {
      // A *connection-level* failure (CORS block, DNS, offline) throws a TypeError.
      // Our own redirect rejection throws a plain Error after a successful fetch, so
      // it isn't caught as a connection failure — only fall back to the relay for the
      // real network/CORS case, and only when a relay is configured.
      if (!NET_RELAY_URL || !(e instanceof TypeError)) throw e;
      return this.relayFetch(url, reqInit, headers);
    }
  }

  /** CORS fallback: hand the already-assembled request (secret headers and all) to
      the backend relay, which forwards it server-side. The relay re-enforces the
      allowlist + SSRF guard; we still reject relayed redirects, same as direct. */
  private async relayFetch(url: URL, reqInit: RequestInit, headers: Headers): Promise<NetResponse> {
    const headerObj: Record<string, string> = {};
    headers.forEach((v, k) => (headerObj[k] = v));
    const envelope = {
      url: url.toString(),
      method: (reqInit.method ?? "GET").toUpperCase(),
      headers: headerObj,
      body: typeof reqInit.body === "string" ? reqInit.body : undefined,
      // the tool's granted domains — the relay refuses anything off this list
      allow: this.cfg.perms.net.map((g) => g.domain),
    };

    let relayRes: Response;
    try {
      relayRes = await fetch(NET_RELAY_URL!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(envelope),
      });
    } catch (e) {
      throw new Error(`net relay unreachable: ${e instanceof Error ? e.message : String(e)}`);
    }

    const data = (await relayRes.json().catch(() => null)) as
      | { relayed?: boolean; error?: string; response?: NetResponse }
      | null;
    if (!data) throw new Error("net relay: malformed response");
    if (!data.relayed || !data.response) throw new Error(`net relay refused: ${data.error ?? relayRes.status}`);

    const r = data.response;
    if (r.status >= 300 && r.status < 400) {
      throw new Error(`net blocked: ${url.hostname} attempted a redirect (not followed)`);
    }
    return r;
  }
}

/** Serialize a direct fetch Response into the wire shape, rejecting redirects. */
async function serializeResponse(url: URL, res: Response): Promise<NetResponse> {
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    throw new Error(`net blocked: ${url.hostname} attempted a redirect (not followed)`);
  }
  const body = await res.text();
  const outHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => (outHeaders[k] = v));
  return { ok: res.ok, status: res.status, statusText: res.statusText, headers: outHeaders, body };
}
