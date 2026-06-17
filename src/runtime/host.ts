/* toolboy runtime — the host side of the boundary.

   One ToolBridge per live tool frame. It transfers a MessagePort into the frame,
   then mediates everything the tool asks for against that tool's manifest grants:
   storage (namespaced IndexedDB), secrets (existence only), net (domain allowlist
   + host-side secret injection), and the bus (emit → host, input → frame). The
   tool can do nothing this object doesn't choose to do for it. */

import { storage } from "./idb";
import { keyring } from "./keyring";
import type { FrameToHost, InitPort, NetResponse, ThemePayload } from "./protocol";
import type { NetGrant } from "../shell/types";

export interface BridgePerms {
  storage: boolean;
  secrets: string[];
  net: NetGrant[];
}

export interface BridgeConfig {
  toolId: string;
  visibility: "public" | "private";
  perms: BridgePerms;
  acceptPort: string | null;
  theme: ThemePayload;
  onOutput: (value: unknown) => void;
  onToast: (message: string, tone: "info" | "success" | "error") => void;
}

/** hostname allowlist check — exact match or a subdomain of a granted domain */
function hostAllowed(host: string, grants: NetGrant[]): NetGrant | null {
  for (const g of grants) {
    if (host === g.domain || host.endsWith("." + g.domain)) return g;
  }
  return null;
}

export class ToolBridge {
  private channel = new MessageChannel();
  private cfg: BridgeConfig;
  private frame: Window;
  private ready = false;
  private queue: unknown[] = [];
  private disposed = false;

  constructor(iframe: HTMLIFrameElement, cfg: BridgeConfig) {
    this.cfg = cfg;
    this.frame = iframe.contentWindow!;
    this.channel.port1.onmessage = (e) => this.onMessage(e.data as FrameToHost);

    const init: InitPort = {
      k: "init-port",
      toolId: cfg.toolId,
      visibility: cfg.visibility,
      acceptPort: cfg.acceptPort,
      theme: cfg.theme,
    };
    // null-origin frame → must target "*"; the transferred port is the real channel
    this.frame.postMessage(init, "*", [this.channel.port2]);
  }

  /** deliver data to the tool's declared input port (host-mediated bus) */
  sendInput(value: unknown) {
    if (!this.cfg.acceptPort) return;
    if (!this.ready) {
      this.queue.push(value);
      return;
    }
    this.channel.port1.postMessage({ k: "input", port: this.cfg.acceptPort, value });
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
        this.queue.forEach((v) => this.sendInput(v));
        this.queue = [];
        break;
      case "emit":
        this.cfg.onOutput(m.value);
        break;
      case "toast":
        this.cfg.onToast(m.message, m.tone);
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
    const input = String(args[0]);
    const init = (args[1] as RequestInit | null) ?? {};
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new Error(`invalid URL: ${input}`);
    }

    const grant = hostAllowed(url.hostname, this.cfg.perms.net);
    if (!grant) throw new Error(`net blocked: ${url.hostname} is not in this tool's allowlist`);

    // host-side secret injection — the raw value is read here and never returned
    const headers = new Headers(init.headers);
    if (grant.inject) {
      const secret = keyring.read(grant.inject.secret);
      if (secret) headers.set(grant.inject.header, grant.inject.format.replace("{}", secret));
    }

    const res = await fetch(url.toString(), { ...init, headers });
    const body = await res.text();
    const outHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => (outHeaders[k] = v));
    return { ok: res.ok, status: res.status, statusText: res.statusText, headers: outHeaders, body };
  }
}
