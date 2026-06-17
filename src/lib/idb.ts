/* Tiny IndexedDB helper shared by the runtime's per-tool storage (idb.ts) and the
   loader's content cache (cache.ts). Centralizes connection setup + transaction
   plumbing so the two stores don't each hand-roll — and drift on — the same
   boilerplate. Call openDb once per module (top-level) to memoize the connection. */

export function openDb(name: string, version: number, stores: string[]): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of stores) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(`indexedDB open failed: ${name}`));
  });
}

export function runTx<T>(
  db: Promise<IDBDatabase>,
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return db.then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = run(d.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("indexedDB request failed"));
      }),
  );
}
