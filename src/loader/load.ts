/* toolboy loader — the orchestrator.

   loadRegistry(source):
     1. resolve the source to a pin + URLs (resolver.ts)
     2. fetch + validate toolboy.json (manifest.ts), cache it; fall back to the
        cached manifest when offline
     3. for each tool, fetch its entry bundle, SRI-verify it (public tools must
        pass), and cache it content-addressed (sri.ts / cache.ts)
     4. map manifest entities → the shell's Entity model, carrying the verified
        bundle text as `source` so SandboxedTool can run it

   Tools that fail to load/verify are skipped (load-partial, never hard-block —
   loading.md); toolchains drop refs that didn't resolve. */

import type { Entity, Tool, Toolchain } from "../shell/types";
import { cache } from "./cache";
import { parseManifest, type Manifest, type ToolEntity, type ToolchainEntity } from "./manifest";
import { parseSource, resolveSource, type Resolved, type Source } from "./resolver";
import { computeSri, verifySri } from "./sri";

export interface LoadedRegistry {
  /** the source spec this was loaded from — what revalidate() polls */
  source: string;
  repoName: string;
  pin: string;
  all: Entity[];
  toolsById: Record<string, Tool>;
}

export interface LoadIssue {
  id: string;
  reason: string;
}

/** The immutable pin the loaded bytes correspond to. github already resolves the
    mutable ref to a commit SHA; a static (same-origin) source has no commit, so its
    pin is the manifest's own content hash — "the same SWR/caching logic applies
    uniformly" (loading.md). Either way, a changed pin means "there's something newer". */
async function effectivePin(src: Source, resolved: Resolved, manifest: Manifest): Promise<string> {
  return src.kind === "static" ? await computeSri(JSON.stringify(manifest), "sha256") : resolved.pin;
}

async function fetchManifest(
  sourceSpec: string,
  src: Source,
  resolved: Resolved,
): Promise<{ manifest: Manifest; pin: string }> {
  try {
    // the manifest is the mutable pointer — always read it fresh, never from the HTTP
    // cache, or a moved pointer (new commit / changed file) is invisible to revalidate.
    // Bundles are immutable + content-addressed, so they still cache aggressively.
    const res = await fetch(resolved.manifestUrl, { cache: "no-store", headers: resolved.headers });
    if (!res.ok) throw new Error(`manifest fetch ${res.status}`);
    const manifest = parseManifest(await res.json());
    const pin = await effectivePin(src, resolved, manifest);
    await cache.putManifest(sourceSpec, { manifest, pin, fetchedAt: Date.now() });
    return { manifest, pin };
  } catch (err) {
    // offline / transient: serve the last good manifest if we have one
    const cached = await cache.getManifest(sourceSpec);
    if (cached) return { manifest: cached.manifest, pin: cached.pin };
    throw err;
  }
}

async function loadBundle(resolved: Resolved, tool: ToolEntity): Promise<string> {
  // content-addressed hit: a verified hash is forever the same bytes
  if (tool.integrity) {
    const hit = await cache.getBundle(tool.integrity);
    if (hit) return hit;
  }
  const res = await fetch(resolved.entryUrl(tool.entry), { headers: resolved.headers });
  if (!res.ok) throw new Error(`bundle ${tool.entry}: ${res.status}`);
  const text = await res.text();
  if (tool.integrity) {
    if (!(await verifySri(text, tool.integrity))) {
      throw new Error(`integrity check failed (bundle does not match recorded hash)`);
    }
    await cache.putBundle(tool.integrity, text);
  }
  return text;
}

function toShellTool(e: ToolEntity, source: string): Tool {
  return {
    id: e.id,
    kind: "tool",
    name: e.name,
    icon: e.icon ?? "box",
    description: e.description ?? "",
    origin: e.visibility === "public" ? "public" : "yours",
    ports: e.ports,
    perms: e.permissions,
    source,
  };
}

/** map a manifest toolchain → the shell model, preserving instance handles (so the
    same tool can appear twice) and port-qualified wires; drop unresolved instances */
function toShellToolchain(e: ToolchainEntity, have: Set<string>): Toolchain | null {
  const byInstance = new Map(e.tools.map((t) => [t.instance, t.ref] as const));
  // order by layout.children, keep only instances whose tool resolved
  const tools = e.layout.children
    .map((inst) => ({ instance: inst, toolId: byInstance.get(inst) ?? "" }))
    .filter((t) => t.toolId && have.has(t.toolId));
  if (tools.length === 0) return null;
  const kept = new Set(tools.map((t) => t.instance));
  const wires = e.wires
    .filter((w) => kept.has(w.from[0]) && kept.has(w.to[0]))
    .map((w) => ({ from: w.from[0], fromPort: w.from[1], to: w.to[0], toPort: w.to[1] }));
  return {
    id: e.id,
    kind: "toolchain",
    name: e.name,
    icon: e.icon ?? "workflow",
    description: e.description ?? "",
    origin: e.visibility === "public" ? "public" : "yours",
    tools,
    wires,
  };
}

/** Build the shell's registry from an already-fetched + validated manifest: fetch,
    SRI-verify, and content-address each tool bundle, then map entities. Shared by the
    boot load and by revalidate (where bundles are prefetched so accepting an update is
    instant and offline-ready). Bundle caching is purely additive — a verified hash is
    forever the same bytes — so prefetching before the user accepts is harmless. */
