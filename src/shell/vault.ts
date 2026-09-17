/* toolboy vault — the durable copy of what the user owns.

   Everything a toolboy remembers lives in browser storage, which is keyed by ORIGIN.
   That makes it fast and offline and private, and it makes it fragile in one specific
   way: serve the shell on another port and you get a different, empty toolboy with no
   way back. Clearing site data does the same thing, permanently. IndexedDB is the right
   hot store — `ctx.storage.set()` should never block on a network — so the answer isn't
   to move the data, it's to keep a copy somewhere the browser doesn't own.

   That copy is a single JSON file:

   - **Export / import** — a file you can keep anywhere. This is also the migration
     path: moving to a new origin is export, switch, import.
   - **A folder** — pick one once and the vault mirrors every change into it. Put it in
     Dropbox or a git repo and you have sync and history without toolboy ever growing
     accounts, a server, or a single byte of your data leaving the machine.

   **Secrets are never in it.** security.md is firm that the keyring stays client-side;
   a file that syncs to a cloud drive is exactly what it must not end up in. The vault
   carries favourites and per-tool storage, and that's all.

   The folder half is Chromium-only (`showDirectoryPicker`), and the handle itself lives
   in IndexedDB — so it's origin-scoped too, and a port change costs you one click to
   re-pick the folder. That's the point: a recoverable failure instead of a silent one. */

import { meta, readAll, writeAll, type StorageEntry } from "../runtime/idb";
import { onDataChange } from "../lib/changes";
import { loadFavourites, saveFavourites, type Favourite } from "./favourites";

// The File System Access API's picker and permission methods aren't in lib.dom.
declare global {
  interface Window {
    showDirectoryPicker?: (opts?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: string;
    }) => Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemHandle {
    queryPermission?: (d?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (d?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  }
}

const FILENAME = "toolboy-vault.json";
const HANDLE_KEY = "vault.dir";
const STAMP_KEY = "vault.lastSaved";
/** writes are coalesced — toggling five favourites is one file write, not five */
const DEBOUNCE_MS = 1200;

export interface VaultSnapshot {
  kind: "toolboy.vault";
  version: 1;
  savedAt: string;
  note: string;
  favourites: Favourite[];
  storage: StorageEntry[];
}

export type VaultState = "unsupported" | "off" | "ready" | "needs-permission";

export interface VaultStatus {
  state: VaultState;
  /** directory name, once one is connected */
  folder?: string;
  lastSavedAt?: number;
}

export const folderSupported = (): boolean => typeof window.showDirectoryPicker === "function";

/* ---------------------------------------------------------------- snapshot */

/** Gather everything the vault covers. Deliberately not the keyring. */
export async function snapshot(): Promise<VaultSnapshot> {
  return {
    kind: "toolboy.vault",
    version: 1,
    savedAt: new Date().toISOString(),
    note: "toolboy favourites and per-tool storage. Secrets from the keyring are never included.",
    favourites: loadFavourites(),
    storage: await readAll(),
  };
}

/** Parse + validate a snapshot. Throws with something a human can act on — this runs
    against a file the user picked by hand, so "not a toolboy vault" beats a TypeError. */
export function parseSnapshot(text: string): VaultSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("that file isn't JSON");
  }
  const s = raw as Partial<VaultSnapshot>;
  if (!s || s.kind !== "toolboy.vault") throw new Error("that isn't a toolboy vault file");
  if (!Array.isArray(s.favourites) || !Array.isArray(s.storage)) throw new Error("vault file is missing its contents");
  return {
    kind: "toolboy.vault",
    version: 1,
    savedAt: typeof s.savedAt === "string" ? s.savedAt : "",
    note: "",
    // tolerate partial shapes the same way loadFavourites does — a malformed row
    // shouldn't cost the user the other 17
    favourites: s.favourites.filter(
      (f): f is Favourite =>
        !!f && typeof f.id === "string" && typeof f.source === "string" && typeof f.name === "string",
    ),
    storage: s.storage.filter(
      (e): e is StorageEntry =>
        !!e && typeof e.repo === "string" && typeof e.tool === "string" && typeof e.key === "string",
    ),
  };
}

/** Merge a snapshot into the live toolboy. Additive by design: importing a vault from
    another machine shouldn't silently drop what's on this one. Favourites union by id;
    storage entries overwrite by (repo, tool, key), incoming wins. */
