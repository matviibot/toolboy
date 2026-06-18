/* toolboy backend — the Worker's bindings. */

export interface Env {
  /** Comma-separated origins allowed to call the backend; "*" (default) allows any.
      No credentials are used, so "*" is safe; pin it to your toolboy origin in prod. */
  ALLOWED_ORIGINS?: string;

  /** D1 database backing the discovery index. Bound in wrangler.toml as `DB`. */
  DB: D1Database;
}
