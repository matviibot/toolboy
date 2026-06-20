/* Fixed-window rate limiter (backend/src/ratelimit.ts).
 *
 * `now` is injected so the window math is deterministic; a Map stands in for KV. These
 * pin the contract index.ts relies on: counts per (bucket, ip, window), a clean reset
 * at the window edge, isolation across ip/bucket, and — the safety property — fail
 * OPEN, so a KV outage degrades to "no limiting", never to "API down". */

import { test } from "node:test";
import assert from "node:assert/strict";

import { fixedWindow, clientIp, intFromEnv, type RateLimitStore } from "../backend/src/ratelimit.ts";

const CFG = { bucket: "relay", limit: 2, windowSec: 60 };

function fakeKV(): { store: RateLimitStore; map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    store: {
      get: async (k) => map.get(k) ?? null,
      put: async (k, v) => {
        map.set(k, v);
      },
    },
  };
}

test("no store bound → always allowed (local dev / tests need no KV)", async () => {
  const r = await fixedWindow(undefined, "1.2.3.4", CFG, 1000);
  assert.deepEqual(r, { allowed: true, retryAfter: 0 });
});

test("requests up to the limit pass, the next is blocked with a Retry-After", async () => {
  const { store } = fakeKV();
  assert.equal((await fixedWindow(store, "ip", CFG, 1000)).allowed, true);
  assert.equal((await fixedWindow(store, "ip", CFG, 1000)).allowed, true);
  const third = await fixedWindow(store, "ip", CFG, 1000);
  assert.equal(third.allowed, false);
  assert.equal(third.retryAfter, 59); // (60000 - 1000) ms, rounded up to seconds
});

test("a new window resets the count", async () => {
  const { store } = fakeKV();
  await fixedWindow(store, "ip", CFG, 1000);
  await fixedWindow(store, "ip", CFG, 1000);
  assert.equal((await fixedWindow(store, "ip", CFG, 1000)).allowed, false);
  // jump into the next 60s window
  assert.equal((await fixedWindow(store, "ip", CFG, 61_000)).allowed, true);
});

test("different IPs and different buckets are counted independently", async () => {
  const { store } = fakeKV();
  await fixedWindow(store, "a", CFG, 1000);
  await fixedWindow(store, "a", CFG, 1000);
  assert.equal((await fixedWindow(store, "a", CFG, 1000)).allowed, false);
  assert.equal((await fixedWindow(store, "b", CFG, 1000)).allowed, true); // other ip, fresh
  assert.equal((await fixedWindow(store, "a", { ...CFG, bucket: "publish" }, 1000)).allowed, true); // other bucket
});

test("fails OPEN when the store throws — a limiter outage must not take the API down", async () => {
  const broken: RateLimitStore = {
    get: async () => {
      throw new Error("KV down");
    },
    put: async () => {},
  };
  assert.equal((await fixedWindow(broken, "ip", CFG, 1000)).allowed, true);
});

test("clientIp prefers CF-Connecting-IP, falls back to X-Forwarded-For, then 'unknown'", () => {
  const cf = new Request("https://x", { headers: { "CF-Connecting-IP": "9.9.9.9" } });
  assert.equal(clientIp(cf), "9.9.9.9");
  const xff = new Request("https://x", { headers: { "X-Forwarded-For": "7.7.7.7, 1.1.1.1" } });
  assert.equal(clientIp(xff), "7.7.7.7");
  assert.equal(clientIp(new Request("https://x")), "unknown");
});

test("intFromEnv takes a positive integer override, else the fallback", () => {
  assert.equal(intFromEnv("100", 60), 100);
  assert.equal(intFromEnv(undefined, 60), 60);
  assert.equal(intFromEnv("nope", 60), 60);
  assert.equal(intFromEnv("0", 60), 60); // not positive
  assert.equal(intFromEnv("-5", 60), 60);
});
