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
    // Another tab still holds an older version open, so this upgrade can't start.
    // Without this the promise never settles and every storage call silently hangs
    // forever — the tab looks fine and simply stops remembering anything. Fail loudly
    // instead; the `onversionchange` below is what normally prevents it.
    req.onblocked = () =>
      reject(new Error(`indexedDB upgrade to v${version} blocked by another open tab: ${name}`));
    req.onsuccess = () => {
      const db = req.result;
      // A newer tab wants to upgrade: let go so it can. Holding the connection open
      // would deadlock the other tab; the reload it does next reopens ours cleanly.
      db.onversionchange = () => db.close();
      resolve(db);
    };
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
