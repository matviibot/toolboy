/* toolboy runtime — demo tool bundles, loaded as raw source strings.

   Each file is a classic-script bundle that calls `toolboy.tool(mount)`. The
   host injects the chosen source into a sandboxed frame's srcdoc. These are the
   real thing now — they touch the world only through `ctx` (storage, bus, net,
   secrets, ui) — not React stand-ins. Keyed by the `Tool.interior` discriminant. */
import color from "./color.js?raw";
import fetcher from "./fetcher.js?raw";
import jq from "./jq.js?raw";
import jsonview from "./jsonview.js?raw";
import summarize from "./summarize.js?raw";
import regex from "./regex.js?raw";

export const TOOL_SOURCES: Record<string, string> = {
  color,
  fetcher,
  jq,
  jsonview,
  foreign: summarize,
  foreign2: regex,
};
