/* toolboy backend — the Worker's bindings. */

export interface Env {
  /** Comma-separated origins allowed to call the backend; "*" (default) allows any.
      No credentials are used, so "*" is safe; pin it to your toolboy origin in prod. */
  ALLOWED_ORIGINS?: string;

  /** Secret gating POST /publish. When set, a publish must carry
      `Authorization: Bearer <token>`; when unset, publish is open (fine for a
      personal/self-hosted index). Configure via `wrangler secret put PUBLISH_TOKEN`,
      never as a plaintext [vars] entry. See backend/README.md. */
  PUBLISH_TOKEN?: string;

  /** Optional KV namespace backing the relay/publish rate limiter (ratelimit.ts).
      Bound in wrangler.toml as `RATE_LIMIT`. Unbound → limiting is skipped (local dev). */
  RATE_LIMIT?: KVNamespace;

  /** Per-IP request caps (fixed window). Optional [vars] overrides for the defaults
      in ratelimit.ts; parsed as integers, ignored if non-numeric. */
  RELAY_RATE_LIMIT?: string;
  PUBLISH_RATE_LIMIT?: string;

  /** D1 database backing the discovery index. Bound in wrangler.toml as `DB`. */
  DB: D1Database;
}