export async function restore(snap: VaultSnapshot): Promise<{ favourites: number; entries: number }> {
  const existing = loadFavourites();
  const have = new Set(existing.map((f) => f.id));
  const added = snap.favourites.filter((f) => !have.has(f.id));
  if (added.length) saveFavourites([...existing, ...added]);
  await writeAll(snap.storage);
  return { favourites: added.length, entries: snap.storage.length };
}

/* -------------------------------------------------------------- file in/out */

/** Hand the user a copy. Plain download — works everywhere, needs no permission. */
export async function exportToFile(): Promise<void> {
  const text = JSON.stringify(await snapshot(), null, 2);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `toolboy-vault-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  // revoke on the next turn — Safari/Chrome need the URL alive across the click
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function importFromFile(file: File): Promise<{ favourites: number; entries: number }> {
  return restore(parseSnapshot(await file.text()));
}

/* ----------------------------------------------------------- folder mirror */

async function storedHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  return meta.get<FileSystemDirectoryHandle>(HANDLE_KEY);
}

async function permission(
  handle: FileSystemDirectoryHandle,
  ask: boolean,
): Promise<PermissionState> {
  const opts = { mode: "readwrite" as const };
  // both are optional in the typings because they're non-standard; if the browser
  // doesn't have them, a handle we hold is as good as granted
  const current = (await handle.queryPermission?.(opts)) ?? "granted";
  if (current === "granted" || !ask) return current;
  return (await handle.requestPermission?.(opts)) ?? "denied";
}

export async function status(): Promise<VaultStatus> {
  if (!folderSupported()) return { state: "unsupported" };
  const handle = await storedHandle();
  if (!handle) return { state: "off" };
  const lastSavedAt = await meta.get<number>(STAMP_KEY);
  const state = (await permission(handle, false)) === "granted" ? "ready" : "needs-permission";
  return { state, folder: handle.name, lastSavedAt };
}

/** Pick a folder. Must be called from a user gesture. */
export async function connectFolder(): Promise<VaultStatus> {
  if (!folderSupported()) return { state: "unsupported" };
  const handle = await window.showDirectoryPicker!({ id: "toolboy-vault", mode: "readwrite" });
  await meta.set(HANDLE_KEY, handle);
  await writeVault(handle);
  return status();
}

/** Re-grant after a restart dropped the permission. Also a user gesture. */
export async function regrantFolder(): Promise<VaultStatus> {
  const handle = await storedHandle();
  if (!handle) return { state: "off" };
  if ((await permission(handle, true)) === "granted") await writeVault(handle);
  return status();
}

/** Forget the folder. The file already written is left where it is — it's the user's. */
export async function disconnectFolder(): Promise<VaultStatus> {
  await meta.delete(HANDLE_KEY);
  await meta.delete(STAMP_KEY);
  return status();
}

/** Read the vault file back out of the connected folder (e.g. after switching origin
    and re-picking the same folder). Returns undefined when there's no file yet. */
export async function readFolderVault(): Promise<VaultSnapshot | undefined> {
  const handle = await storedHandle();
  if (!handle || (await permission(handle, false)) !== "granted") return undefined;
  try {
    const fh = await handle.getFileHandle(FILENAME);
    return parseSnapshot(await (await fh.getFile()).text());
  } catch {
    return undefined; // no file yet, or it isn't ours
  }
}

async function writeVault(handle: FileSystemDirectoryHandle): Promise<void> {
  const text = JSON.stringify(await snapshot(), null, 2);
  const fh = await handle.getFileHandle(FILENAME, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
  await meta.set(STAMP_KEY, Date.now());
}

let timer: number | undefined;
let inFlight = false;

/** Debounced mirror. Never throws at the caller: a full disk or a revoked folder must
    not break the `ctx.storage.set()` that triggered it — the status line is where that
    surfaces, and the data is still safe in IndexedDB either way. */
async function sync(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const handle = await storedHandle();
    if (handle && (await permission(handle, false)) === "granted") await writeVault(handle);
  } catch (err) {
    console.warn("[toolboy] vault mirror failed:", err instanceof Error ? err.message : err);
  } finally {
    inFlight = false;
  }
}

/** Start mirroring changes into the connected folder. Returns an unsubscribe. */
export function startMirror(): () => void {
  return onDataChange(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void sync(), DEBOUNCE_MS);
  });
}
