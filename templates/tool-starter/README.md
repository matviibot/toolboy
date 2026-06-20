# toolboy tool starter

A minimal toolboy registry you can copy to start authoring tools. It ships one tool
([`tools/hello.js`](tools/hello.js)) and a [`toolboy.json`](toolboy.json) manifest.

## Layout

```
toolboy.json        # the manifest: declares your tools, their ports & permissions
tools/hello.js      # a tool — a classic script that calls toolboy.tool(...)
scripts/hash.mjs    # compute SRI hashes (needed to make a tool public)
```

## Use it

1. **Copy this folder** into a new git repo (or use it as a template repo) and push
   it to GitHub.
2. **Point toolboy at it.** In the ⌘K palette, load the source:
   ```
   gh:<owner>/<repo>@main
   ```
   If your manifest isn't at the repo root, add the sub-path:
   `gh:<owner>/<repo>@main#path/to/dir`. For local iteration you can also serve the
   folder and load it as a static source.
3. The **Hello** tool appears in the palette. Open it.

Tools are **private by default** (see `repo.defaults.visibility`), so they load with
no integrity hash — fast to iterate.

## Write your own tool

A tool is a single classic script that registers a mount function:

```js
toolboy.tool(function (ctx, root) {
  // render into `root`; reach the world only through `ctx`
  // ctx.storage / ctx.secrets / ctx.net / ctx.bus / ctx.ui / ctx.meta
});
```

`ctx` is the only interface a tool has — storage, secrets (existence only), net
(restricted to declared domains), the typed bus for wiring, and host-drawn UI. Add a
new tool by dropping a file in `tools/` and a matching entry in `toolboy.json`.

### TypeScript / React

Author against [`@toolboy/sdk`](../../packages/sdk) for typed `ctx` and a React
helper, then **bundle to a single classic script** (esbuild/rollup) — the sandbox
can't `import`, so all dependencies must be inlined:

```sh
esbuild src/tool.tsx --bundle --format=iife --outfile=tools/tool.js
```

## Make a tool public (shareable + discoverable)

Public tools are integrity-checked, so toolboy refuses a bundle that doesn't match
the recorded hash. To publish one:

1. Compute the hashes:
   ```sh
   node scripts/hash.mjs --write
   ```
   This fills in each tool's `integrity` in `toolboy.json`.
2. Set the tool's `"visibility": "public"` in the manifest.
3. Commit & push. **Re-run `hash.mjs` whenever you change a public tool's code** — an
   out-of-date hash will (correctly) fail to load.

To list a public tool in a backend discovery index, `POST /publish { source }` to your
backend (see [`backend/README.md`](../../backend/README.md)); send the
`Authorization: Bearer <token>` header if the backend sets `PUBLISH_TOKEN`.

## Reference

- [manifest.md](../../docs/manifest.md) — the full `toolboy.json` schema
- [sdk.md](../../docs/sdk.md) — the `ctx` contract
- [security.md](../../docs/security.md) — the sandbox & trust model
