import type { Origin } from "../components";

export type { Origin };

export interface PortSpec {
  id: string;
  type: string;
}

export interface NetGrant {
  domain: string;
  inject?: { secret: string; header: string; format: string };
}

export interface Perms {
  storage: boolean;
  secrets: string[];
  net: NetGrant[];
}

export interface Tool {
  id: string;
  kind: "tool";
  name: string;
  icon: string;
  description: string;
  origin: Origin;
  ports: { accepts: PortSpec[]; provides: PortSpec[] };
  perms: Perms;
  /** the verified tool bundle text, fetched by the loader and run in the sandbox */
  source: string;
}

/** a tool slot in a scene; `instance` is the local handle (the same tool id can
    appear under multiple instances), `toolId` resolves which tool fills it */
export interface ToolInstance {
  instance: string;
  toolId: string;
}

export interface Toolchain {
  id: string;
  kind: "toolchain";
  name: string;
  icon: string;
  description: string;
  origin: Origin;
  tools: ToolInstance[];
  /** wires between instance handles, port-qualified (resolved to pane uids on open) */
  wires: { from: string; fromPort: string; to: string; toPort: string }[];
}

export type Entity = Tool | Toolchain;

/** aggregated permission summary (for a toolchain's whole scene) */
export interface AggPerms {
  storage: boolean;
  secrets: string[];
  net: string[];
}

export interface Pane {
  uid: string;
  toolId: string;
  /** latest value on each input port id (host-mediated bus, keyed by port) */
  inputs: Record<string, unknown>;
  /** latest value emitted on each output port id (sticky last-value) */
  lastOutputs: Record<string, unknown>;
}

/** a live wire between two panes, qualified by the specific ports it connects */
export interface Wire {
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
}
