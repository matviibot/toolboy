/* toolboy discovery index — POST /publish (crawl) + GET /discover (query).

   The backend's second inhabitant. It does NOT execute or even fully validate
   tools — it stores *discovery cards* (id, kind, name, description, tags, icon)
   for public entities so the ⌘K palette can surface tools that live in repos the
   user hasn't pointed at yet. When the user opens one, the client loads that
   entity's source repo through the normal loader (resolver → manifest → SRI), so
   the index is a finder, never a trust shortcut.

   Populate model: crawl-on-publish. POST /publish { source } pulls that repo's
   toolboy.json on demand, extracts its public cards, and replaces the rows for
   that source. No background crawler. Publish is open by default (fine for a
   personal/self-hosted index); set PUBLISH_TOKEN to require a bearer token on a
   shared deployment (checkPublishAuth below).

   Only `public` entities are indexed: a private tool's metadata never leaves the
   user's own registry. */

import { bearerToken, json, timingSafeEqual } from "./http";
import type { Env } from "./env";

export interface DiscoveryCard {
  id: string;
  source: string; // the source spec the client loads to open this entity
  kind: "tool" | "toolchain";
  name: string;
  description: string;
  icon: string;
  tags: string[];
  repoName: string;
  pin: string;
}

// gh:owner/repo@ref[#subpath]. Kept byte-identical to src/loader/resolver.ts's parse
// so the crawl reads exactly the path the client loads — a `#` fences off an optional
// in-repo directory because the ref itself may contain slashes (e.g. feat/x).
const GH_RE = /^gh:([^/]+)\/([^@]+)@([^#]+)(?:#(.+))?$/;

function parseGh(source: string): { owner: string; repo: string; ref: string; sub?: string } {
  const m = GH_RE.exec(source);
  if (!m) throw new Error(`unsupported source (expected gh:owner/repo@ref[#subpath]): ${source}`);
  const sub = m[4]?.replace(/^\/+/, "").replace(/\/+$/, "") || undefined;
  return { owner: m[1], repo: m[2], ref: m[3], sub };
}

/** Resolve a gh: source to a raw toolboy.json URL at an immutable commit — mirrors
    src/loader/resolver.ts so the index reads exactly what the client would. Exported
    for tests that pin the crawl path against the loader's. */
export async function resolveManifestUrl(source: string): Promise<{ url: string; pin: string }> {
  const { owner, repo, ref, sub } = parseGh(source);
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${ref}`, {
    headers: { Accept: "application/vnd.github.sha", "User-Agent": "toolboy-discovery" },
  });
  if (!res.ok) throw new Error(`could not resolve ${owner}/${repo}@${ref}: ${res.status}`);
  const pin = (await res.text()).trim();
  const dir = sub ? `/${sub}` : "";
  return { url: `https://raw.githubusercontent.com/${owner}/${repo}/${pin}${dir}/toolboy.json`, pin };
}

/** Pull just the discovery fields for the public entities of a manifest. Deliberately
    lean — ports/permissions aren't needed to *find* a tool; the client re-reads the
    full manifest when it actually loads one. Malformed entries are skipped, not fatal. */
export function extractCards(raw: unknown, source: string, pin: string): { repoName: string; cards: DiscoveryCard[] } {
  if (!raw || typeof raw !== "object") throw new Error("manifest is not an object");
  const m = raw as Record<string, unknown>;
  if (m.manifestVersion !== 1) throw new Error(`unsupported manifestVersion ${String(m.manifestVersion)}`);

  const repoRaw = (m.repo ?? {}) as Record<string, unknown>;
  const repoName = typeof repoRaw.name === "string" ? repoRaw.name : "untitled repo";
  const defaultVis = ((repoRaw.defaults as Record<string, unknown>)?.visibility as string) ?? "private";
  if (!Array.isArray(m.entities)) throw new Error("entities must be an array");

  const cards: DiscoveryCard[] = [];
  for (const e of m.entities as Record<string, unknown>[]) {
    if (!e || typeof e !== "object") continue;
    const kind = e.kind;
    if (kind !== "tool" && kind !== "toolchain") continue;
    const visibility = (e.visibility as string) ?? defaultVis;
    if (visibility !== "public") continue; // private entities are never indexed
    if (typeof e.id !== "string" || typeof e.name !== "string") continue;
    cards.push({
      id: e.id,
      source,
      kind,
      name: e.name,
      description: typeof e.description === "string" ? e.description : "",
      icon: typeof e.icon === "string" ? e.icon : kind === "toolchain" ? "workflow" : "box",
      tags: Array.isArray(e.tags) ? (e.tags as unknown[]).filter((t): t is string => typeof t === "string") : [],
      repoName,
      pin,
    });
  }
  return { repoName, cards };
}

/** Gate POST /publish. When PUBLISH_TOKEN is configured the request must carry a
    matching `Authorization: Bearer <token>` (constant-time compared); when it's
    unset, publish stays open — fine for a personal/self-hosted index, and it keeps
    `npm run dev` frictionless. Returns a 401 Response to short-circuit, or null to
    proceed. */
export function checkPublishAuth(req: Request, env: Env, cors: Record<string, string>): Response | null {
  const expected = env.PUBLISH_TOKEN;
  if (!expected) return null; // open mode
  const got = bearerToken(req);
  if (!got || !timingSafeEqual(got, expected)) {
    return json({ error: "publish requires a valid bearer token" }, 401, {
      ...cors,
      "WWW-Authenticate": "Bearer",
    });
  }
  return null;
}

export async function handlePublish(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const denied = checkPublishAuth(req, env, cors);
  if (denied) return denied;

  let body: { source?: string };
  try {
    body = (await req.json()) as { source?: string };
  } catch {
    return json({ error: "invalid JSON body" }, 400, cors);
  }
  const source = body.source;
  if (typeof source !== "string" || !source) return json({ error: "missing source" }, 400, cors);

  let manifestUrl: string;
  let pin: string;
  try {
    ({ url: manifestUrl, pin } = await resolveManifestUrl(source));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400, cors);
  }

  const mres = await fetch(manifestUrl);
  if (!mres.ok) return json({ error: `toolboy.json fetch failed: ${mres.status}` }, 502, cors);

  let extracted: { repoName: string; cards: DiscoveryCard[] };
  try {
    extracted = extractCards(await mres.json(), source, pin);
  } catch (e) {
    return json({ error: `invalid toolboy.json: ${e instanceof Error ? e.message : e}` }, 422, cors);
  }

  // Replace this source's rows atomically: crawl-on-publish is the source of truth
  // for a source, so an entity removed/un-published upstream disappears from the index.
  const now = Date.now();
  const stmts = [env.DB.prepare("DELETE FROM entities WHERE source = ?").bind(source)];
  for (const c of extracted.cards) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO entities (id, source, kind, name, description, icon, tags, repo_name, pin, indexed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(c.id, source, c.kind, c.name, c.description, c.icon, JSON.stringify(c.tags), c.repoName, pin, now),
    );
  }
  await env.DB.batch(stmts);

  return json({ source, repo: extracted.repoName, pin, indexed: extracted.cards.length }, 200, cors);
}

