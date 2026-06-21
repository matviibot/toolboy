/* Compute SRI integrity hashes for the tools in toolboy.json.
 *
 * A PUBLIC tool must record `integrity: "sha384-…"`; toolboy verifies the fetched
 * bundle against it before running a byte of it. This prints the line for each tool so
 * you can paste it into the manifest when you flip a tool to `"visibility": "public"`.
 * The algorithm matches toolboy's loader (src/loader/sri.ts): sha384 over the UTF-8
 * bytes, base64-encoded.
 *
 *   node scripts/hash.mjs            # print "<id>: sha384-…" for every tool
 *   node scripts/hash.mjs --write    # also rewrite each tool's integrity in toolboy.json
 */

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "toolboy.json");
const write = process.argv.includes("--write");

const text = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(text);
const hashes = {};

for (const e of manifest.entities ?? []) {
  if (e.kind !== "tool" || typeof e.entry !== "string") continue;
  const bytes = await readFile(join(root, e.entry));
  const integrity = "sha384-" + createHash("sha384").update(bytes).digest("base64");
  hashes[e.id] = integrity;
  console.log(`${e.id}: ${integrity}`);
}

if (write) {
  for (const e of manifest.entities ?? []) {
    if (hashes[e.id]) e.integrity = hashes[e.id];
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log("\nWrote integrity hashes into toolboy.json");
}
