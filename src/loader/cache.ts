/* toolboy loader — local-first caches (loading.md).

   Two stores in a dedicated DB:
   - bundles  — content-addressed by SRI hash → bundle text. Only ever *adds*
     versions (a given hash is forever the same bytes), so there's no cache-bust
     problem and anything fetched once runs offline.
   - manifests — last-resolved manifest per source string, for instant boot and
     to diff against on revalidate.

   Separate DB from the per-tool `ctx.storage` ("toolboy" / "kv" in idb.ts) so the
   two concerns stay decoupled. */

import type { Manifest } from "./manifest";

const DB_NAME = "toolboy-cache";
const BUNDLES = "bundles";
const MANIFESTS = "manifests";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BUNDLES)) db.createObjectStore(BUNDLES);
      if (!db.objectStoreNames.contains(MANIFESTS)) db.createObjectStore(MANIFESTS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("cache open failed"));
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("cache request failed"));
      }),
  );
}

export interface CachedManifest {
  manifest: Manifest;
  pin: string;
  fetchedAt: number;
}

export const cache = {
  getBundle: (hash: string) => tx<string | undefined>(BUNDLES, "readonly", (s) => s.get(hash)),
  putBundle: (hash: string, text: string) =>
    tx(BUNDLES, "readwrite", (s) => s.put(text, hash)).then(() => undefined),

  getManifest: (source: string) => tx<CachedManifest | undefined>(MANIFESTS, "readonly", (s) => s.get(source)),
  putManifest: (source: string, entry: CachedManifest) =>
    tx(MANIFESTS, "readwrite", (s) => s.put(entry, source)).then(() => undefined),
};
