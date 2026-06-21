/* Authenticated (private-repo) github sources.
 *
 * Public repos load anonymously via raw.githubusercontent.com, which ignores the
 * Authorization header — so private repos 404. When a token is configured, the loader
 * must instead read through the GitHub Contents API with the raw media type, which
 * honors the token. These tests pin that switch:
 *   1. with a token, the ref→commit poll carries Authorization: Bearer <token>;
 *   2. with a token, manifest + entry URLs are Contents API URLs (?ref=<sha>) and the
 *      returned headers carry the auth + raw media type;
 *   3. without a token, behavior is unchanged (anonymous raw, no headers).
 *
 * fetch is stubbed so the suite is deterministic and needs no real token/network.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSource, resolveSource } from "../src/loader/resolver.ts";

const SRC = "gh:matviibot/tools@main";
const SUB = "gh:matviibot/tools@main#pkg/dir";
const FAKE_SHA = "0123456789abcdef0123456789abcdef01234567";
const TOKEN = "github_pat_TESTTOKEN";

/** Stub global fetch: the commits API echoes a fixed SHA and records the headers it was
    called with. Any other URL is a test bug. Returns { restore, lastCommitsHeaders }. */
function stubFetch() {
  const real = globalThis.fetch;
  const seen: { commitsHeaders?: Headers } = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("api.github.com") && url.includes("/commits/")) {
      seen.commitsHeaders = new Headers(init?.headers);
      return new Response(FAKE_SHA + "\n", { status: 200 });
    }
    throw new Error(`unexpected fetch in test: ${url}`);
  }) as typeof fetch;
  return { restore: () => { globalThis.fetch = real; }, seen };
}

test("with a token, the ref→commit poll sends Authorization: Bearer", async () => {
  const { restore, seen } = stubFetch();
  try {
    await resolveSource(parseSource(SRC), { token: TOKEN });
    assert.equal(seen.commitsHeaders?.get("authorization"), `Bearer ${TOKEN}`);
    assert.equal(seen.commitsHeaders?.get("accept"), "application/vnd.github.sha");
  } finally {
    restore();
  }
});

test("with a token, files resolve through the Contents API with raw media type", async () => {
  const { restore } = stubFetch();
  try {
    const r = await resolveSource(parseSource(SRC), { token: TOKEN });
    assert.equal(r.pin, FAKE_SHA);
    assert.equal(
      r.manifestUrl,
      `https://api.github.com/repos/matviibot/tools/contents/toolboy.json?ref=${FAKE_SHA}`,
    );
    assert.equal(
      r.entryUrl("tools/words.js"),
      `https://api.github.com/repos/matviibot/tools/contents/tools/words.js?ref=${FAKE_SHA}`,
    );
    assert.equal(r.headers?.Accept, "application/vnd.github.raw");
    assert.equal(r.headers?.Authorization, `Bearer ${TOKEN}`);
  } finally {
    restore();
  }
});

test("with a token, a sub-path shifts the Contents API path", async () => {
  const { restore } = stubFetch();
  try {
    const r = await resolveSource(parseSource(SUB), { token: TOKEN });
    assert.equal(
      r.manifestUrl,
      `https://api.github.com/repos/matviibot/tools/contents/pkg/dir/toolboy.json?ref=${FAKE_SHA}`,
    );
    assert.equal(
      r.entryUrl("tools/words.js"),
      `https://api.github.com/repos/matviibot/tools/contents/pkg/dir/tools/words.js?ref=${FAKE_SHA}`,
    );
  } finally {
    restore();
  }
});

test("without a token, the anonymous raw path is unchanged (no headers)", async () => {
  const { restore, seen } = stubFetch();
  try {
    const r = await resolveSource(parseSource(SRC)); // no token, none in Node env
    assert.equal(
      r.manifestUrl,
      `https://raw.githubusercontent.com/matviibot/tools/${FAKE_SHA}/toolboy.json`,
    );
    assert.equal(r.headers, undefined);
    assert.equal(seen.commitsHeaders?.get("authorization"), null);
  } finally {
    restore();
  }
});
