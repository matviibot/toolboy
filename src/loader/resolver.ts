/* toolboy loader — resolves a source spec to concrete fetch URLs + a pin.

   "Entities come from git" (principles.md). A source is a mutable pointer
   (repo + branch) that resolves to an immutable pin (a specific commit), and
   execution always uses the pin (loading.md). This module turns a source string
   into { manifestUrl, entryUrl(path), pin } so the rest of the loader is
   transport-agnostic.

   Two resolvers today:
   - github — gh:owner/repo@ref; resolves a branch to its commit SHA via the
     GitHub API, then reads raw files at that exact commit. The real git path.
   - static — same-origin files under a base path; used for the bundled demo
     registry and for offline. The pin is the manifest's own content hash, so
     the same SWR/caching logic applies uniformly. */

export type Source =
  | { kind: "static"; base: string }
  | { kind: "github"; owner: string; repo: string; ref: string };

export interface Resolved {
  /** the exact commit (github) or content pin (static) the bytes come from */
  pin: string;
  manifestUrl: string;
  entryUrl: (repoRelativePath: string) => string;
}

/** Parse a manifest `source` string into a Source. */
export function parseSource(spec: string, fallbackBase = "/registry"): Source {
  if (spec === "self") return { kind: "static", base: fallbackBase };
  const gh = /^gh:([^/]+)\/([^@]+)@(.+)$/.exec(spec);
  if (gh) return { kind: "github", owner: gh[1], repo: gh[2], ref: gh[3] };
  const git = /^git\+https?:\/\/.+#(.+)$/.exec(spec);
  if (git) throw new Error(`generic git sources not yet supported: ${spec}`);
  throw new Error(`unrecognized source: ${spec}`);
}

/** Resolve a Source to URLs + the immutable pin it reads from. */
export async function resolveSource(src: Source): Promise<Resolved> {
  if (src.kind === "static") {
    const base = src.base.replace(/\/$/, "");
    return {
      pin: "static",
      manifestUrl: `${base}/toolboy.json`,
      entryUrl: (p) => `${base}/${p.replace(/^\//, "")}`,
    };
  }

  // github: always resolve the ref to a canonical commit SHA — the immutable pin.
  // The commits API accepts a branch, tag, OR a sha and echoes back the sha, so we
  // never assume a hex-looking ref is already a commit (a branch named like a hash
  // would otherwise be used unpinned and 404 the raw fetch).
  // resolving the ref → commit IS the mutable-pointer poll; read it fresh so a new
  // commit on the branch is actually seen (a cached SHA would pin us to the past).
  const res = await fetch(`https://api.github.com/repos/${src.owner}/${src.repo}/commits/${src.ref}`, {
    headers: { Accept: "application/vnd.github.sha" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`could not resolve ${src.owner}/${src.repo}@${src.ref}: ${res.status}`);
  const commit = (await res.text()).trim();
  const rawBase = `https://raw.githubusercontent.com/${src.owner}/${src.repo}/${commit}`;
  return {
    pin: commit,
    manifestUrl: `${rawBase}/toolboy.json`,
    entryUrl: (p) => `${rawBase}/${p.replace(/^\//, "")}`,
  };
}
