/* toolboy surface — demo entity dataset (tools + toolchains, mixed origin). */
import type { AggPerms, Entity, Tool, Toolchain } from "./types";

export const tools: Record<string, Tool> = {
  color: {
    id: "color", kind: "tool", name: "Color Picker", icon: "pipette",
    description: "Pick & convert colors", origin: "yours",
    ports: { accepts: [], provides: [{ id: "out", type: "x-toolboy/color" }] },
    perms: { storage: true, secrets: [], net: [] },
    interior: "color",
  },
  fetcher: {
    id: "fetcher", kind: "tool", name: "Fetcher", icon: "download",
    description: "GET a URL, emit the body", origin: "yours",
    ports: { accepts: [{ id: "in", type: "text/plain" }], provides: [{ id: "out", type: "application/json" }] },
    perms: { storage: false, secrets: [], net: [{ domain: "api.github.com" }] },
    interior: "fetcher",
  },
  jq: {
    id: "jq", kind: "tool", name: "jq", icon: "braces",
    description: "Filter and transform JSON", origin: "yours",
    ports: { accepts: [{ id: "in", type: "application/json" }], provides: [{ id: "out", type: "application/json" }] },
    perms: { storage: true, secrets: [], net: [] },
    interior: "jq",
  },
  "json-view": {
    id: "json-view", kind: "tool", name: "JSON View", icon: "list-tree",
    description: "Inspect JSON as a tree", origin: "yours",
    ports: { accepts: [{ id: "in", type: "application/json" }], provides: [] },
    perms: { storage: false, secrets: [], net: [] },
    interior: "jsonview",
  },
  summarize: {
    id: "summarize", kind: "tool", name: "Summarize", icon: "sparkles",
    description: "From matvii/shared · needs a key", origin: "public",
    ports: { accepts: [{ id: "in", type: "text/plain" }], provides: [{ id: "out", type: "text/plain" }] },
    perms: {
      storage: false,
      secrets: ["OPENAI_API_KEY"],
      net: [{ domain: "api.openai.com", inject: { secret: "OPENAI_API_KEY", header: "Authorization", format: "Bearer {}" } }],
    },
    interior: "foreign",
  },
  regex: {
    id: "regex", kind: "tool", name: "Regex Lab", icon: "regex",
    description: "Test patterns against text", origin: "public",
    ports: { accepts: [{ id: "in", type: "text/plain" }], provides: [{ id: "out", type: "text/plain" }] },
    perms: { storage: true, secrets: [], net: [] },
    interior: "foreign2",
  },
};

export const chains: Record<string, Toolchain> = {
  "json-pipeline": {
    id: "json-pipeline", kind: "toolchain", name: "JSON Pipeline", icon: "workflow",
    description: "fetch → jq → view", origin: "yours",
    tools: ["fetcher", "jq", "json-view"],
    wires: [["fetcher", "jq"], ["jq", "json-view"]],
  },
  triage: {
    id: "triage", kind: "toolchain", name: "Inbox Triage", icon: "workflow",
    description: "From acme/scenes · 4 tools", origin: "public",
    tools: ["fetcher", "summarize", "regex", "json-view"],
    wires: [["fetcher", "summarize"], ["summarize", "regex"]],
  },
};

export const all: Entity[] = [
  chains["json-pipeline"], tools.jq, tools.summarize, tools.color,
  chains.triage, tools.fetcher, tools["json-view"], tools.regex,
];

/** aggregate permissions for a toolchain */
export function aggregatePerms(chain: Toolchain): AggPerms {
  const secrets = new Set<string>(), net = new Set<string>();
  let storage = false;
  chain.tools.forEach((tid) => {
    const t = tools[tid];
    if (t.perms.storage) storage = true;
    t.perms.secrets.forEach((s) => secrets.add(s));
    t.perms.net.forEach((n) => net.add(n.domain));
  });
  return { storage, secrets: [...secrets], net: [...net] };
}