interface EntityRow {
  id: string;
  source: string;
  kind: "tool" | "toolchain";
  name: string;
  description: string;
  icon: string;
  tags: string;
  repo_name: string;
  pin: string;
}

export async function handleDiscover(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const tag = (params.get("tag") ?? "").trim().toLowerCase();
  const limit = Math.min(Number(params.get("limit")) || 50, 100);

  // SQL is a cheap pre-filter (LIKE over name/description/tags); rank is refined in JS.
  const where: string[] = [];
  const binds: unknown[] = [];
  if (q) {
    where.push("(LOWER(name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(tags) LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (tag) {
    where.push("LOWER(tags) LIKE ?");
    binds.push(`%"${tag}"%`); // tags is a JSON array string; match a whole element
  }
  const sql =
    `SELECT id, source, kind, name, description, icon, tags, repo_name, pin FROM entities` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    ` ORDER BY name LIMIT ?`;
  binds.push(limit);

  const { results } = await env.DB.prepare(sql).bind(...binds).all<EntityRow>();
  const cards: DiscoveryCard[] = (results ?? []).map((r) => ({
    id: r.id,
    source: r.source,
    kind: r.kind,
    name: r.name,
    description: r.description,
    icon: r.icon,
    tags: safeTags(r.tags),
    repoName: r.repo_name,
    pin: r.pin,
  }));
  return json({ entities: cards }, 200, cors);
}

function safeTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}
