# @toolboy/sdk

Types and helpers for authoring [toolboy](../../README.md) tools.

A tool runs inside toolboy's cross-origin sandboxed iframe. The host hands it a
`ctx` — its **only** interface to the world: storage, secrets (existence only),
net (allowlisted), a typed bus for tool-to-tool wiring, and host-drawn UI. This
package is just the types for `ctx` plus a thin, typed wrapper over the one global
the frame runtime exposes (`window.toolboy.tool`). It pulls in no runtime code.

## Install

```sh
npm install @toolboy/sdk
# React flavor also needs:
npm install react react-dom
```

## A tool, framework-free

```ts
import { tool } from "@toolboy/sdk";

tool((ctx, root) => {
  root.textContent = "hello from a toolboy tool";
  const off = ctx.bus.on<string>("in", (v) => (root.textContent = v));
  return off; // optional cleanup, called on unmount
});
```

## A tool with React

```tsx
import { defineTool } from "@toolboy/sdk/react";
import type { ToolContext } from "@toolboy/sdk";

function Hello({ ctx }: { ctx: ToolContext }) {
  return <button onClick={() => ctx.ui.toast("hi", "success")}>{ctx.meta.id}</button>;
}
defineTool(Hello);
```

## `ToolContext`

| Field      | What it gives you                                                            |
| ---------- | --------------------------------------------------------------------------- |
| `storage`  | per-tool KV (`get/set/delete/keys`), namespaced, IndexedDB-backed           |
| `secrets`  | `has(name)` only — the raw value never enters tool code (see below)          |
| `net`      | `fetch(url, init?)` restricted to your manifest's declared domains           |
| `bus`      | `emit(port, value)` / `on(port, fn)` over your declared ports                |
| `ui`       | `toast(msg, tone?)` and the live `theme` tokens                             |
| `meta`     | `{ id, visibility }`                                                         |

### Secrets never enter tool code

You don't read a key and attach it yourself. Declare it in the manifest and the
host injects it into the matching request:

```jsonc
"permissions": {
  "secrets": ["OPENAI_API_KEY"],
  "net": [
    { "domain": "api.openai.com",
      "inject": { "secret": "OPENAI_API_KEY", "header": "Authorization", "format": "Bearer {}" } }
  ]
}
```

Your code just calls `ctx.net.fetch("https://api.openai.com/...")`; the
`Authorization` header is added on the host. Use `ctx.secrets.has("OPENAI_API_KEY")`
to branch your UI between "connect a key" and "run".

## Packaging a tool

A tool ships as a single classic script that calls `toolboy.tool(...)` (bundle your
imports — the sandbox can't `import`). Reference it from a `toolboy.json` manifest,
and for a **public** tool record its SRI hash. See
[`templates/tool-starter`](../../templates/tool-starter) for a ready-to-copy repo,
and the [manifest](../../docs/manifest.md) / [SDK](../../docs/sdk.md) docs.

## Build & publish

This package ships compiled output in `dist/`:

```sh
npm install        # dev deps (typescript, @types/react*)
npm run build      # tsc → dist/{index,react}.{js,d.ts}
npm publish        # requires access to the @toolboy npm org
```

> Status: **0.1.0 scaffold.** Publish-ready but not yet on npm — `npm publish`
> needs the `@toolboy` org and credentials. Until then, tools can depend on it via a
> local path / git/tarball reference.
