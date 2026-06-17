/* toolboy runtime — host-side persistent storage backing `ctx.storage`.

   A single IndexedDB object store, keyed `"<toolId>::<key>"`. Namespacing is
   enforced here, on the host, not in the tool: a tool only ever passes its own
   bare key and the host prefixes it, so one tool can never read another's data
   (security.md: "Storage is namespaced per tool; a tool sees only its own keys"). */

const DB_NAME = "toolboy";
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const store = db.transaction(STORE, mode).objectStore(STORE);
        const req = run(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("indexedDB request failed"));
      }),
  );
}

const ns = (toolId: string, key: string) => `${toolId}::${key}`;

export const storage = {
  get: (toolId: string, key: string) => tx<unknown>("readonly", (s) => s.get(ns(toolId, key))),
  set: (toolId: string, key: string, value: unknown) =>
    tx("readwrite", (s) => s.put(value, ns(toolId, key))).then(() => undefined),
  delete: (toolId: string, key: string) =>
    tx("readwrite", (s) => s.delete(ns(toolId, key))).then(() => undefined),
  keys: async (toolId: string): Promise<string[]> => {
    const all = (await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys())) as string[];
    const prefix = `${toolId}::`;
    return all.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  },
};
