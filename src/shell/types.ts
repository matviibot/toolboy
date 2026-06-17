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
  interior: "color" | "fetcher" | "jq" | "jsonview" | "foreign" | "foreign2";
}

export interface Toolchain {
  id: string;
  kind: "toolchain";
  name: string;
  icon: string;
  description: string;
  origin: Origin;
  tools: string[];
  wires: [string, string][];
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
  input: unknown;
  lastOutput: unknown;
}

export interface Wire {
  from: string;
  to: string;
}
