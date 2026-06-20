/* SSRF guard (backend/src/ssrf.ts).
 *
 * The relay fetches on a caller's behalf, so this blocklist is the thing standing
 * between it and a tool coaxing it into the cloud metadata endpoint or a LAN box.
 * It's pure and standalone by design; this is its exhaustive table. A regression here
 * is a credential-theft hole, so the public-host cases matter as much as the blocked
 * ones — a guard that rejects everything is as broken as one that rejects nothing. */

import { test } from "node:test";
import assert from "node:assert/strict";

import { isBlockedHost } from "../backend/src/ssrf.ts";

const BLOCKED = [
  "localhost",
  "foo.localhost",
  "printer.local",
  "db.internal",
  "metadata.google.internal",
  "127.0.0.1",
  "127.5.5.5",
  "10.0.0.1",
  "172.16.0.1",
  "172.31.255.255",
  "192.168.1.1",
  "169.254.169.254", // cloud metadata
  "100.64.0.1", // CGNAT
  "0.0.0.0",
  "255.255.255.255",
  "224.0.0.1", // multicast
  "2130706433", // decimal 127.0.0.1
  "0x7f000001", // hex 127.0.0.1
  "::1", // ipv6 loopback
  "::", // ipv6 unspecified
  "fe80::1", // ipv6 link-local
  "fc00::1", // ipv6 unique-local
  "fd12:3456::1", // ipv6 unique-local
  "::ffff:127.0.0.1", // ipv4-mapped loopback
  "::ffff:10.0.0.1", // ipv4-mapped private
  "", // empty fails closed
];

const ALLOWED = [
  "api.github.com",
  "api.openai.com",
  "example.com",
  "8.8.8.8", // public DNS
  "1.1.1.1",
  "172.32.0.1", // just outside 172.16/12
  "192.167.0.1", // just outside 192.168/16
  "2606:4700:4700::1111", // public ipv6 (cloudflare dns)
  "::ffff:8.8.8.8", // ipv4-mapped public
];

test("blocked hosts are all refused", () => {
  for (const h of BLOCKED) assert.equal(isBlockedHost(h), true, `expected BLOCKED: ${h || "(empty)"}`);
});

test("public hosts are all allowed", () => {
  for (const h of ALLOWED) assert.equal(isBlockedHost(h), false, `expected ALLOWED: ${h}`);
});

test("case and a trailing FQDN dot don't sneak a blocked host past the guard", () => {
  assert.equal(isBlockedHost("LOCALHOST"), true);
  assert.equal(isBlockedHost("localhost."), true);
  assert.equal(isBlockedHost("METADATA.GOOGLE.INTERNAL"), true);
});

test("an octet over 255 is not a valid dotted-quad, so it's treated as a name (public)", () => {
  // 999.1.1.1 isn't a parseable IPv4 and isn't an internal name → not blocked as an IP
  assert.equal(isBlockedHost("999.1.1.1"), false);
});
