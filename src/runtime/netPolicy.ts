/* toolboy runtime — the ctx.net request policy, host-side.

   Standalone (like backend/src/ssrf.ts) so the rule a tool's network is held to can
   be reasoned about and unit-tested on its own, without standing up a tool frame.
   ToolBridge (host.ts) calls these before every outbound fetch.

   The policy: a grant is a bare domain reachable only over https on the default port;
   a request to anything else is refused. If the matched grant declares an injection,
   the named secret is read host-side and written into the request headers — the raw
   value goes onto the wire but is never returned to the tool. */

import type { NetGrant } from "../shell/types";

/** hostname allowlist check — exact match or a subdomain of a granted domain. */
export function hostAllowed(host: string, grants: NetGrant[]): NetGrant | null {
  for (const g of grants) {
    if (host === g.domain || host.endsWith("." + g.domain)) return g;
  }
  return null;
}

export interface ResolvedNetRequest {
  url: URL;
  grant: NetGrant;
  /** request headers with any declared secret injected; pass straight to fetch */
  headers: Headers;
}

/** Validate a ctx.net request against a tool's grants and assemble its outbound
    headers (injecting the granted secret via `readSecret`, which the host backs with
    its keyring). Throws a descriptive Error on any policy violation. Pure apart from
    `readSecret`, so tests pass a stub for it. */
export function resolveNetRequest(
  input: string,
  init: RequestInit | null | undefined,
  grants: NetGrant[],
  readSecret: (name: string) => string | undefined,
): ResolvedNetRequest {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`invalid URL: ${input}`);
  }

  // honor only https on the default port: a tool can't downgrade to cleartext http
  // or reach a non-standard port on an otherwise-granted host
  if (url.protocol !== "https:") throw new Error(`net blocked: only https is allowed (got ${url.protocol})`);
  if (url.port && url.port !== "443") throw new Error(`net blocked: non-standard port ${url.port}`);

  const grant = hostAllowed(url.hostname, grants);
  if (!grant) throw new Error(`net blocked: ${url.hostname} is not in this tool's allowlist`);

  // host-side secret injection — the raw value is read here and never returned. Use a
  // function replacer so $-sequences in the secret aren't treated as $&/$1 patterns.
  const headers = new Headers(init?.headers);
  if (grant.inject) {
    const secret = readSecret(grant.inject.secret);
    if (secret) headers.set(grant.inject.header, grant.inject.format.replace("{}", () => secret));
  }

  return { url, grant, headers };
}
