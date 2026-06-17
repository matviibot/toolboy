# Security model

Status: **design draft**. toolboy runs code authored by third parties (public tools
from strangers' repos). This document is the threat model and the defenses.

## What we're protecting

The host (your toolboy instance) holds things a malicious tool would want:

- **Local data** — IndexedDB (per-tool storage, toolchain state).
- **Secrets** — API keys in a local keyring.
- **Network identity** — your IP, your cookies, your authenticated sessions.
- **The DOM / other tools** — the surface, the palette, neighboring panes.

## Trust tiers

**v1 is sandbox-only.** *Every* tool — including your own — runs in a cross-origin
`iframe` with `sandbox="allow-scripts"` and no `allow-same-origin`. One execution path,
no escape hatch a public tool could take. The bus is host-mediated, so split-screen and
tool-to-tool flow work fine across sandboxed frames — sandboxing costs almost nothing
functionally.

| Tier | Status | Execution | Access |
|---|---|---|---|
| **Sandboxed** | v1, the only path | Cross-origin `iframe`, `sandbox="allow-scripts"` (no `allow-same-origin`) | Nothing ambient. Capabilities only via postMessage RPC the host mediates |
| **In-process** | **Deferred** (not in v1) | Dynamic `import()` in the app context | Full JS access — cooperative isolation only. Would be an explicit trust upgrade, never available to public tools |

## Isolation (sandboxed tools)

- **Opaque origin:** `sandbox="allow-scripts"` *without* `allow-same-origin` → the tool
  gets a null origin and cannot touch host cookies, `localStorage`, or IndexedDB.
- **Separate origin for bundles:** serve tool bundles from a distinct origin
  (e.g. a sandbox subdomain / blob URL), so app-origin resources are unreachable
  even via tricks.
- **Strict CSP on the tool document:** `script-src` limited to the bundle (no inline,
  no arbitrary remote code), and **`connect-src 'none'`** — the tool cannot fetch
  anything directly. All network goes through `ctx.net` (the bridge). This is what makes
  the `net` allowlist actually enforceable.

## Capabilities (declare → consent → grant)

The manifest declares everything a tool can touch; the host grants only what's declared,
after user consent (one aggregated prompt per tool, or per toolchain scene).

```jsonc
"permissions": {
  "storage": true,
  "secrets": ["OPENAI_API_KEY"],
  "net":     ["api.openai.com"]
}
```

- **Storage** is namespaced per tool; a tool sees only its own keys.
- **Bus** payloads cross postMessage as structured-clone only (no functions, no
  prototype tricks), validated against the declared port **type**, with a **size cap**
  to prevent memory DoS.
- **Wiring** is shell-owned; a tool cannot force a connection to another tool.

## Secrets — never in tool code

The rule: **tool code never sees raw secret material.**

- Secrets live in a **client-side keyring** (the parent app), not in tool code and not
  on the server.
- When a sandboxed tool calls `ctx.net.fetch("https://api.openai.com/...")`, the
  **parent app** (not the tool) injects the secret header from the keyring, then sends
  the request out. The iframe only ever sees the response.
- Injection is driven by a manifest binding (domain → which secret → which header), so
  it's declarative and auditable.

Consequence: a public tool can *use* your OpenAI key without ever being able to read,
log, or exfiltrate it.

## The `net` relay (backend)

Direct `fetch` from the parent works for CORS-friendly APIs. When CORS blocks it, the
request goes through the backend relay. The relay is **stateless and dumb**:

- **Stores nothing** — no secrets, no request bodies. Secrets are attached by the client
  per request over TLS and forwarded.
- **SSRF-guarded** — only forwards to the per-tool allowlisted domains; blocks private/
  link-local ranges and cloud metadata endpoints (e.g. 169.254.169.254). Rate-limited.
- **Trust note:** a forwarding relay sees secret headers in transit. For a personal /
  self-hosted backend that's acceptable; the hosted relay should be self-hostable, and
  CORS-friendly APIs should prefer direct fetch to skip the relay entirely.

## Supply-chain integrity

- **Commit pinning:** entity refs pin a git commit SHA; a repo can't swap code under a
  pinned ref without the SHA changing.
- **Bundle hash (SRI):** a toolchain/lock records the integrity hash of each tool bundle;
  on load the host verifies the fetched bundle matches — a compromised CDN/repo fails the
  check instead of running.

## Residual risks (named, not hidden)

- **Relay sees secrets in transit** unless self-hosted or bypassed via direct fetch
  (v1 prefers direct fetch; the relay is a self-hostable fallback).
- **Phishing via tool UI** — a sandboxed tool can still *render* a convincing fake
  prompt. Secret entry and grant dialogs must be **host chrome**, never something a tool
  can draw, and should be visually unspoofable (outside the tool's frame).
