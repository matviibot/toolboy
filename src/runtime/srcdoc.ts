/* toolboy runtime — assembles the sandboxed document a tool runs in.

   The iframe is `sandbox="allow-scripts"` WITHOUT `allow-same-origin`, so the
   document loads at an opaque (null) origin: it cannot reach host cookies,
   localStorage, or IndexedDB even by trickery. On top of that, a strict CSP:

     - `default-src 'none'`     — nothing is reachable by default
     - `connect-src 'none'`     — the tool literally cannot fetch; all network
                                  must go through ctx.net (host-bridged). This is
                                  what makes the net allowlist enforceable rather
                                  than advisory (security.md).
     - `script-src 'unsafe-inline'` — runs our injected runtime + tool bundle.
       NOTE: in production a tool bundle is served from a distinct sandbox origin
       with a hashed/pinned `script-src` and SRI; inline is the local-dev shape of
       the same boundary, kept explicit here so the trade-off is visible.

   Fonts intentionally do not cross: there's no `font-src`, so the frame uses
   system fonts. The frame is isolated; the glass *look* travels as color/radius/
   shadow tokens, not as font files. */

import { FRAME_RUNTIME_SRC } from "./frameRuntime";

const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "connect-src 'none'",
  "font-src 'none'",
].join("; ");

/** Base layout/reset for the frame. Color comes from theme vars the host pushes
    at init; fonts fall back to the system stack (see note above). */
const BASE_STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    background: transparent;
    color: var(--fg-1, #e9edf2);
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    font-size: 14px;
  }
  #root { height: 100%; }
  .tb-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
`;

/** Build the full srcdoc for one tool. `toolSource` is a classic-script bundle
    that calls `toolboy.tool(mount)`. The result is stable for a given tool, so
    the host memoizes it — input/theme updates flow over the port, never by
    re-rendering srcdoc (which would reload the frame). */
export function buildSrcdoc(toolSource: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${CSP}" />
<style>${BASE_STYLE}</style>
</head>
<body>
<div id="root"></div>
<script>${FRAME_RUNTIME_SRC}</script>
<script>${toolSource}</script>
</body>
</html>`;
}
