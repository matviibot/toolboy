/* toolboy backend — a fixed-window, per-IP rate limiter.

   The relay makes outbound fetches and /publish triggers GitHub reads + D1 writes;
   both are cheap to abuse without a cap. This is a deliberately simple fixed-window
   counter in KV: a key per (bucket, ip, window) holds a count that expires when the
   window does. It is NOT a precise token bucket — two concurrent requests can both
   read the same count and slip through the edge of the limit (KV is eventually
   consistent and there's no atomic increment). That's an accepted trade: the goal is
   to stop runaway/abusive volume, not to meter exactly.

   No KV bound (env.RATE_LIMIT undefined) → limiting is skipped, so local `wrangler
   dev` and tests need no namespace. Keep the limiter standalone (like ssrf.ts) so it
   can be reasoned about and tested on its own. */

export interface RateLimitConfig {
  /** namespace so /relay and /publish count independently */
  bucket: string;
  /** max requests allowed per window, per ip */
  limit: number;
  /** window length in seconds */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** seconds until the current window resets (for Retry-After), when blocked */
  retryAfter: number;
}

/** The slice of KVNamespace we use — narrowed so a plain Map-backed fake satisfies it
    in tests without pulling the full Workers types. */
export interface RateLimitStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

/** Derive the caller's IP. Cloudflare sets CF-Connecting-IP on every request; fall
    back to a constant so a missing header buckets together rather than bypassing. */
export function clientIp(req: Request): string {
  return req.headers.get("CF-Connecting-IP") ?? req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown";
}

/** Count one request against (bucket, ip) in the current fixed window. `now` is epoch
    ms (passed in so the function stays pure and testable). Fails OPEN: if the KV read
    or write throws, the request is allowed — a limiter outage must not take the API
    down. */
export async function fixedWindow(
  store: RateLimitStore | undefined,
  ip: string,
  cfg: RateLimitConfig,
  now: number,
): Promise<RateLimitResult> {
  if (!store) return { allowed: true, retryAfter: 0 };

  const windowMs = cfg.windowSec * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `rl:${cfg.bucket}:${ip}:${windowStart}`;

  try {
    const current = Number((await store.get(key)) ?? 0);
    if (current >= cfg.limit) {
      const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
      return { allowed: false, retryAfter };
    }
    // refresh the TTL each write so the key lives exactly until the window ends
    const ttl = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
    await store.put(key, String(current + 1), { expirationTtl: ttl });
    return { allowed: true, retryAfter: 0 };
  } catch {
    return { allowed: true, retryAfter: 0 }; // fail open
  }
}

/** Read a positive integer override from an env var, else the default. */
export function intFromEnv(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
