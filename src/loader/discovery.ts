/* toolboy loader — the discovery client.

   Talks to the backend discovery index (backend/src/discovery.ts) so the ⌘K
   palette can surface public tools that live in repos the user hasn't pointed at
   yet. A discovery hit is just a *card* — id, name, source. Opening one runs the
   normal loader against that card's source (resolver → manifest → SRI verify →
   trust gate), so discovery is a finder, never a trust shortcut.

   No backend configured (VITE_BACKEND_URL unset) → discovery is simply off and
   the palette shows only the user's own registry. */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, "");

/** Optional publish token. The backend gates /publish on a bearer token when its
    PUBLISH_TOKEN is set; this lets the client send it. NOTE: a VITE_* var is inlined
    into the shipped bundle, so a token baked in here is readable by anyone who loads
    the app — fine for a private/self-hosted build, but for a public deployment prefer
    operator-driven publishing (curl/CI with the token) over shipping it to clients. */
const PUBLISH_TOKEN = import.meta.env.VITE_PUBLISH_TOKEN;

/** True when a backend is configured — gates the palette's discovery affordance. */
export const discoveryEnabled = !!BACKEND_URL;

export interface DiscoveryCard {
  id: string;
  /** the source spec to load (resolver-parseable: gh:owner/repo@ref) */
  source: string;
  kind: "tool" | "toolchain";
  name: string;
  description: string;
  icon: string;
  tags: string[];
  repoName: string;
  pin: string;
}

/** Query the discovery index. Returns [] when no backend is configured or on any
    transient failure — discovery is strictly additive, it must never break search. */
export async function discover(query: string, signal?: AbortSignal): Promise<DiscoveryCard[]> {
  if (!BACKEND_URL) return [];
  const url = `${BACKEND_URL}/discover?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { entities?: DiscoveryCard[] };
    return Array.isArray(data.entities) ? data.entities : [];
  } catch {
    return []; // offline / aborted / backend down — show local results only
  }
}

/** Ask the index to (re)crawl a repo's toolboy.json and index its public entities. */
export async function publish(source: string): Promise<{ repo: string; pin: string; indexed: number }> {
  if (!BACKEND_URL) throw new Error("no backend configured (set VITE_BACKEND_URL)");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (PUBLISH_TOKEN) headers.authorization = `Bearer ${PUBLISH_TOKEN}`;
  const res = await fetch(`${BACKEND_URL}/publish`, {
    method: "POST",
    headers,
    body: JSON.stringify({ source }),
  });
  const data = (await res.json().catch(() => null)) as
    | { repo?: string; pin?: string; indexed?: number; error?: string }
    | null;
  if (!res.ok || !data || data.error) throw new Error(data?.error ?? `publish failed: ${res.status}`);
  return { repo: data.repo ?? source, pin: data.pin ?? "", indexed: data.indexed ?? 0 };
}
