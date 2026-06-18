# toolboy backend

A thin edge service (Cloudflare Workers). One Worker, three routes:

- **`POST /relay`** — a CORS fallback for `ctx.net`. Forwards a tool's request to a
  third-party API when the browser can't reach it directly. SSRF-guarded,
  allowlist-checked, stores nothing. ([src/relay.ts](src/relay.ts))
- **`POST /publish`** — crawl a repo's `toolboy.json` and index its public entities
  into D1. ([src/discovery.ts](src/discovery.ts))
- **`GET /discover`** — query the index so the ⌘K palette can surface tools from
  repos the user hasn't pointed at yet. ([src/discovery.ts](src/discovery.ts))

The router is [src/index.ts](src/index.ts); shared CORS/JSON helpers are in
[src/http.ts](src/http.ts).

## The `net` relay

### Why it exists

Every tool runs in a sandboxed iframe with `connect-src 'none'`; all network goes
through `ctx.net.fetch`, which the host ([`src/runtime/host.ts`](../src/runtime/host.ts))
mediates — allowlist check, then host-side secret injection from the keyring. The
host tries a **direct** fetch first. That works for CORS-friendly APIs; most
authenticated APIs don't send permissive CORS headers, so the browser blocks the
response. When that happens the host re-sends the already-assembled request to this
relay, which forwards it server-side where CORS doesn't apply.

CORS-friendly APIs never touch the relay — direct fetch wins and is preferred
(one fewer party that sees the secret in transit).

### Guarantees

- **Stateless.** No secrets, bodies, or logs persisted. Secrets ride in the
  forwarded headers over TLS and are gone when the response returns.
- **SSRF-guarded** ([`src/ssrf.ts`](src/ssrf.ts)). https only, port 443 only, and
  never an internal host — private/CGNAT/loopback/link-local ranges, IPv6
  ULA/link-local, IPv4-mapped IPv6, numeric/hex host encodings, and
  `localhost`/`.local`/`.internal`/cloud-metadata names are all refused.
- **Allowlist echo.** The host sends the tool's granted domains; the relay refuses
  any url whose host isn't among them. Defense-in-depth (a direct caller controls
  the field) on top of the SSRF block.
- **No redirects.** A 30x is reported, never followed — auto-following could leak
  the injected secret header to an off-allowlist host.

### Residual risks (named, not hidden)

- **Secrets in transit.** A forwarding relay sees the secret header. Acceptable for
  a personal/self-hosted deploy; the hosted relay is self-hostable for exactly this
  reason, and direct fetch (no relay) is preferred whenever the API allows it.
- **DNS rebinding.** The SSRF guard blocks *literal* internal addresses, not a
  public hostname that resolves to a private IP at fetch time. Workers egress to the
  public internet (they can't route to a user's LAN), which blunts impact; a
  hardened deploy should resolve-then-pin the IP.
- **No rate limit yet.** `wrangler.toml` has a commented KV binding and `src/index.ts`
  marks where a fixed-window limiter goes.

### Wire format

```jsonc
POST <relay>/
{ "url": "https://api.example.com/v1", "method": "POST",
  "headers": { "authorization": "Bearer …" }, "body": "…",
  "allow": ["api.example.com"] }

// relay forwarded it (response.ok reflects the upstream status):
200  { "relayed": true,  "response": { "ok", "status", "statusText", "headers", "body" } }
// relay refused (bad url, SSRF, off-allowlist, too large):
4xx  { "relayed": false, "error": "…" }
```

## The discovery index

A read-only registry (D1) so the palette can find public tools across repos. It does
**not** execute or fully validate tools — it stores discovery *cards* (id, kind, name,
description, tags, icon) for public entities only. When the user opens one, the client
loads that entity's source repo through the normal loader (resolver → manifest → SRI →
trust gate), so the index is a finder, never a trust shortcut.

- **Populate model: crawl-on-publish.** `POST /publish { source }` pulls that repo's
  `toolboy.json` on demand, extracts its public cards, and *replaces* the rows for that
  source (so an un-published entity disappears). No background crawler, no auth — fine
  for a personal/self-hosted index; a shared deployment would add a publish token.
- **Private entities are never indexed** — a private tool's metadata stays in the
  user's own registry.

```jsonc
POST /publish  { "source": "gh:owner/repo@ref" }
200            { "source", "repo", "pin", "indexed": <n> }

GET  /discover?q=<text>&tag=<tag>&limit=<n>
200            { "entities": [ { id, source, kind, name, description, icon, tags, repoName, pin } ] }
```

## Develop & deploy

```sh
npm install
npm run typecheck

npm run db:local   # one-time: apply schema.sql to the local discovery D1
npm run dev        # local Worker at http://localhost:8787 (uses local D1)
```

For a remote deploy (needs a Cloudflare account):

```sh
wrangler d1 create toolboy-index   # paste the printed database_id into wrangler.toml
npm run db:remote                  # apply schema.sql to the remote D1
npm run deploy                     # wrangler deploy → *.workers.dev URL
```

> **Toolchain note.** `wrangler` is pinned to **4.86.0** — the last v4 that supports
> **Node 20** (4.87+ require Node ≥22). On Node 22+ you can move to the latest v4 and,
> if you like, bump `compatibility_date` in `wrangler.toml`.

Point the client at it by setting `VITE_BACKEND_URL` (see [`.env.example`](../.env.example)
at the repo root) to the Worker's base URL. The client appends `/relay` and `/discover`.
Unset → direct fetch only (CORS failures surface as-is) and no cross-repo discovery.
