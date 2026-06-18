/* toolboy net relay — POST /relay.

   A stateless, dumb forwarder. The browser host (src/runtime/host.ts) does the
   real work — checks the tool's manifest allowlist, injects secrets from the
   keyring — then tries a direct fetch. Direct fetch only works for CORS-friendly
   APIs; when it's blocked, the host re-sends the *already-assembled* request here
   and we forward it from a server, where CORS doesn't apply.

   Contract (security.md "The net relay"):
   - Stores nothing. No secrets, no bodies, no logs of either. Secrets ride in the
     forwarded headers over TLS and are gone the instant the response returns.
   - SSRF-guarded (ssrf.ts): https only, default port only, never an internal host.
   - Allowlist echo: the host sends the tool's granted domains in `allow`; we
     refuse any url whose host isn't among them. This is defense-in-depth — a
     direct caller controls `allow`, so the real guarantee is the SSRF block — but
     it keeps the normal path from being turned into an open proxy.
   - Never follows redirects: the allowlist + injection were validated for THIS
     url only; a 30x to an off-allowlist host would leak the secret header.

   Wire format:
     POST /relay   { url, method?, headers?, body?, allow: string[] }
     200           { relayed: true,  response: { ok, status, statusText, headers, body } }
     4xx           { relayed: false, error: string }                  // relay refused
   The host distinguishes "relay refused" (relayed:false) from "upstream returned
   an error" (relayed:true, response.ok:false) and surfaces the latter to the tool. */

import { json } from "./http";
import { isBlockedHost } from "./ssrf";

interface RelayRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  allow?: string[];
}

/** A serialized fetch Response — mirrors NetResponse in src/runtime/protocol.ts. */
interface NetResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MiB cap, both directions

/** exact host match or a subdomain of a granted domain — mirrors hostAllowed in host.ts */
function hostInAllow(host: string, allow: string[]): boolean {
  return allow.some((d) => host === d || host.endsWith("." + d));
}

export async function handleRelay(req: Request, cors: Record<string, string>): Promise<Response> {
  let payload: RelayRequest;
  try {
    payload = (await req.json()) as RelayRequest;
  } catch {
    return json({ relayed: false, error: "invalid JSON envelope" }, 400, cors);
  }

  const allow = Array.isArray(payload.allow) ? payload.allow : [];
  if (allow.length === 0) return json({ relayed: false, error: "empty allowlist" }, 400, cors);

  let url: URL;
  try {
    url = new URL(payload.url);
  } catch {
    return json({ relayed: false, error: "invalid url" }, 400, cors);
  }

  // Same gates the host enforces locally — re-checked here because the relay is a
  // separate trust boundary and must not assume a well-behaved caller.
  if (url.protocol !== "https:") return json({ relayed: false, error: "only https is allowed" }, 400, cors);
  if (url.port && url.port !== "443") return json({ relayed: false, error: "non-standard port" }, 400, cors);

  const host = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets for the check
  if (isBlockedHost(host)) return json({ relayed: false, error: "host is not routable" }, 403, cors);
  if (!hostInAllow(url.hostname, allow))
    return json({ relayed: false, error: "host not in tool allowlist" }, 403, cors);

  const method = (payload.method ?? "GET").toUpperCase();
  if (payload.body && new Blob([payload.body]).size > MAX_BODY_BYTES)
    return json({ relayed: false, error: "request body too large" }, 413, cors);

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), {
      method,
      headers: payload.headers ?? {},
      body: method === "GET" || method === "HEAD" ? undefined : payload.body,
      redirect: "manual", // a 30x is reported to the host, never auto-followed
    });
  } catch (e) {
    return json({ relayed: false, error: `upstream fetch failed: ${e instanceof Error ? e.message : e}` }, 502, cors);
  }

  const text = await upstream.text();
  if (new Blob([text]).size > MAX_BODY_BYTES)
    return json({ relayed: false, error: "response body too large" }, 502, cors);

  const headers: Record<string, string> = {};
  upstream.headers.forEach((v, k) => (headers[k] = v));
  const response: NetResponse = {
    ok: upstream.ok,
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
    body: text,
  };
  return json({ relayed: true, response }, 200, cors);
}
