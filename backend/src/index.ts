/* toolboy backend — the Worker entrypoint / router.

   One stateless edge service, two inhabitants:
     POST /relay     — CORS fallback for ctx.net (relay.ts)
     POST /publish   — crawl a repo's toolboy.json into the discovery index (discovery.ts)
     GET  /discover  — query the discovery index (discovery.ts)

   Everything shares the CORS handling in http.ts. See backend/README.md. */

import type { Env } from "./env";
import { corsHeaders, json } from "./http";
import { handleRelay } from "./relay";
import { handleDiscover, handlePublish } from "./discovery";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const { pathname } = new URL(req.url);

    if (pathname === "/relay" && req.method === "POST") return handleRelay(req, cors);
    if (pathname === "/publish" && req.method === "POST") return handlePublish(req, env, cors);
    if (pathname === "/discover" && req.method === "GET") return handleDiscover(req, env, cors);

    return json({ error: "not found" }, 404, cors);
  },
};

export type { Env };