async function buildRegistry(
  sourceSpec: string,
  resolved: Resolved,
  manifest: Manifest,
  pin: string,
  onIssue?: (issue: LoadIssue) => void,
): Promise<LoadedRegistry> {
  // fetch + verify all tool bundles concurrently — they're independent, so this is
  // bounded by the slowest single bundle rather than their sum
  const toolDefs = manifest.entities.filter((e): e is ToolEntity => e.kind === "tool");
  const loaded = await Promise.all(
    toolDefs.map(async (e) => {
      try {
        return toShellTool(e, await loadBundle(resolved, e));
      } catch (err) {
        onIssue?.({ id: e.id, reason: err instanceof Error ? err.message : String(err) });
        return null;
      }
    }),
  );
  const toolsById: Record<string, Tool> = {};
  const toolEntities: Tool[] = [];
  for (const t of loaded) {
    if (t) { toolsById[t.id] = t; toolEntities.push(t); }
  }

  const have = new Set(Object.keys(toolsById));
  const chainEntities: Toolchain[] = [];
  for (const e of manifest.entities) {
    if (e.kind !== "toolchain") continue;
    const chain = toShellToolchain(e, have);
    if (chain) chainEntities.push(chain);
    else onIssue?.({ id: e.id, reason: "no referenced tools resolved" });
  }

  // preserve manifest order across the mixed entity list
  const order = new Map(manifest.entities.map((e, i) => [e.id, i] as const));
  const all = [...toolEntities, ...chainEntities].sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );

  return { source: sourceSpec, repoName: manifest.repo.name, pin, all, toolsById };
}

export async function loadRegistry(
  sourceSpec: string,
  onIssue?: (issue: LoadIssue) => void,
): Promise<LoadedRegistry> {
  const src = parseSource(sourceSpec);
  const resolved = await resolveSource(src);
  const { manifest, pin } = await fetchManifest(sourceSpec, src, resolved);
  return buildRegistry(sourceSpec, resolved, manifest, pin, onIssue);
}

/** What a revalidate turned up, by display name — the detail behind "N updates". */
export interface UpdateSummary {
  added: string[];
  removed: string[];
  changed: string[];
}

export interface RegistryUpdate {
  /** the newer pin the update would move to */
  pin: string;
  summary: UpdateSummary;
  /** the fully-built, bundle-verified registry to swap in on accept */
  registry: LoadedRegistry;
  /** persist the new manifest pointer so a later boot starts from the accepted version */
  commit: () => Promise<void>;
}

/** an entity's identity for change-detection: a tool changes when its bundle bytes
    change; a toolchain when its composition (tools/wires) changes */
function entitySig(e: Entity): string {
  return e.kind === "tool" ? e.source : JSON.stringify({ tools: e.tools, wires: e.wires });
}

function diffRegistries(prev: LoadedRegistry, next: LoadedRegistry): UpdateSummary {
  const before = new Map(prev.all.map((e) => [e.id, e]));
  const after = new Map(next.all.map((e) => [e.id, e]));
  return {
    added: next.all.filter((e) => !before.has(e.id)).map((e) => e.name),
    removed: prev.all.filter((e) => !after.has(e.id)).map((e) => e.name),
    changed: next.all
      .filter((e) => before.has(e.id) && entitySig(before.get(e.id)!) !== entitySig(e))
      .map((e) => e.name),
  };
}

/** Poll the source's mutable pointer for something newer than what's loaded
    (loading.md). Returns null when up to date; otherwise the prepared update —
    bundles already fetched + verified — for the host to surface passively and apply
    only on user accept. Never mutates the boot manifest pointer until commit(). */
export async function revalidate(
  current: LoadedRegistry,
  onIssue?: (issue: LoadIssue) => void,
): Promise<RegistryUpdate | null> {
  const src = parseSource(current.source);
  const resolved = await resolveSource(src);
  const res = await fetch(resolved.manifestUrl, { cache: "no-store", headers: resolved.headers });
  if (!res.ok) throw new Error(`manifest fetch ${res.status}`);
  const manifest = parseManifest(await res.json());
  const pin = await effectivePin(src, resolved, manifest);
  if (pin === current.pin) return null; // pointer hasn't moved — nothing newer

  const next = await buildRegistry(current.source, resolved, manifest, pin, onIssue);
  const summary = diffRegistries(current, next);
  // the pin moved but nothing the user sees changed (e.g. repo metadata, or a tool
  // that failed to verify on both sides) — quietly accept the new pointer, no prompt
  if (!summary.added.length && !summary.removed.length && !summary.changed.length) {
    await cache.putManifest(current.source, { manifest, pin, fetchedAt: Date.now() });
    return null;
  }
  return {
    pin,
    summary,
    registry: next,
    commit: () => cache.putManifest(current.source, { manifest, pin, fetchedAt: Date.now() }),
  };
}

/** aggregate a toolchain's tools' permissions into one trust summary */
export function aggregatePerms(chain: Toolchain, toolsById: Record<string, Tool>) {
  const secrets = new Set<string>();
  const net = new Set<string>();
  let storage = false;
  chain.tools.forEach(({ toolId }) => {
    const t = toolsById[toolId];
    if (!t) return;
    if (t.perms.storage) storage = true;
    t.perms.secrets.forEach((s) => secrets.add(s));
    t.perms.net.forEach((n) => net.add(n.domain));
  });
  return { storage, secrets: [...secrets], net: [...net] };
}
