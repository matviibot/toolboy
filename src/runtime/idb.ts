/* toolboy runtime — host-side persistent storage backing `ctx.storage`.

   A single IndexedDB object store keyed by the ARRAY key `[repo, toolId, key]`. Using a
   structured array key (not a `"<toolId>::<key>"` string) means namespacing can't
   be spoofed: there's no delimiter to inject or to collide on, and `keys()` selects
   exactly one tool's entries via a key range rather than a string-prefix match. A
   tool only ever passes its own bare key; the host pairs it with the repo + toolId, so
   one tool can never read another's data (security.md: "a tool sees only its own keys").

   `repo` is the source's *identity* and not its pin (`gh:owner/repo`, never `@ref`):
   entity ids are unique only within a repo, so two repos shipping a tool called `words`
   would otherwise share one namespace — but keying on the pinned ref would orphan a
   tool's data every time it updated. See loader/resolver.ts `repoIdentity`. */

import { openDb, runTx } from "../lib/idb";
import { emitDataChange } from "../lib/changes";

/** v2 added the `meta` store (vault handle + bookkeeping); `kv` carries over untouched.

    Opened lazily rather than at import: touching `indexedDB` as a side effect of
    importing the module makes it unusable anywhere without a DOM (the test runner) and
    ties connection failures to import order. First actual read or write opens it. */
let conn: Promise<IDBDatabase> | undefined;
const db = () => (conn ??= openDb("toolboy", 2, ["kv", "meta"]));
const tx = <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) =>
  runTx<T>(db(), "kv", mode, run);

/** key range covering every [repo, toolId, *] entry — arrays sort after strings, so
    [repo, toolId, []] is an exclusive-feeling upper bound past all string sub-keys */
const toolRange = (repo: string, toolId: string) =>
  IDBKeyRange.bound([repo, toolId], [repo, toolId, []]);

export const storage = {
  get: (repo: string, toolId: string, key: string) =>
    tx<unknown>("readonly", (s) => s.get([repo, toolId, key])),
  set: (repo: string, toolId: string, key: string, value: unknown) =>
    tx("readwrite", (s) => s.put(value, [repo, toolId, key])).then(() => {
      emitDataChange();
    }),
  delete: (repo: string, toolId: string, key: string) =>
    tx("readwrite", (s) => s.delete([repo, toolId, key])).then(() => {
      emitDataChange();
    }),
  keys: async (repo: string, toolId: string): Promise<string[]> => {
    const all = (await tx<IDBValidKey[]>("readonly", (s) =>
      s.getAllKeys(toolRange(repo, toolId)),
    )) as [string, string, string][];
    return all.map((k) => k[2]);
  },
};

/** One entry of per-tool storage, flattened for export. */
export interface StorageEntry {
  repo: string;
  tool: string;
  key: string;
  value: unknown;
}

/** Every entry in the store — what the vault snapshots. Legacy 2-element keys (see
    `migrateLegacyKeys`) are reported under repo `""` so an export taken before a repo
    loads still carries the data rather than silently dropping it. */
export async function readAll(): Promise<StorageEntry[]> {
  const keys = (await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys())) as string[][];
  const values = await tx<unknown[]>("readonly", (s) => s.getAll());
  return keys.map((k, i) =>
    k.length === 3
      ? { repo: k[0], tool: k[1], key: k[2], value: values[i] }
      : { repo: "", tool: k[0], key: k[1], value: values[i] },
  );
}

/** Write entries back, overwriting by (repo, tool, key). Used by vault import. */
export async function writeAll(entries: StorageEntry[]): Promise<void> {
  for (const e of entries) {
    await tx("readwrite", (s) => s.put(e.value, [e.repo, e.tool, e.key]));
  }
  emitDataChange();
}

/** Move pre-`repo` entries (keyed `[toolId, key]`) into the namespaced key.

    Called once per boot with whatever tool → repo mapping the loaded registries give
    us. A legacy entry whose tool isn't in the mapping is LEFT ALONE, not guessed at and
    not deleted: its repo simply isn't loaded this session, and destroying a user's data
    to tidy a key is exactly the failure this whole change exists to prevent.

    Returns the number of entries moved. Idempotent — a second run finds nothing. */
export async function migrateLegacyKeys(repoByToolId: Record<string, string>): Promise<number> {
  const keys = (await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys())) as string[][];
  const legacy = keys.filter((k) => k.length === 2 && repoByToolId[k[0]]);
  let moved = 0;
  for (const [toolId, key] of legacy) {
    const repo = repoByToolId[toolId];
    const value = await tx<unknown>("readonly", (s) => s.get([toolId, key]));
    if (value === undefined) continue;
    // put-then-delete, never the reverse: a crash between the two leaves a duplicate,
    // which is recoverable; the other order loses the entry outright.
    await tx("readwrite", (s) => s.put(value, [repo, toolId, key]));
    await tx("readwrite", (s) => s.delete([toolId, key]));
    moved++;
  }
  if (moved) emitDataChange();
  return moved;
}

/** Small host-owned bookkeeping (the vault's directory handle, its last-synced
    stamp). Separate store: this is the host's own state, not any tool's. */
export const meta = {
  get: <T>(key: string) => runTx<T>(db(), "meta", "readonly", (s) => s.get(key) as IDBRequest<T>),
  set: (key: string, value: unknown) =>
    runTx(db(), "meta", "readwrite", (s) => s.put(value, key)).then(() => undefined),
  delete: (key: string) =>
    runTx(db(), "meta", "readwrite", (s) => s.delete(key)).then(() => undefined),
};
