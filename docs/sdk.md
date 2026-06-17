# toolboy SDK (`@toolboy/sdk`)

Status: **design draft**. This is the contract tools (mostly agent-authored) are
written against. One shape works for both trust tiers.

## A tool is a component + a manifest entry

```ts
import type { ToolContext } from "@toolboy/sdk";

export default function Tool({ ctx }: { ctx: ToolContext }) {
  // standard React. Use the design kit from @toolboy/sdk/ui for the glass look.
}
```

**v1 runs every tool the same way:** in a cross-origin sandboxed `iframe`. A tiny
`@toolboy/runtime` inside the frame bootstraps the default export and proxies `ctx` over
`postMessage` to the host. There is no in-process path in v1 (see
[security.md](security.md)) — so authoring is identical for your tools and others'.

## `ToolContext`

```ts
interface ToolContext {
  storage: Storage;   // namespaced per-tool KV (IndexedDB)
  secrets: Secrets;   // named keys, granted per-tool, declared in manifest
  net: Net;           // fetch wrapper; iframe tools restricted to declared domains
  bus: Bus;           // typed-port tool-to-tool data flow
  ui: UiKit;          // toasts, dialogs, theme tokens (also at @toolboy/sdk/ui)
  meta: { id: string; visibility: "public" | "private" };
}

interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

interface Secrets {
  // resolves only names declared in the manifest; prompts the user if missing
  get(name: string): Promise<string | undefined>;
}

interface Net {
  // tool frame has CSP connect-src 'none'; this call is bridged to the host, which
  // injects declared secrets and fetches directly (CORS) or via the relay fallback.
  // Restricted to manifest-declared domains.
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

interface Bus {
  emit(port: string, value: unknown): void;       // my declared output port
  on(port: string, fn: (value: any) => void): () => void; // my declared input port
}
```

## Ports & wiring

Ports are declared in the manifest so the shell knows them before loading code.

```jsonc
"ports": {
  "accepts":  [{ "id": "in",  "type": "application/json" }],
  "provides": [{ "id": "out", "type": "application/json" }]
}
```

Rules:

- **Tools never address each other.** They `emit`/`on` their own ports only.
- **The shell owns wiring** (A.out -> B.in), held per session in the pane graph.
- **Type-gated:** the shell only offers a wire when target `accepts` the source's
  `provides` type (with a small set of allowed coercions).
- **Sticky last-value:** each output port retains its latest value and replays it to
  newly wired/opened consumers immediately.
- **`selection`** is a built-in well-known channel for "send current selection to pane".

Content types: standard MIME (`text/plain`, `application/json`, `text/csv`,
`image/png` as Blob/dataURL) plus namespaced custom types (`x-toolboy/color`, ...).
A small registry in the SDK defines known types and coercions.

## Permissions (manifest-declared, shell-enforced)

A tool only gets what it declares; the shell surfaces this as a trust summary,
emphasized for public tools.

```jsonc
"permissions": {
  "storage": true,
  "secrets": ["OPENAI_API_KEY"],
  "net":     ["api.openai.com"]
}
```

## Decided

- **Sticky replay = last-value** (not a buffer/history).
- **Coercion = whitelist** (option c): quiet coercion only within a small safe set
  (e.g. `application/json` -> `text/plain`); anything outside requires an explicit
  adapter tool in the chain.

## Open questions

- Does `selection` carry type info, or is it always `text/plain` + optional rich payload?
- Backend proxy mode for `net`: opt-in per tool or global?
