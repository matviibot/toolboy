/* toolboy runtime — asking the browser to keep our data.

   Everything the user owns lives in browser storage: the home screen's favourites
   (localStorage), each tool's `ctx.storage` entries and the loader's content cache
   (IndexedDB). By default that whole bucket is "best-effort" — under storage
   pressure Chrome may evict an origin's data wholesale, without warning. A toolbox
   that forgets your pins is not a toolbox, so we ask for the `persistent` bucket:
   granted, the data is exempt from automatic eviction and only the user can clear it.

   This is a request, not a guarantee — browsers weigh engagement/installedness and
   may say no. It is also only half the story: storage is keyed by ORIGIN, so serving
   the shell on a different port is still a different, empty toolboy. That half is
   handled by pinning the dev port (vite.config.ts). */

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    // already granted on a previous visit — don't re-prompt the heuristics
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    // non-secure context, disabled storage, unsupported browser — best-effort it is
    return false;
  }
}
