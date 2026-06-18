# toolboy backend

A thin, stateless edge service (Cloudflare Workers). Two inhabitants are planned;
the first is built:

- **`net` relay** ✅ — a CORS fallback for `ctx.net`. Forwards a tool's request to
  a third-party API when the browser can't reach it directly. SSRF-guarded,
  allowlist-checked, stores nothing.
- **discovery index** ⬜ — a read-only registry (D1) to find tools across repos.
  Not built yet; this Worker is where it will live (add the D1 binding to
  `wrangler.toml` then).

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

## Develop & deploy

```sh
npm install
npm run typecheck
npm run dev       # local Worker at http://localhost:8787
npm run deploy    # wrangler deploy (needs a Cloudflare account)
```

Point the client at it by setting `VITE_NET_RELAY_URL` (see [`.env.example`](../.env.example)
at the repo root) to the Worker URL. Unset → the host does direct fetch only and a
CORS failure surfaces as-is.
