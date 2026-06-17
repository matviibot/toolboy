# Loading, caching & updates

Status: **partially implemented** — fetch + SRI-verify + content-addressed bundle
cache + offline manifest fallback are live in `src/loader/`; background revalidation
(the poll → "updates available") is still to come. toolboy is online-primary but
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
2. **Revalidate in the background.** While online, poll connected repos' mutable pointers
   for new commits / new entities.
3. **Surface updates passively.** A quiet "N updates available" affordance; applied only
   on user accept. Never a blocking refetch, never a silent version change. (This is the
   same update step the toolchain loader uses.)

## Caching

- **Bundle cache** is content-addressed by commit/hash → only ever *adds* versions, never
  invalidates. No cache-busting problem.
- **Manifest cache** holds the last-resolved manifest per repo; refreshed by the poll.
- **Offline is a side effect, not a feature** — anything already fetched runs without a
  connection because immutable pins never need the network again.

## Integrity

The cached bundle is verified against the entity's recorded hash (SRI) on load, so a
compromised CDN/repo fails the check instead of executing. See [security.md](security.md).
