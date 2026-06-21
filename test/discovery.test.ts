/* Discovery index (backend/src/discovery.ts).
 *
 * Two surfaces: extractCards (what gets indexed) and the /publish auth gate. The
 * source-subpath suite already pins card extraction against the real demo manifest;
 * here we cover the visibility/skip edges and the new PUBLISH_TOKEN gate end to end,
 * with a Map-backed D1 fake and a stubbed GitHub/raw fetch so it stays deterministic.
 *
 * The gate's whole job is to keep a shared index from being polluted by anyone, so the
 * cases that matter most are the refusals: no token, wrong token. */

import { test } from "node:test";
import assert from "node:assert/strict";

import { extractCards, checkPublishAuth, handlePublish } from "../backend/src/discovery.ts";

const SOURCE = "gh:o/r@main";
const FAKE_SHA = "0123456789abcdef0123456789abcdef01234567";

const MANIFEST = {
  manifestVersion: 1,
  repo: { name: "demo-repo", defaults: { visibility: "private" } },
  entities: [
    { id: "pub", kind: "tool", name: "Public Tool", visibility: "public", entry: "t.js", integrity: "sha384-x" },
    { id: "priv", kind: "tool", name: "Private Tool", entry: "p.js" }, // inherits private default
    { id: "chain", kind: "toolchain", name: "A Chain", visibility: "public" },
    { id: "bad", kind: "tool" }, // no name → skipped, not fatal
    { kind: "tool", name: "no id", visibility: "public" }, // no id → skipped
    "not an object",
  ],
};

// ---- extractCards ----

test("only public entities are indexed; malformed entries are skipped, not fatal", () => {
  const { repoName, cards } = extractCards(MANIFEST, SOURCE, FAKE_SHA);
  assert.equal(repoName, "demo-repo");
  assert.deepEqual(cards.map((c) => c.id).sort(), ["chain", "pub"]);
});

test("a card carries its source + pin and a kind-appropriate default icon", () => {
  const { cards } = extractCards(MANIFEST, SOURCE, FAKE_SHA);
  const pub = cards.find((c) => c.id === "pub")!;
  const chain = cards.find((c) => c.id === "chain")!;
  assert.equal(pub.source, SOURCE);
  assert.equal(pub.pin, FAKE_SHA);
  assert.equal(pub.icon, "box"); // tool default
  assert.equal(chain.icon, "workflow"); // toolchain default
});

test("a repo whose default visibility is public indexes entities that don't opt out", () => {
  const m = {
    manifestVersion: 1,
    repo: { name: "open", defaults: { visibility: "public" } },
    entities: [
      { id: "a", kind: "tool", name: "A", entry: "a.js", integrity: "sha384-x" },
      { id: "b", kind: "tool", name: "B", visibility: "private", entry: "b.js" },
    ],
  };
  const { cards } = extractCards(m, SOURCE, FAKE_SHA);
  assert.deepEqual(cards.map((c) => c.id), ["a"]);
});

test("a non-v1 manifest is rejected", () => {
  assert.throws(() => extractCards({ manifestVersion: 2, entities: [] }, SOURCE, FAKE_SHA), /manifestVersion/);
});

// ---- checkPublishAuth ----

test("no PUBLISH_TOKEN configured → publish is open", () => {
  const req = new Request("https://b/publish", { method: "POST" });
  assert.equal(checkPublishAuth(req, {} as any, {}), null);
});

test("PUBLISH_TOKEN set but no Authorization header → 401", async () => {
  const req = new Request("https://b/publish", { method: "POST" });
  const res = checkPublishAuth(req, { PUBLISH_TOKEN: "s3cret" } as any, {});
  assert.ok(res);
  assert.equal(res!.status, 401);
});

test("PUBLISH_TOKEN set, wrong token → 401", () => {
  const req = new Request("https://b/publish", { method: "POST", headers: { authorization: "Bearer nope" } });
  const res = checkPublishAuth(req, { PUBLISH_TOKEN: "s3cret" } as any, {});
  assert.equal(res!.status, 401);
});

test("PUBLISH_TOKEN set, matching bearer token → allowed (null)", () => {
  const req = new Request("https://b/publish", { method: "POST", headers: { authorization: "Bearer s3cret" } });
  assert.equal(checkPublishAuth(req, { PUBLISH_TOKEN: "s3cret" } as any, {}), null);
});

// ---- handlePublish (auth + crawl + index) ----

function fakeDB(): { db: any; batches: any[][] } {
  const batches: any[][] = [];
  const stmt = () => {
    const s: any = {
      bind(...args: unknown[]) {
        s.args = args;
        return s;
      },
      all: async () => ({ results: [] }),
      run: async () => ({}),
    };
    return s;
  };
  return {
    batches,
    db: { prepare: () => stmt(), batch: async (stmts: any[]) => (batches.push(stmts), []) },
  };
}

function stubFetch(): () => void {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("api.github.com") && url.includes("/commits/")) return new Response(FAKE_SHA + "\n", { status: 200 });
    if (url.endsWith("/toolboy.json")) return new Response(JSON.stringify(MANIFEST), { status: 200 });
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  return () => (globalThis.fetch = real);
}

function publishReq(token?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("https://b/publish", { method: "POST", headers, body: JSON.stringify({ source: SOURCE }) });
}

test("handlePublish with a valid token crawls and indexes the public entities", async () => {
  const restore = stubFetch();
  const { db, batches } = fakeDB();
  try {
    const res = await handlePublish(publishReq("s3cret"), { PUBLISH_TOKEN: "s3cret", DB: db } as any, {});
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.equal(data.indexed, 2); // pub + chain
    assert.equal(data.repo, "demo-repo");
    // one batch: DELETE for the source + one INSERT per card
    assert.equal(batches.length, 1);
    assert.equal(batches[0].length, 1 + 2);
  } finally {
    restore();
  }
});

test("handlePublish refuses an unauthenticated request before any crawl or DB write", async () => {
  const restore = stubFetch();
  const { db, batches } = fakeDB();
  try {
    const res = await handlePublish(publishReq(/* no token */), { PUBLISH_TOKEN: "s3cret", DB: db } as any, {});
    assert.equal(res.status, 401);
    assert.equal(batches.length, 0, "must not touch the index when auth fails");
  } finally {
    restore();
  }
});
