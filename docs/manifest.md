# Manifest (`toolboy.json`)

Status: **implemented in the client loader** (`src/loader/manifest.ts` parses +
validates this shape; the backend discovery index ([backend/](../backend/)) crawls it
for public entity cards). One file at the
repo root. It's the contract every layer reads: the client loader, the backend
discovery index, and the trust UI. A repo's branch/HEAD is the **mutable pointer**;
a specific commit is the **immutable pin** (see [loading.md](loading.md)).

## Shape

A repo declares **entities**. Two kinds today — `tool` (code) and `toolchain`
(composition) — in one array so they're addressed uniformly by `id`.

```jsonc
{
  "$schema": "https://toolboy.app/schema/v1.json",
  "manifestVersion": 1,

  "repo": {
    "name": "matvii-tools",
    "description": "My personal tools",
    "defaults": { "visibility": "private" }   // applied to entities that omit it
  },

  "entities": [
    {
      "id": "jq",                          // unique within repo, kebab-case
      "kind": "tool",
      "name": "jq",
      "description": "Filter and transform JSON",
      "icon": "braces",                    // icon name | emoji | relative path
      "tags": ["json", "transform"],       // palette search + discovery index
      "visibility": "public",

      "entry": "dist/jq.js",               // loadable ESM module (built or single-file)
      "integrity": "sha384-…",             // SRI hash of entry, verified on load

      "ports": {
        "accepts":  [{ "id": "in",  "type": "application/json" }],
        "provides": [{ "id": "out", "type": "application/json" }]
      },

      "permissions": {
        "storage": true,
        "secrets": [],
        "net": []
      }
    },

    {
      "id": "summarize",
      "kind": "tool",
      "name": "Summarize",
      "entry": "dist/summarize.js",
      "visibility": "private",
      "ports": {
        "accepts":  [{ "id": "in",  "type": "text/plain" }],
        "provides": [{ "id": "out", "type": "text/plain" }]
      },
      "permissions": {
        "storage": false,
        "secrets": ["OPENAI_API_KEY"],
        // net entries are objects so a domain can bind a secret the *host* injects;
        // tool code never sees the key (see security.md)
        "net": [
          {
            "domain": "api.openai.com",
            "inject": { "secret": "OPENAI_API_KEY", "header": "Authorization", "format": "Bearer {}" }
          }
        ]
      }
    },

    {
      "id": "json-pipeline",
      "kind": "toolchain",
      "name": "JSON Pipeline",
      "visibility": "public",
      // each instance has a local handle so the same tool can appear twice
      "tools": [
        { "instance": "a", "ref": "fetcher",   "source": "self" },
        { "instance": "b", "ref": "jq",        "source": "self" },
        { "instance": "c", "ref": "json-view", "source": "gh:someone/tools@a1b2c3d" }
      ],
      "layout": { "type": "split", "dir": "row", "children": ["a", "b", "c"] },
      "wires": [
        { "from": ["a", "out"], "to": ["b", "in"] },
        { "from": ["b", "out"], "to": ["c", "in"] }
      ]
    }
  ]
}
```

## Field reference

### Common (every entity)
| Field | Req | Notes |
|---|---|---|
| `id` | ✓ | Unique within the repo, kebab-case. Stable — refs depend on it |
| `kind` | ✓ | `"tool"` \| `"toolchain"` (discriminator) |
| `name` | ✓ | Display name |
| `description` | – | Shown in palette + discovery |
| `icon` | – | Icon name, emoji, or repo-relative path |
| `tags` | – | Search/discovery keywords |
| `visibility` | – | `"public"` \| `"private"`; defaults to `repo.defaults.visibility` |

### `kind: "tool"`
| Field | Req | Notes |
|---|---|---|
| `entry` | ✓ | Repo-relative path to a **built ESM bundle** (starter template wires the build) |
| `integrity` | required if `public` | SRI hash of `entry`, verified on load; optional for `private` |
| `ports.accepts` / `ports.provides` | – | `{ id, type }[]`; MIME-style types drive bus wiring |
| `permissions.storage` | – | bool; grants namespaced `ctx.storage` |
| `permissions.secrets` | – | secret names the tool may request |
| `permissions.net` | – | `{ domain, inject? }[]`; `inject` binds a secret the host attaches |

### `kind: "toolchain"`
| Field | Req | Notes |
|---|---|---|
| `tools` | ✓ | `{ instance, ref, source }[]`. `instance` is a local handle; `ref` is a tool id; `source` resolves it |
| `layout` | ✓ | Split tree referencing `instance` handles |
| `wires` | – | `{ from:[instance,port], to:[instance,port] }[]`; type-checked against ports |

### `source` grammar (toolchain tool refs)
- `"self"` — an entity in this same manifest
- `"gh:owner/repo@ref"` — GitHub; `ref` is a commit (pinned) or branch (floating)
- `"git+https://host/path.git#ref"` — generic git fallback

## Decided

1. **One `entities` array with a `kind` discriminator** — not separate arrays. Uniform
   addressing, one resolution/caching/trust path.
2. **`entry` = a built ESM bundle** the repo commits (allows npm deps + a clean hashable
   artifact). A starter template ships with the build wired, so an agent writes source
   and runs `build` — no hand-rolled bundler config.
3. **`integrity` required for `public` entities, optional for `private`.** Public tools
   others run must carry a verified SRI hash; your own private tools may skip it.
4. **`net.inject.format` = fixed enum** (`bearer` / `header` / `query`) with a value,
   not a free template — auditable secret attachment.

## Still open

- `net.inject` enum shape: e.g. `{ "scheme": "bearer" }`,
  `{ "scheme": "header", "name": "X-Api-Key" }`, `{ "scheme": "query", "name": "key" }`.
- Whether `layout` needs nested splits in v1 (`children` of `children`) or a flat row/col
  is enough to start.
