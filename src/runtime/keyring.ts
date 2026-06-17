/* toolboy runtime — the host keyring.

   Secrets live here, on the host, and are injected into outbound `ctx.net`
   requests by the host. They are NEVER returned to a tool.

   This resolves a tension between the draft docs: sdk.md sketches
   `secrets.get(name): string`, but principles.md (the spine) and security.md
   are firm that "secrets never enter tool code." When ambiguous we resolve
   toward the rails — so the runtime exposes only `secrets.has(name)` to a tool
   (enough to branch its UI), and the raw value reaches the network exclusively
   through host-side header injection.

   Demo store: in-memory, seedable. A real host would back this with the OS
   keychain / an encrypted local store and gate writes behind the trust UI. */

const ring = new Map<string, string>();

export const keyring = {
  has: (name: string) => ring.has(name),
  /** host-only: used during net injection, never exposed over the boundary */
  read: (name: string) => ring.get(name),
  set: (name: string, value: string) => {
    ring.set(name, value);
  },
  delete: (name: string) => ring.delete(name),
};
