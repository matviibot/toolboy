/* toolboy loader — local-first caches (loading.md).

   Two stores in a dedicated DB:
   - bundles  — content-addressed by SRI hash → bundle text. Only ever *adds*
     versions (a given hash is forever the same bytes), so there's no cache-bust
     problem and anything fetched once runs offline.
   - manifests — last-resolved manifest per source string, for instant boot and
     to diff against on revalidate.

   Separate DB from the per-tool `ctx.storage` ("toolboy" / "kv" in idb.ts) so the
   two concerns stay decoupled. */

import { openDb, runTx } from "../lib/idb";
import type { Manifest } from "./manifest";

const BUNDLES = "bundles";
const MANIFESTS = "manifests";

const db = openDb("toolboy-cache", 1, [BUNDLES, MANIFESTS]);
const tx = <T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) =>
  runTx<T>(db, store, mode, run);

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
