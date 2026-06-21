/* toolboy backend — the Worker entrypoint / router.

   One stateless edge service, two inhabitants:
     POST /relay     — CORS fallback for ctx.net (relay.ts)
     POST /publish   — crawl a repo's toolboy.json into the discovery index (discovery.ts)
     GET  /discover  — query the discovery index (discovery.ts)

   Everything shares the CORS handling in http.ts. Mutating routes (/relay, /publish)
   pass through a per-IP fixed-window rate limit (ratelimit.ts) when a RATE_LIMIT KV
   namespace is bound. See backend/README.md. */

import type { Env } from "./env";
import { corsHeaders, json } from "./http";
import { handleRelay } from "./relay";
import { handleDiscover, handlePublish } from "./discovery";
import { clientIp, fixedWindow, intFromEnv, type RateLimitConfig } from "./ratelimit";

// Defaults (per IP, per 60s window); override via [vars] RELAY_RATE_LIMIT / PUBLISH_RATE_LIMIT.
const RELAY_DEFAULT = 60;
const PUBLISH_DEFAULT = 10;
const WINDOW_SEC = 60;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const { pathname } = new URL(req.url);

    if (pathname === "/relay" && req.method === "POST") {
      const limited = await rateLimit(req, env, cors, {
        bucket: "relay",
        limit: intFromEnv(env.RELAY_RATE_LIMIT, RELAY_DEFAULT),
        windowSec: WINDOW_SEC,
      });
      // the relay's caller expects the { relayed, error } envelope even on a 429
      if (limited) return limited.body((retryAfter) => ({ relayed: false, error: `rate limited; retry in ${retryAfter}s` }));
      return handleRelay(req, cors);
    }

    if (pathname === "/publish" && req.method === "POST") {
      const limited = await rateLimit(req, env, cors, {
        bucket: "publish",
        limit: intFromEnv(env.PUBLISH_RATE_LIMIT, PUBLISH_DEFAULT),
        windowSec: WINDOW_SEC,
      });
      if (limited) return limited.body((retryAfter) => ({ error: `rate limited; retry in ${retryAfter}s` }));
      return handlePublish(req, env, cors);
    }

    if (pathname === "/discover" && req.method === "GET") return handleDiscover(req, env, cors);

    return json({ error: "not found" }, 404, cors);
  },
};

/** Run the limiter for a route. Returns null when the request may proceed, or a small
    object whose `body(shape)` builds the 429 in that route's own response shape (the
    relay and publish envelopes differ) with a Retry-After header. */
async function rateLimit(
  req: Request,
  env: Env,
  cors: Record<string, string>,
  cfg: RateLimitConfig,
): Promise<{ body: (shape: (retryAfter: number) => unknown) => Response } | null> {
  const res = await fixedWindow(env.RATE_LIMIT, clientIp(req), cfg, Date.now());
  if (res.allowed) return null;
  return {
    body: (shape) =>
      json(shape(res.retryAfter), 429, { ...cors, "Retry-After": String(res.retryAfter) }),
  };
}

export type { Env };
