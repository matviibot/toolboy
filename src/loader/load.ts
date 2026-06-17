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
import { parseSource, resolveSource, type Resolved } from "./resolver";
import { verifySri } from "./sri";

export interface LoadedRegistry {
  repoName: string;
  pin: string;
  all: Entity[];
  toolsById: Record<string, Tool>;
}

export interface LoadIssue {
  id: string;
  reason: string;
}

async function fetchManifest(sourceSpec: string, resolved: Resolved): Promise<{ manifest: Manifest; pin: string }> {
  try {
    const res = await fetch(resolved.manifestUrl);
    if (!res.ok) throw new Error(`manifest fetch ${res.status}`);
    const manifest = parseManifest(await res.json());
    await cache.putManifest(sourceSpec, { manifest, pin: resolved.pin, fetchedAt: Date.now() });
    return { manifest, pin: resolved.pin };
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
  const res = await fetch(resolved.entryUrl(tool.entry));
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

/** map a manifest toolchain → the shell's id-keyed model, dropping unresolved refs */
function toShellToolchain(e: ToolchainEntity, have: Set<string>): Toolchain | null {
  const refOf: Record<string, string> = {};
  e.tools.forEach((t) => (refOf[t.instance] = t.ref));
  const tools = e.layout.children.map((inst) => refOf[inst]).filter((ref) => ref && have.has(ref));
  if (tools.length === 0) return null;
  const wires = e.wires
    .map((w) => [refOf[w.from[0]], refOf[w.to[0]]] as [string, string])
    .filter(([a, b]) => have.has(a) && have.has(b));
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

export async function loadRegistry(
  sourceSpec: string,
  onIssue?: (issue: LoadIssue) => void,
): Promise<LoadedRegistry> {
  const resolved = await resolveSource(parseSource(sourceSpec));
  const { manifest, pin } = await fetchManifest(sourceSpec, resolved);

  const toolsById: Record<string, Tool> = {};
  const toolEntities: Tool[] = [];
  for (const e of manifest.entities) {
    if (e.kind !== "tool") continue;
    try {
      const source = await loadBundle(resolved, e);
      const tool = toShellTool(e, source);
      toolsById[tool.id] = tool;
      toolEntities.push(tool);
    } catch (err) {
      onIssue?.({ id: e.id, reason: err instanceof Error ? err.message : String(err) });
    }
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

  return { repoName: manifest.repo.name, pin, all, toolsById };
}

/** aggregate a toolchain's tools' permissions into one trust summary */
export function aggregatePerms(chain: Toolchain, toolsById: Record<string, Tool>) {
  const secrets = new Set<string>();
  const net = new Set<string>();
  let storage = false;
  chain.tools.forEach((tid) => {
    const t = toolsById[tid];
    if (!t) return;
    if (t.perms.storage) storage = true;
    t.perms.secrets.forEach((s) => secrets.add(s));
    t.perms.net.forEach((n) => net.add(n.domain));
  });
  return { storage, secrets: [...secrets], net: [...net] };
}
