/* Net relay gates (backend/src/relay.ts).
 *
 * The relay is a second trust boundary: it re-checks everything the host already
 * checked because it must not assume a well-behaved caller. These drive handleRelay
 * directly and assert the refusals (https-only, default-port, SSRF, allowlist echo)
 * resolve BEFORE any outbound fetch, and that a permitted request is forwarded and a
 * redirect is passed through (reported, not followed). Upstream fetch is stubbed. */

import { test } from "node:test";
import assert from "node:assert/strict";

import { handleRelay } from "../backend/src/relay.ts";

const CORS = {};

function relayReq(body: unknown, raw?: string): Request {
  return new Request("https://backend.example/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

/** Stub global fetch to a canned upstream Response; records the url it was called with.
    Returns [restore, calls]. */
function stubFetch(resp: Response): { restore: () => void; calls: string[] } {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(typeof input === "string" ? input : input.toString());
    return resp;
  }) as typeof fetch;
  return { restore: () => (globalThis.fetch = real), calls };
}

async function bodyOf(res: Response): Promise<any> {
  return res.json();
}

test("a malformed JSON envelope is refused (400, no fetch)", async () => {
  const s = stubFetch(new Response("x"));
  try {
    const res = await handleRelay(relayReq(null, "{not json"), CORS);
    assert.equal(res.status, 400);
    assert.equal((await bodyOf(res)).relayed, false);
    assert.equal(s.calls.length, 0);
  } finally {
    s.restore();
  }
});

test("an empty allowlist is refused — the relay won't act as an open proxy", async () => {
  const res = await handleRelay(relayReq({ url: "https://api.example.com", allow: [] }), CORS);
  assert.equal(res.status, 400);
  assert.match((await bodyOf(res)).error, /empty allowlist/);
});

test("http is refused before any fetch", async () => {
  const s = stubFetch(new Response("x"));
  try {
    const res = await handleRelay(relayReq({ url: "http://api.example.com", allow: ["api.example.com"] }), CORS);
    assert.equal(res.status, 400);
    assert.match((await bodyOf(res)).error, /https/);
    assert.equal(s.calls.length, 0);
  } finally {
    s.restore();
  }
});

test("a non-default port is refused", async () => {
  const res = await handleRelay(relayReq({ url: "https://api.example.com:9000", allow: ["api.example.com"] }), CORS);
  assert.equal(res.status, 400);
  assert.match((await bodyOf(res)).error, /port/);
});

test("an internal host is refused by the SSRF guard even if the caller allowlists it", async () => {
  const s = stubFetch(new Response("secret"));
  try {
    const res = await handleRelay(
      relayReq({ url: "https://169.254.169.254/latest/meta-data", allow: ["169.254.169.254"] }),
      CORS,
    );
    assert.equal(res.status, 403);
    assert.match((await bodyOf(res)).error, /not routable/);
    assert.equal(s.calls.length, 0, "must not fetch the metadata endpoint");
  } finally {
    s.restore();
  }
});

test("a public host not in the echoed allowlist is refused", async () => {
  const res = await handleRelay(relayReq({ url: "https://evil.com/x", allow: ["api.example.com"] }), CORS);
  assert.equal(res.status, 403);
  assert.match((await bodyOf(res)).error, /not in tool allowlist/);
});

test("a permitted request is forwarded and the upstream response echoed", async () => {
  const s = stubFetch(new Response("pong", { status: 200, statusText: "OK", headers: { "x-h": "1" } }));
  try {
    const res = await handleRelay(
      relayReq({ url: "https://api.example.com/ping", method: "GET", allow: ["api.example.com"] }),
      CORS,
    );
    assert.equal(res.status, 200);
    const data = await bodyOf(res);
    assert.equal(data.relayed, true);
    assert.equal(data.response.status, 200);
    assert.equal(data.response.body, "pong");
    assert.equal(data.response.headers["x-h"], "1");
    assert.deepEqual(s.calls, ["https://api.example.com/ping"]);
  } finally {
    s.restore();
  }
});

test("a subdomain of a granted domain is permitted (mirrors the host's allow check)", async () => {
  const s = stubFetch(new Response("ok"));
  try {
    const res = await handleRelay(relayReq({ url: "https://files.api.example.com/x", allow: ["api.example.com"] }), CORS);
    assert.equal(res.status, 200);
    assert.equal((await bodyOf(res)).relayed, true);
  } finally {
    s.restore();
  }
});

test("a redirect is passed through (relayed:true, 3xx) — the host rejects it, the relay never follows", async () => {
  const s = stubFetch(new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } }));
  try {
    const res = await handleRelay(relayReq({ url: "https://api.example.com/go", allow: ["api.example.com"] }), CORS);
    assert.equal(res.status, 200);
    const data = await bodyOf(res);
    assert.equal(data.relayed, true);
    assert.equal(data.response.status, 302);
  } finally {
    s.restore();
  }
});
