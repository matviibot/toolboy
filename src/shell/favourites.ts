/* toolboy favourites — the home screen is *yours*: it shows only the tools you pin,
   nothing built-in. A favourite records enough to (a) reload the tool's repo at boot
   and (b) render its card even before/if that repo resolves (private repo with no
   token, repo gone offline, etc.) — so the home grid is never a pile of blank cards.

   Persisted to localStorage; entities themselves still come from git (loading.md), so
   we store only the pointer (id + source) plus a cached label for graceful display. */

export interface Favourite {
  /** entity id, unique within the merged registry */
  id: string;
  /** the gh: source spec to reload the entity's repo from at boot */
  source: string;
  /** cached for display so an unresolved favourite still renders meaningfully */
  name: string;
  icon: string;
  kind: "tool" | "toolchain";
}

const KEY = "toolboy.favourites.v1";

export function loadFavourites(): Favourite[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // tolerate partial/old shapes — keep only entries with the fields we depend on
    return parsed.filter(
      (f): f is Favourite =>
        f && typeof f.id === "string" && typeof f.source === "string" && typeof f.name === "string",
    );
  } catch {
    return [];
  }
}

export function saveFavourites(favs: Favourite[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(favs));
  } catch {
    // storage full / disabled — favourites just won't persist this session
  }
}

/** Toggle an entity's favourite status, returning the next list (caller persists +
    sets state). `source` is required to add; without it the entity can't be reloaded
    at boot, so the add is a no-op. */
export function toggleFavourite(
  favs: Favourite[],
  entity: { id: string; name: string; icon: string; kind: "tool" | "toolchain" },
  source: string | undefined,
): Favourite[] {
  if (favs.some((f) => f.id === entity.id)) return favs.filter((f) => f.id !== entity.id);
  if (!source) return favs;
  return [...favs, { id: entity.id, source, name: entity.name, icon: entity.icon, kind: entity.kind }];
}
