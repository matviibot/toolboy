/* toolboy backend — shared HTTP helpers (CORS + JSON), used by every route. */

import type { Env } from "./env";

export function corsHeaders(req: Request, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? "*").split(",").map((s) => s.trim());
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin || "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

/** Constant-time string comparison — compares every byte regardless of where the
    first mismatch is, so a token check can't be narrowed by timing. Length is
    folded into the accumulator rather than short-circuited for the same reason. */
export function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Extract a Bearer token from an Authorization header, or null if absent/malformed. */
export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}
