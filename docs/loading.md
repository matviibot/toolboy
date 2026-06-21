# Loading, caching & updates

Status: **implemented** — fetch + SRI-verify + content-addressed bundle cache, offline
manifest fallback, *and* background revalidation (the poll → "updates available"
affordance) are live in `src/loader/` + `src/App.tsx`. toolboy is online-primary but
local-first; the model is **stale-while-revalidate**, correct *because* entities are
commit-pinned.

## Mutable pointer vs. immutable pin

Every entity reference has two parts:

- **Mutable pointer** — a repo + branch/HEAD ("what's the latest"). Polled to detect
  updates. Never executed directly.
- **Immutable pin** — `repo@commit` (→ content hash). The exact bytes that actually run.
  A given commit is forever the same content, so a pinned bundle is never stale.

Execution always uses the pin. The poll only reads the pointer to ask "is there a newer
commit than what I've pinned?"

## Behavior (online-primary)

1. **Serve from cache instantly.** Launching toolboy and opening tools touches no network
   on the critical path — bundles are served from the local content-addressed cache.
2. **Revalidate in the background.** While online *and* the tab is visible, poll connected
   repos' mutable pointers for new commits / new entities (`revalidate()`, on an interval +
   on regaining visibility/connectivity). The poll reads the pointer with `cache: "no-store"`
   — a moved pointer must never be masked by the HTTP cache. The github resolver re-reads the
   ref → commit SHA; a same-origin (static) source's pointer is the manifest's own content
   hash. The new bundles are fetched + SRI-verified up front so accepting is instant.
3. **Surface updates passively.** A quiet "N updates available" affordance (`UpdateBanner`)
   listing what changed (added / updated / removed); applied only on user accept, and a
   dismissed pin is not re-prompted until a newer one appears. Never a blocking refetch,
   never a silent version change — the manifest pointer is promoted to the cache only on
   accept. (This is the same update step the toolchain loader uses.)

## Source resolution (public vs. private)

A `gh:owner/repo@ref` source first resolves its ref → a commit SHA (the pin) via the
GitHub commits API, then reads `toolboy.json` + each bundle at that exact commit. *How*
those bytes are read depends on whether a token is configured (`src/loader/resolver.ts`):

- **Public repos (default, anonymous).** Files are read from `raw.githubusercontent.com`
  at the pinned commit — cache-friendly and unauthenticated. This is the zero-config path.
- **Private repos (with a token).** Set `VITE_GITHUB_TOKEN` (a GitHub PAT with
  `Contents: read` on the repo). The loader then sends `Authorization: Bearer …` and reads
  through the authenticated **Contents API** with the raw media type — which, unlike
  `raw.githubusercontent.com`, honors the token and so can read private repos. Without a
  token a private repo simply 404s (GitHub hides it), and the load is skipped. `api.github.com`
  is CORS-enabled, so this works from the browser. ⚠️ `VITE_*` vars are inlined into the
  built bundle — only use a token for a personal/local build; never ship it. See
  [`.env.example`](../.env.example).

Either way the manifest poll and bundle fetches carry the same headers, so revalidation
of a private source works identically to a public one.

### Loading a source directly

The ⌘K palette is primarily a search over loaded entities + the discovery index, but
typing a full `gh:owner/repo@ref[#subpath]` surfaces a **"Load …"** action that opens
that repo directly through the normal loader + trust gate — no discovery index required
(`src/shell/Palette.tsx` → `App.loadSource`). This is the "I already know the repo" path,
and the only way to load a *private* repo (discovery never indexes private entities).

## Caching

- **Bundle cache** is content-addressed by commit/hash → only ever *adds* versions, never
  invalidates. No cache-busting problem.
- **Manifest cache** holds the last-resolved manifest per repo; refreshed by the poll.
- **Offline is a side effect, not a feature** — anything already fetched runs without a
  connection because immutable pins never need the network again.

## Integrity

The cached bundle is verified against the entity's recorded hash (SRI) on load, so a
compromised CDN/repo fails the check instead of executing. See [security.md](security.md).
