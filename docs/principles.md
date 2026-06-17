# Principles — rails, not walls

toolboy is **opinionated on purpose.** The way you build a safe, robust environment that
still feels flexible is to draw a hard, narrow boundary between the *host* and a *tool*,
make that boundary the only thing that's rigid, and leave everything on the tool's side
open. Few choices at the boundary; total freedom behind it.

This doc is the spine. Every other doc (sdk, manifest, security, loading, toolchains)
is an instance of these rules. When a future decision is ambiguous, it resolves toward:
**fewer knobs at the boundary, more freedom inside the tool.**

## The boundary

A tool is a built ESM bundle that renders into a sandboxed iframe and receives exactly
one thing: `ctx`. `ctx` is the *entire* surface area between a tool and the world.
Nothing reaches the tool that didn't come through `ctx`; nothing leaves the tool except
through `ctx`. That single chokepoint is where all safety and robustness is enforced —
so it's small, versioned, and the same for everyone.

## FIXED — the rails (host owns these; not configurable)

These are non-negotiable. There is exactly **one** way each works, so there's no unsafe
variant to fall into.

- **Execution.** Every tool — yours or a stranger's — runs in a cross-origin sandboxed
  iframe (`allow-scripts`, no `allow-same-origin`), opaque origin, strict CSP
  (`connect-src 'none'`). No in-process path in v1. No exceptions per tool.
- **Capabilities are deny-by-default.** A tool has *nothing* ambient — no storage, no
  network, no secrets, no DOM beyond its frame. It gets only what its manifest declares
  and the user grants, mediated by the host over postMessage.
- **`ctx` is the only interface.** `storage`, `secrets`, `net`, `bus`, `ui`. The shape is
  fixed and versioned. Tools target the contract, not the host internals.
- **Secrets never enter tool code.** The host injects them into outbound requests; tools
  see responses, never keys.
- **Network is an allowlist.** Per-tool declared domains only; CSP makes direct fetch
  impossible, so the allowlist is real, not advisory.
- **The bus is host-owned.** Tools emit/receive on their *own* typed ports; they never
  address each other. Wiring lives in the shell. Payloads are structured-clone, type-
  checked, size-capped.
- **Entities come from git.** Source of truth is a repo `toolboy.json`; refs are
  commit-pinned and (for public) SRI-verified. The host caches and indexes; it never
  becomes the source of truth.
- **Trust UI is host chrome.** Consent, grants, and secret entry are drawn by the shell,
  outside any tool's frame, and are unspoofable.

## FLEXIBLE — behind the boundary (host does not constrain)

Where the host has no opinion, it imposes nothing.

- **What a tool does and how it looks.** Any logic, any internal UI, any libraries in the
  bundle. The design kit is *offered*, never required — a tool may look nothing like
  toolboy.
- **Port vocabulary is open.** Standard MIME types plus namespaced custom types
  (`x-toolboy/*`). Tools define new types; the registry grows.
- **Toolchains are arbitrary.** Any graph of tools, any split layout, any wiring the
  types allow. Composed by users, shared like any entity.
- **What you connect and share.** Which repos, which entities are public/private — all
  the user's call.
- **Dependencies.** A tool bundles whatever it needs; the host neither provides nor
  vets a tool's internals (it only sandboxes them).

## How to apply this

When adding a feature, ask: *does this belong on the rail or behind it?*

- If it touches safety, trust, or how tools interconnect → it's a **rail**. Make it the
  one true way, enforce it at the host, expose no unsafe toggle.
- If it's about what a tool expresses or how a user composes things → leave it **flexible**.
  Don't add host policy where freedom costs nothing.

A new configuration knob on the boundary is a smell. A new freedom behind it is usually fine.
