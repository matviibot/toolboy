# Persistence — where a tool's state actually lives

A tool calls `ctx.storage.set("favourites", [...])` and reasonably assumes that's the
end of it. This doc is what the host does to make that true, and the one way it can
still fail.

## The three decisions

Persistence looks like one question and is really three. Keeping them apart is what
makes it tractable.

| | |
|---|---|
| **The key** | what a piece of data belongs to |
| **The hot store** | what a tool reads and writes at runtime |
| **The durable copy** | what survives the browser |

## 1. The key: `[repo, toolId, key]`

Entity ids are unique **within a repo** — `manifest.md` says so, and two people are
each entitled to ship a tool called `words`. Keying storage on the bare id means the
second repo you load quietly inherits the first one's data. So the host pairs the id
with the repo the tool came from.

`repo` is the source's *identity*, never its pin:

```
gh:matviibot/tools@main      ─┐
gh:matviibot/tools@a1b2c3d   ─┼─→  gh:matviibot/tools
gh:matviibot/tools@feat/x    ─┘
```

Keying on the full spec would look more precise and would be a disaster: a tool's data
would vanish every time its repo moved to a new commit. A **sub-path** *is* part of the
identity (two manifests in one repo are two toolboxes); the ref is not. See
`repoIdentity` in [`src/loader/resolver.ts`](../src/loader/resolver.ts).

Entries written before this rule (keyed `[toolId, key]`) are moved as soon as the repo
that owns them loads. A legacy entry whose repo *isn't* loaded is left exactly where it
is — not guessed at, not cleaned up. Deleting a user's data to tidy a key would be the
same class of mistake this key exists to prevent.

## 2. The hot store: IndexedDB, and it stays that way

`ctx.storage` is local and synchronous-feeling on purpose. A tool's `set()` should never
block on a network, fail because the user is on a train, or need error handling for
someone else's outage. That rules out making the durable copy the primary store, however
appealing "it's on a server so it's safe" sounds.

## 3. The durable copy: the vault

Browser storage is keyed by **origin**. Serve the shell on another port and you get a
different, empty toolboy — not corrupted, not recoverable, just gone, with the old data
still sitting there under an origin nothing is served on any more. Clearing site data
does the same thing permanently. Two mitigations, in order of how much they actually buy:

**The vault** ([`src/shell/vault.ts`](../src/shell/vault.ts)) keeps a copy outside the
browser's control, as one JSON file:

- **Export / import** — a file you keep wherever you like. This is also the migration
  path: moving origin is export, switch, import.
- **A folder** — pick one once and every change is mirrored into it (debounced). Point
  it at a synced drive or a git repo and you get sync and history without toolboy
  growing accounts, a server, or any data leaving the machine.

**Persistent storage** (`src/runtime/persist.ts`) asks the browser not to evict the
origin under storage pressure. Worth doing, but understand what it is: a request that
Chrome grants on engagement heuristics — a bare localhost dev origin is routinely
refused, and `navigator.storage.persisted()` is the only honest way to know.

### What the vault does not contain

**Secrets.** The keyring is in-memory and host-only by design ([security.md](security.md)),
and a file that syncs to a cloud drive is precisely where secret material must not go.
The vault carries favourites and per-tool storage. That's the whole list.

### What it costs

The directory handle lives in IndexedDB, so it is origin-scoped like everything else:
change the port and you re-pick the folder once. That's the deliberate trade — the
failure becomes one click instead of silent and permanent. `showDirectoryPicker` is
Chromium-only; export and import work everywhere.

## Why not a server

It's the obvious answer and it's the wrong one here, for reasons that are structural
rather than effortful:

- It needs **identity**, which toolboy has nowhere. Accounts are a product, not a feature.
- [principles.md](principles.md): *"The host caches and indexes; it never becomes the
  source of truth."* That's said about entities, but a toolbox whose user data lives on
  someone's server is no longer local-first in any meaningful sense.
- The Worker's stated guarantee is that it is **stateless** ([backend/README.md](../backend/README.md)).
  A user-data store retracts that, and the relay's security story leans on it.
- It changes `ctx.storage`'s semantics without changing its shape — the worst kind of
  change. Same four methods, but now they can lag, fail, or conflict.

The folder mirror gets most of what a server would (durability, sync, history) and keeps
all of that. If toolboy ever grows accounts for another reason, revisit it then — the
key from §1 is already the right shape to sync on.

## The tool-facing contract

Unchanged, and that's the point. No new `ctx` method, no `"sync": true` in a manifest,
no way for a tool to know or care whether a vault is connected. Durability is the host's
job. A new knob on the boundary would be a smell ([principles.md](principles.md)).
