/* A one-line pub/sub for "the user's data changed".

   Two unrelated modules own user data — `runtime/idb.ts` (per-tool storage) and
   `shell/favourites.ts` (the home screen) — and the vault has to mirror both. Rather
   than have either import the vault (runtime reaching into the shell, shell reaching
   into the mirror), both announce here and the vault listens. Leaf module, no imports,
   so nothing in the layering has to bend. */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Announce that something the vault should mirror has changed. Fire-and-forget:
    listeners are expected to debounce, and a throwing listener can't break the write
    that triggered it. */
export function emitDataChange(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // a broken mirror must never take down the store it's mirroring
    }
  }
}

/** Subscribe; returns an unsubscribe. */
export function onDataChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
