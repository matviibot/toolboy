/* toolboy runtime — host-side persistent storage backing `ctx.storage`.

   A single IndexedDB object store keyed by the ARRAY key `[toolId, key]`. Using a
   structured array key (not a `"<toolId>::<key>"` string) means namespacing can't
   be spoofed: there's no delimiter to inject or to collide on, and `keys()` selects
   exactly one tool's entries via a key range rather than a string-prefix match. A
   tool only ever passes its own bare key; the host pairs it with the toolId, so one
   tool can never read another's data (security.md: "a tool sees only its own keys").

   NOTE: toolId is the manifest entity id, unique within a repo. Multi-repo loading
   will need to qualify this with the repo/pin to keep ids from different repos from
   sharing a namespace; today the single boot registry makes id sufficient. */

import { openDb, runTx } from "../lib/idb";

const db = openDb("toolboy", 1, ["kv"]);
const tx = <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) =>
  runTx<T>(db, "kv", mode, run);

/** key range covering every [toolId, *] entry — arrays sort after strings, so
    [toolId, []] is an exclusive-feeling upper bound past all string sub-keys */
const toolRange = (toolId: string) => IDBKeyRange.bound([toolId], [toolId, []]);

export const storage = {
  get: (toolId: string, key: string) => tx<unknown>("readonly", (s) => s.get([toolId, key])),
  set: (toolId: string, key: string, value: unknown) =>
    tx("readwrite", (s) => s.put(value, [toolId, key])).then(() => undefined),
  delete: (toolId: string, key: string) =>
    tx("readwrite", (s) => s.delete([toolId, key])).then(() => undefined),
  keys: async (toolId: string): Promise<string[]> => {
    const all = (await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys(toolRange(toolId)))) as [string, string][];
    return all.map((k) => k[1]);
  },
};
