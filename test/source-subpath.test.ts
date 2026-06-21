/* In-repo sub-path sources: gh:owner/repo@ref#subpath.
 *
 * The manifest a real registry ships often lives in a subdirectory, so a source carries
 * an optional sub-path that shifts where both the client loader and the discovery crawl
 * look. (The fixture below is a real toolboy.json — formerly the bundled demo registry,
 * kept here now that the app ships no built-in tools.) These tests pin:
 *   1. the loader (resolver.ts) builds manifest + entry URLs under the sub-path;
 *   2. the crawl (discovery.ts) resolves the *same* manifest URL — they must not drift;
 *   3. publishing the demo source indexes exactly the 3 public entities, and opening
 *      one resolves its bundle correctly.
 *
 * fetch is stubbed (GitHub commits API + raw manifest) so the suite is deterministic;
 * the manifest body is the real file on disk, so the card count tracks reality.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseSource, resolveSource, normalizeSub } from "../src/loader/resolver.ts";
import { resolveManifestUrl, extractCards } from "../backend/src/discovery.ts";

// Resolved from the repo root (cwd under `npm test`); the bundled test runs from a
// tmp dir, so import.meta.url can't anchor it.
const MANIFEST_PATH = join(process.cwd(), "test", "fixtures", "demo-registry.json");
const MANIFEST_TEXT = readFileSync(MANIFEST_PATH, "utf8");

const DEMO = "gh:matviibot/toolboy@main#public/registry";
const FAKE_SHA = "0123456789abcdef0123456789abcdef01234567";
const RAW = `https://raw.githubusercontent.com/matviibot/toolboy/${FAKE_SHA}`;

/** Stub global fetch: commits API echoes a fixed SHA, the raw manifest URL returns the
    on-disk file. Any other URL is a test bug, so it throws. Returns a restore fn. */
function stubFetch(): () => void {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("api.github.com") && url.includes("/commits/")) {
      return new Response(FAKE_SHA + "\n", { status: 200 });
    }
    if (url.endsWith("/public/registry/toolboy.json")) {
      return new Response(MANIFEST_TEXT, { status: 200 });
    }
    throw new Error(`unexpected fetch in test: ${url}`);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = real;
  };
}

test("parseSource captures an optional sub-path after #", () => {
  const src = parseSource(DEMO);
  assert.deepEqual(src, {
    kind: "github",
    owner: "matviibot",
    repo: "toolboy",
    ref: "main",
    sub: "public/registry",
  });
});

test("a ref may itself contain slashes; only # starts the sub-path", () => {
  const src = parseSource("gh:o/r@feat/x#dir/sub");
  assert.equal(src.kind, "github");
  if (src.kind !== "github") return;
  assert.equal(src.ref, "feat/x");
  assert.equal(src.sub, "dir/sub");
});

test("a bare gh: source (no #) stays a repo-root source — backward compatible", () => {
  const src = parseSource("gh:o/r@main");
  assert.equal(src.kind, "github");
  if (src.kind !== "github") return;
  assert.equal(src.ref, "main");
  assert.equal(src.sub, undefined);
});

test("normalizeSub strips surrounding slashes and empties to undefined", () => {
  assert.equal(normalizeSub("/public/registry/"), "public/registry");
  assert.equal(normalizeSub(""), undefined);
  assert.equal(normalizeSub("/"), undefined);
  assert.equal(normalizeSub(undefined), undefined);
});

test("resolveSource builds manifest + entry URLs under the sub-path", async () => {
  const restore = stubFetch();
  try {
    const resolved = await resolveSource(parseSource(DEMO));
    assert.equal(resolved.pin, FAKE_SHA);
    assert.equal(resolved.manifestUrl, `${RAW}/public/registry/toolboy.json`);
    // manifest `entry` values are relative to the manifest, so they land under the sub-path
    assert.equal(resolved.entryUrl("tools/regex.js"), `${RAW}/public/registry/tools/regex.js`);
  } finally {
    restore();
  }
});

test("the crawl resolves the SAME manifest URL the loader loads (no drift)", async () => {
  const restore = stubFetch();
  try {
    const crawl = await resolveManifestUrl(DEMO);
    const loader = await resolveSource(parseSource(DEMO));
    assert.equal(crawl.url, loader.manifestUrl);
    assert.equal(crawl.pin, loader.pin);
  } finally {
    restore();
  }
});

test("publishing the demo source indexes exactly the 3 public entities", () => {
  const { repoName, cards } = extractCards(JSON.parse(MANIFEST_TEXT), DEMO, FAKE_SHA);
  assert.equal(repoName, "toolboy-demo");
  assert.deepEqual(
    cards.map((c) => c.id).sort(),
    ["regex", "summarize", "triage"],
  );
  // every card carries the sub-path source so the client re-opens the right directory
  for (const c of cards) assert.equal(c.source, DEMO);
});

test("opening an indexed entity resolves its bundle under the sub-path", async () => {
  const restore = stubFetch();
  try {
    const { cards } = extractCards(JSON.parse(MANIFEST_TEXT), DEMO, FAKE_SHA);
    const regex = cards.find((c) => c.id === "regex");
    assert.ok(regex, "regex card present");
    // re-open exactly as the client would: card.source -> resolve -> entry URL
    const resolved = await resolveSource(parseSource(regex!.source));
    assert.equal(resolved.entryUrl("tools/regex.js"), `${RAW}/public/registry/tools/regex.js`);
  } finally {
    restore();
  }
});
