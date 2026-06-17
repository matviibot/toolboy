/* toolboy loader — the toolboy.json schema and a pragmatic validator.

   This is the shape every layer reads (manifest.md). The loader parses a repo's
   manifest into these types before any code is fetched, so the shell knows an
   entity's ports, permissions, and trust posture up front. Validation is
   hand-rolled (clear messages over a schema engine) since the shape is small. */

export interface PortSpec {
  id: string;
  type: string;
}

export interface NetGrant {
  domain: string;
  inject?: { secret: string; header: string; format: string };
}

export interface Permissions {
  storage: boolean;
  secrets: string[];
  net: NetGrant[];
}

export interface ManifestPorts {
  accepts: PortSpec[];
  provides: PortSpec[];
}

export interface ToolEntity {
  id: string;
  kind: "tool";
  name: string;
  description?: string;
  icon?: string;
  tags?: string[];
  visibility: "public" | "private";
  entry: string;
  integrity?: string;
  ports: ManifestPorts;
  permissions: Permissions;
}

export interface ToolchainTool {
  instance: string;
  ref: string;
  source: string; // "self" | "gh:owner/repo@ref" | "git+https://…#ref"
}

export interface ToolchainEntity {
  id: string;
  kind: "toolchain";
  name: string;
  description?: string;
  icon?: string;
  tags?: string[];
  visibility: "public" | "private";
  tools: ToolchainTool[];
  layout: { type: "split"; dir: "row" | "col"; children: string[] };
  wires: { from: [string, string]; to: [string, string] }[];
}

export type ManifestEntity = ToolEntity | ToolchainEntity;

export interface Manifest {
  manifestVersion: number;
  repo: { name: string; description?: string; defaults?: { visibility?: "public" | "private" } };
  entities: ManifestEntity[];
}

class ManifestError extends Error {
  constructor(msg: string) {
    super(`toolboy.json: ${msg}`);
    this.name = "ManifestError";
  }
}

function asArray(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) throw new ManifestError(`${where} must be an array`);
  return v;
}

function asStr(v: unknown, where: string): string {
  if (typeof v !== "string" || !v) throw new ManifestError(`${where} must be a non-empty string`);
  return v;
}

function parsePorts(raw: Record<string, unknown> | undefined): ManifestPorts {
  const ports = (raw ?? {}) as { accepts?: unknown; provides?: unknown };
  const one = (list: unknown, where: string): PortSpec[] =>
    (list ? asArray(list, where) : []).map((p, i) => {
      const o = p as Record<string, unknown>;
      return { id: asStr(o.id, `${where}[${i}].id`), type: asStr(o.type, `${where}[${i}].type`) };
    });
  return { accepts: one(ports.accepts, "ports.accepts"), provides: one(ports.provides, "ports.provides") };
}

function parsePermissions(raw: Record<string, unknown> | undefined): Permissions {
  const p = (raw ?? {}) as { storage?: unknown; secrets?: unknown; net?: unknown };
  const net = (p.net ? asArray(p.net, "permissions.net") : []).map((n, i) => {
    const o = n as Record<string, unknown>;
    const grant: NetGrant = { domain: asStr(o.domain, `permissions.net[${i}].domain`) };
    if (o.inject) {
      const inj = o.inject as Record<string, unknown>;
      grant.inject = {
        secret: asStr(inj.secret, `permissions.net[${i}].inject.secret`),
        header: asStr(inj.header, `permissions.net[${i}].inject.header`),
        format: asStr(inj.format, `permissions.net[${i}].inject.format`),
      };
    }
    return grant;
  });
  return { storage: p.storage === true, secrets: (p.secrets as string[]) ?? [], net };
}

/** Parse + validate raw JSON into a typed Manifest, applying repo defaults. */
export function parseManifest(raw: unknown): Manifest {
  if (!raw || typeof raw !== "object") throw new ManifestError("not an object");
  const m = raw as Record<string, unknown>;
  if (m.manifestVersion !== 1) throw new ManifestError(`unsupported manifestVersion ${String(m.manifestVersion)} (expected 1)`);

  const repoRaw = (m.repo ?? {}) as Record<string, unknown>;
  const defaultVis = ((repoRaw.defaults as Record<string, unknown>)?.visibility as "public" | "private") ?? "private";
  const repo = {
    name: asStr(repoRaw.name, "repo.name"),
    description: typeof repoRaw.description === "string" ? repoRaw.description : undefined,
    defaults: { visibility: defaultVis },
  };

  const ids = new Set<string>();
  const entities = asArray(m.entities, "entities").map((raw, idx): ManifestEntity => {
    const e = raw as Record<string, unknown>;
    const id = asStr(e.id, `entities[${idx}].id`);
    if (ids.has(id)) throw new ManifestError(`duplicate entity id "${id}"`);
    ids.add(id);
    const visibility = (e.visibility as "public" | "private") ?? defaultVis;
    const common = {
      id,
      name: asStr(e.name, `entities[${idx}].name`),
      description: typeof e.description === "string" ? e.description : undefined,
      icon: typeof e.icon === "string" ? e.icon : undefined,
      tags: Array.isArray(e.tags) ? (e.tags as string[]) : undefined,
      visibility,
    };

    if (e.kind === "tool") {
      const entry = asStr(e.entry, `entities[${idx}].entry`);
      if (visibility === "public" && !e.integrity) {
        throw new ManifestError(`public tool "${id}" must declare an integrity hash`);
      }
      return {
        ...common,
        kind: "tool",
        entry,
        integrity: typeof e.integrity === "string" ? e.integrity : undefined,
        ports: parsePorts(e.ports as Record<string, unknown>),
        permissions: parsePermissions(e.permissions as Record<string, unknown>),
      };
    }

    if (e.kind === "toolchain") {
      const tools = asArray(e.tools, `entities[${idx}].tools`).map((t, i) => {
        const o = t as Record<string, unknown>;
        return {
          instance: asStr(o.instance, `entities[${idx}].tools[${i}].instance`),
          ref: asStr(o.ref, `entities[${idx}].tools[${i}].ref`),
          source: asStr(o.source, `entities[${idx}].tools[${i}].source`),
        };
      });
      const layoutRaw = (e.layout ?? {}) as Record<string, unknown>;
      return {
        ...common,
        kind: "toolchain",
        tools,
        layout: {
          type: "split",
          dir: (layoutRaw.dir as "row" | "col") ?? "row",
          children: (layoutRaw.children as string[]) ?? tools.map((t) => t.instance),
        },
        wires: (e.wires ? asArray(e.wires, `entities[${idx}].wires`) : []).map((w) => {
          const o = w as { from: [string, string]; to: [string, string] };
          return { from: o.from, to: o.to };
        }),
      };
    }

    throw new ManifestError(`entities[${idx}].kind must be "tool" or "toolchain"`);
  });

  return { manifestVersion: 1, repo, entities };
}
