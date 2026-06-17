# Toolchains

Status: **design draft**.

A **toolchain** is a toolboy **entity**, handled exactly like a tool: it has an `id`
and `visibility`, lives in a repo's `toolboy.json`, can reference things across repos,
and is commit-pinned. The only difference from a tool is its payload — instead of code,
a toolchain is a named composition of tools, their split layout, and the wiring between
their ports. Loading a toolchain reconstructs the whole scene.

You can arrange panes and wire them live in-app, but persisting/sharing a toolchain is
the same path as any entity: it becomes an entry in the manifest. tools and toolchains
share one entity model (id, visibility, cross-repo refs, pinning, trust summary).

## Shape

```jsonc
{
  "id": "json-pipeline",
  "name": "JSON Pipeline",
  "visibility": "public",
  "tools": [
    { "ref": "fetcher",   "source": "self" },
    { "ref": "jq",        "source": "gh:someone/tools@a1b2c3d" },
    { "ref": "json-view", "source": "self" }
  ],
  "layout": { "type": "split", "dir": "row", "children": ["fetcher", "jq", "json-view"] },
  "wires": [
    { "from": ["fetcher", "out"], "to": ["jq", "in"] },
    { "from": ["jq", "out"],      "to": ["json-view", "in"] }
  ]
}
```

- **`tools[].ref`** is a tool id; **`source`** resolves where it comes from
  (`self` = same repo, or `gh:owner/repo@ref` for a cross-repo tool).
- A toolchain can pull tools from **multiple repos** — it's a dependency graph over tools.
- **`wires`** reference tool-local port ids (tools declare ports in their manifest).
- **Version pinning:** cross-repo refs pin a git ref/commit by default for
  reproducibility; can opt into floating (`@latest`).

## Loading a shared toolchain

1. Resolve each `tools[].ref` against its `source`.
2. **Update step:** if any referenced tool is missing, or pinned to an older commit
   than what's available, surface a single "update / install these" prompt and let the
   user accept before continuing.
3. Surface one **trust summary** aggregating every tool's declared permissions
   (storage / secrets / net domains) — one consent for the whole scene.
4. **Load partial:** rebuild layout + wires for everything that resolved; any tool that
   still can't load gets a **placeholder pane** with a fix/install affordance rather
   than blocking the whole toolchain.
5. Sticky last-values flow on connect.

## Decided

- **Pinning:** cross-repo refs pin a commit by default; opt into `@latest` per ref.
- **On load:** offer to update tools that need it *before* loading; then load partial
  with placeholders for anything still unresolved (never hard-block the scene).

## Open questions

- Does an arranged-but-unsaved scene persist locally (a "draft" toolchain) between
  sessions, or is it ephemeral until written to a manifest?
