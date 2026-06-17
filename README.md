# toolboy

A personal toolbox. A calm, near-empty home surface from which you launch small,
single-purpose **tools** via a `Cmd+K` command palette. Open tools fill the surface,
or run side by side in resizable split panes. Tools can pass data to each other.

Tools are authored **outside** toolboy (by you, or — mostly — by agents) and live in
a git repo. toolboy reads a manifest and loads them.

## Principles

- **Rails, not walls.** The host/tool boundary is rigid and opinionated — one
  execution model, one capability path, one entity model, no unsafe variants. Behind
  that boundary, a tool is free to do anything. The spec lives in
  [docs/principles.md](docs/principles.md).
- **Local-first.** Installable PWA, state in IndexedDB, works offline. No account
  required to use it.
- **The shell is a frame, not a framework.** toolboy provides the surface, palette,
  split panes, and an SDK. Tools own their content.
- **Agent-authored.** Tools are written against a typed SDK + design kit so generated
  tools get the glass look and host integration for free.
- **Git-native sharing.** Tools live in a repo with a manifest; each tool flags
  `public` / `private`. Sharing = pointing toolboy at a repo. No marketplace needed at v1.

## Architecture decisions (so far)

| Decision | Choice |
|---|---|
| Form factor | Local-first PWA (Tauri wrap possible later for a true global hotkey) |
| Tool format | Built ESM bundles against `@toolboy/sdk` — **one contract for every tool**, yours or a stranger's |
| Execution | **Every** tool runs in a cross-origin sandboxed iframe; the SDK `ctx` is the *only* way a tool reaches anything outside its frame |
| Split screen | Up to **N** resizable glass panes; tools pass data via a typed **bus** (last-value sticky, whitelist coercion) |
| Entities | toolboy loads **entities** from a repo manifest. Two kinds today: **tools** (code) and **toolchains** (a composition of tools + layout + wiring). Both are first-class and handled uniformly: id, `visibility`, cross-repo refs, commit-pinned |
| Tool authoring | **External only** — entities are defined in a repo's `toolboy.json`, not authored inside toolboy |
| Sharing | Git repo + `toolboy.json` manifest listing entities, each with `visibility`. Loading = point toolboy at a repo |
| Security | **Sandbox-by-default.** Every tool runs in a cross-origin sandboxed iframe; capabilities (storage/secrets/net/bus) are postMessage-mediated by the host. In-process is an explicit trust upgrade. Secrets never reach tool code |
| Loading | **Stale-while-revalidate.** Pinned bundles are content-addressed and immutable → cache once, serve instantly. Poll a repo's mutable pointer (branch/HEAD) in the background; surface updates passively, never auto-apply. Offline falls out for free |
| Backend | **From the start** — a thin, stateless service: a `net` relay (CORS, SSRF-guarded, secrets injected by the *client*, never stored) and a read-only discovery index. Local-first state stays client-side |

## Stack (proposed)

**Client:** React + Vite + TypeScript · Tailwind + CSS-variable design tokens ·
`cmdk` (palette) · `react-resizable-panels` (split) · Dexie/IndexedDB (local state) ·
`vite-plugin-pwa` · manifests fetched from GitHub raw / jsDelivr.

**Backend (from start):** Cloudflare Workers + D1 (registry/index) + KV (cache) —
serves the `net` proxy, the discovery index, and publish. Edge, cheap, native `fetch`.

## Develop

The shell client (the visual surface — home, ⌘K palette, split panes + wiring,
and the host trust chrome) is implemented from the design system in
`src/`. It's a React + Vite + TypeScript app using the design tokens as CSS
custom properties.

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
```

- `src/styles/` — the design tokens (`colors`, `typography`, `spacing`, `glass`,
  `fonts`) + the global `index.css` entry. Self-hosted Hanken Grotesk + JetBrains Mono.
- `src/components/` — the design-system primitives (`Glass`, `Button`, `Kbd`,
  `Badge`, `Input`, `EntityRow`, `OriginBadge`, `Port`, `PermissionLine`, `Icon`).
- `src/shell/` — the surface: `Palette` (⌘K), `Panes` (split + wires), `Trust`
  (permission + secret chrome), `data`.
- `src/runtime/` — the **boundary**: tools run for real in cross-origin sandboxed
  iframes, with `ctx` (storage / secrets / net / bus / ui) proxied over a
  MessagePort the host mediates. See [docs/runtime.md](docs/runtime.md).
- `src/App.tsx` — orchestrator: theme, panes, wiring, palette, trust gate.

> The runtime boundary is implemented: every tool — yours or a stranger's — runs
> in an opaque-origin iframe with `connect-src 'none'` and reaches the world only
> through `ctx`. The bundled tools (`src/runtime/tools/`) are real tools authored
> against that contract, not React stand-ins. Still product runtime, not visual
> design: the registry/discovery backend and the `net` relay fallback are next.

## Status

Runtime boundary implemented — sandboxed iframes + the host-mediated `ctx` bridge
(storage, secrets, net allowlist + injection, bus, ui), exercised by the bundled
demo tools. Next: the git manifest loader and the registry/`net`-relay backend.
SDK contract — see [docs/sdk.md](docs/sdk.md) and [docs/runtime.md](docs/runtime.md).
