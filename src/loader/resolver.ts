/* toolboy loader — resolves a source spec to concrete fetch URLs + a pin.

   "Entities come from git" (principles.md). A source is a mutable pointer
   (repo + branch) that resolves to an immutable pin (a specific commit), and
   execution always uses the pin (loading.md). This module turns a source string
   into { manifestUrl, entryUrl(path), pin } so the rest of the loader is
   transport-agnostic.

   Two resolvers today:
   - github — gh:owner/repo@ref; resolves a branch to its commit SHA via the
     GitHub API, then reads raw files at that exact commit. The real git path.
     Anonymous by default (public repos via raw.githubusercontent.com); when a
     VITE_GITHUB_TOKEN is configured it reads through the authenticated Contents
     API instead, which honors the token and so can load PRIVATE repos.
   - static — same-origin files under a base path; used for the bundled demo
     registry and for offline. The pin is the manifest's own content hash, so
     the same SWR/caching logic applies uniformly. */

export type Source =
  | { kind: "static"; base: string }
  | { kind: "github"; owner: string; repo: string; ref: string; sub?: string };

export interface Resolved {
  /** the exact commit (github) or content pin (static) the bytes come from */
  pin: string;
  manifestUrl: string;
  entryUrl: (repoRelativePath: string) => string;
  /** headers to send when fetching manifestUrl/entryUrl — carries the GitHub auth +
      raw media type for the authenticated (private-repo) path; undefined otherwise */
  headers?: Record<string, string>;
}

/** GitHub PAT used to read PRIVATE repos, from VITE_GITHUB_TOKEN (build-time, inlined
    into the bundle — see .env.example for the caveat). Read defensively: it's undefined
    in non-Vite contexts (Node tests, the backend), where loading stays anonymous. */
function githubToken(): string | undefined {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_GITHUB_TOKEN || undefined;
}

/** Parse a manifest `source` string into a Source. */
export function parseSource(spec: string, fallbackBase = "/registry"): Source {
  if (spec === "self") return { kind: "static", base: fallbackBase };
  // gh:owner/repo@ref[#subpath] — ref may contain slashes (e.g. feat/x), so a `#`
  // unambiguously fences off an optional in-repo directory holding toolboy.json. The
  // ref capture is [^#]+ (greedy up to the fence); the subpath is whatever follows.
  const gh = /^gh:([^/]+)\/([^@]+)@([^#]+)(?:#(.+))?$/.exec(spec);
  if (gh) return { kind: "github", owner: gh[1], repo: gh[2], ref: gh[3], sub: normalizeSub(gh[4]) };
  const git = /^git\+https?:\/\/.+#(.+)$/.exec(spec);
  if (git) throw new Error(`generic git sources not yet supported: ${spec}`);
  throw new Error(`unrecognized source: ${spec}`);
}

/** Strip surrounding slashes from a sub-path; an empty path (e.g. bare `@ref#`) is
    treated as no sub-path so it collapses back to the repo-root behavior. */
export function normalizeSub(sub: string | undefined): string | undefined {
  if (!sub) return undefined;
  const trimmed = sub.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed || undefined;
}

/** Resolve a Source to URLs + the immutable pin it reads from. `opts.token` overrides
    the configured VITE_GITHUB_TOKEN (used by tests to exercise the authenticated path
    without an inlined env var). */
export async function resolveSource(
  src: Source,
  opts?: { token?: string },
): Promise<Resolved> {
  if (src.kind === "static") {
    const base = src.base.replace(/\/$/, "");
    return {
      pin: "static",
      manifestUrl: `${base}/toolboy.json`,
      entryUrl: (p) => `${base}/${p.replace(/^\//, "")}`,
    };
  }

  const token = opts?.token ?? githubToken();
  // Auth header (when a token is configured) applies to both the ref→commit poll and
  // the file reads. It also lifts the API rate limit 60→5000/hr even for public repos.
  const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  // github: always resolve the ref to a canonical commit SHA — the immutable pin.
  // The commits API accepts a branch, tag, OR a sha and echoes back the sha, so we
  // never assume a hex-looking ref is already a commit (a branch named like a hash
  // would otherwise be used unpinned and 404 the raw fetch).
  // resolving the ref → commit IS the mutable-pointer poll; read it fresh so a new
  // commit on the branch is actually seen (a cached SHA would pin us to the past).
  const res = await fetch(`https://api.github.com/repos/${src.owner}/${src.repo}/commits/${src.ref}`, {
    headers: { Accept: "application/vnd.github.sha", ...auth },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`could not resolve ${src.owner}/${src.repo}@${src.ref}: ${res.status}`);
  const commit = (await res.text()).trim();

  // The sub-path (if any) shifts the base into a repo subdirectory; manifestUrl and
  // entryUrl both inherit it, and manifest `entry` paths stay relative to the manifest.
  const basePath = src.sub ? `${src.sub}/` : "";

  if (token) {
    // Authenticated path: read files through the Contents API with the raw media type.
    // Unlike raw.githubusercontent.com (which ignores Authorization), this honors the
    // token and so can read PRIVATE repos; api.github.com is CORS-enabled for browsers.
    const contents = (path: string) =>
      `https://api.github.com/repos/${src.owner}/${src.repo}/contents/` +
      `${basePath}${path.replace(/^\//, "")}?ref=${commit}`;
    return {
      pin: commit,
      manifestUrl: contents("toolboy.json"),
      entryUrl: contents,
      headers: { Accept: "application/vnd.github.raw", ...auth },
    };
  }

  // Anonymous path (public repos only): raw.githubusercontent.com — cache-friendly,
  // no token, no rate limit on the raw bytes.
  const rawBase =
    `https://raw.githubusercontent.com/${src.owner}/${src.repo}/${commit}` +
    (src.sub ? `/${src.sub}` : "");
  return {
    pin: commit,
    manifestUrl: `${rawBase}/toolboy.json`,
    entryUrl: (p) => `${rawBase}/${p.replace(/^\//, "")}`,
  };
}
