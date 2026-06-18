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

/** Optional backend relay (backend/). When set, a direct fetch that fails on CORS
    or the network is retried server-side, where same-origin rules don't apply.
    Unset → direct fetch only, and a CORS failure surfaces to the tool as-is. */
const NET_RELAY_URL = import.meta.env.VITE_NET_RELAY_URL as string | undefined;

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

    // the grant is a bare domain; honor only https on the default port, so a tool
    // can't downgrade to cleartext http or reach a non-standard port on a granted host
    if (url.protocol !== "https:") throw new Error(`net blocked: only https is allowed (got ${url.protocol})`);
    if (url.port && url.port !== "443") throw new Error(`net blocked: non-standard port ${url.port}`);

    const grant = hostAllowed(url.hostname, this.cfg.perms.net);
    if (!grant) throw new Error(`net blocked: ${url.hostname} is not in this tool's allowlist`);

    // host-side secret injection — the raw value is read here and never returned.
    // function replacer so $-sequences in the secret aren't treated as $&/$1 patterns
    const headers = new Headers(init.headers);
    if (grant.inject) {
      const secret = keyring.read(grant.inject.secret);
      if (secret) headers.set(grant.inject.header, grant.inject.format.replace("{}", () => secret));
    }

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
