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

## Caching

- **Bundle cache** is content-addressed by commit/hash → only ever *adds* versions, never
  invalidates. No cache-busting problem.
- **Manifest cache** holds the last-resolved manifest per repo; refreshed by the poll.
- **Offline is a side effect, not a feature** — anything already fetched runs without a
  connection because immutable pins never need the network again.

## Integrity

The cached bundle is verified against the entity's recorded hash (SRI) on load, so a
compromised CDN/repo fails the check instead of executing. See [security.md](security.md).
