# Runtime — the host↔tool boundary

Status: **implemented** (local-dev shape). This is the spine from
[principles.md](principles.md) made real: a tool is a bundle that renders into a
sandboxed iframe and receives exactly one thing — `ctx`. Nothing reaches the tool
that didn't come through `ctx`; nothing leaves except through it.

Lives in `src/runtime/`.

## The frame

Every tool — yours or a stranger's — runs the same way (security.md: v1 is
sandbox-only, no in-process path):

- `<iframe sandbox="allow-scripts">` **without** `allow-same-origin` → the document
  loads at an **opaque (null) origin**. It cannot touch host cookies, `localStorage`,
  or IndexedDB. (Verified: the parent reading `iframe.contentDocument` gets `null`.)
- A strict CSP in the srcdoc: `default-src 'none'`, **`connect-src 'none'`** (the tool
  literally cannot `fetch` — all network must go through `ctx.net`), `script-src
  'unsafe-inline'` for the injected runtime + bundle, no `font-src` (fonts don't cross;
  the frame uses system fonts and gets the glass *look* via color/radius/shadow tokens).

> Local-dev vs production: here the bundle is injected inline into the srcdoc. In
> production a bundle is served from a **distinct sandbox origin** with a hashed/pinned
> `script-src` + SRI. Same boundary, stricter `script-src`. The isolation, CSP, and the
> entire `ctx` protocol are identical.

## The transport

The host transfers a `MessagePort` into the frame via a single `window.postMessage`
(targeted `"*"`, since the frame is null-origin). All traffic then flows over that
port — never over `window` again. The wire protocol is one file both sides import:
`src/runtime/protocol.ts`.

- `src/runtime/frameRuntime.ts` — the code that runs **inside** the frame. It waits
  for the port, builds `ctx` as a thin proxy over it, and calls the tool's mount fn.
- `src/runtime/host.ts` — `ToolBridge`, one per live frame. Mediates every request
  against that tool's manifest grants and routes the bus.
- `src/runtime/SandboxedTool.tsx` — React host: renders the iframe, attaches a bridge
  on load, translates the shell's prop-based data flow (input down, `onOutput` up) into
  bus messages. Input/theme changes travel over the port — the srcdoc is memoized so the
  frame never reloads.

## `ctx` — the only interface

| Capability | How it's mediated by the host |
|---|---|
| `storage` | Namespaced IndexedDB, keyed `"<toolId>::<key>"`. Denied entirely if `permissions.storage` is false. A tool only ever sees its own keys. |
| `secrets.has(name)` | Boolean only. **Raw secret values never cross the boundary.** Only manifest-declared names are even acknowledged. |
| `net.fetch` | Host checks the URL host against the tool's domain allowlist, **injects declared secrets** into request headers (host-side, from the keyring), performs the real fetch, returns a serialized response. A direct fetch is tried first; if it fails on CORS/network and a relay is configured (`VITE_NET_RELAY_URL`), the assembled request falls back to the backend relay ([backend/](../backend/)). Redirects are never followed on either path. |
| `bus.emit / on` | Host-owned. A tool emits/receives only on its **own** declared ports; it never addresses another tool. Wiring lives in the shell; the host routes emit → downstream inputs. |
| `ui.toast` | Drawn as host chrome, outside any tool frame — unspoofable. |

### A note on secrets — resolving an inconsistency in the drafts

[sdk.md](sdk.md) sketched `secrets.get(name): string`, but [principles.md](principles.md)
and [security.md](security.md) are firm: *secrets never enter tool code.* When the docs
conflict we resolve toward the rails. So the runtime exposes only **`secrets.has(name)`**
(enough for a tool to branch its UI). The raw value reaches the network exclusively via
host-side header injection in `ctx.net` — the tool sends a request and reads the response,
never the key. `sdk.md`'s `secrets.get` should be updated to match.

## The mount contract

A tool bundle is a classic script that calls one global:

```js
toolboy.tool(function (ctx, root) {
  // build UI into `root`, talk to the world only through `ctx`
  return optionalCleanup;
});
```

This primitive is framework-free on purpose. The `@toolboy/sdk` React flavor is sugar
over it:

```js
toolboy.tool((ctx, root) => {
  const r = createRoot(root);
  r.render(<Tool ctx={ctx} />);
  return () => r.unmount();
});
```

The bundled demo tools in `src/runtime/tools/` are the real thing, authored against this
contract: `color` (storage + emit + toast), `fetcher` (real `ctx.net` GET, allowlisted),
`jq` (input port + filter + storage), `jsonview` (sink), and two deliberately *foreign*
tools — `summarize` (declares `OPENAI_API_KEY`; host injects it; falls back to a stub when
the keyring is empty) and `regex` — that look nothing like toolboy yet sit inside the frame.

## What's next

- A git **manifest loader** ([manifest.md](manifest.md)): fetch a repo's `toolboy.json`,
  SRI-verify, and render the entity — replacing the in-repo demo dataset.
- The **backend** ([README](../README.md)): registry/discovery index and the `net` relay
  fallback for non-CORS endpoints.
