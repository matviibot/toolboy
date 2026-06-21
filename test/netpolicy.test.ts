/* ctx.net request policy (src/runtime/netPolicy.ts).
 *
 * The host holds a tool's network to one rule: https + default port + a domain the
 * tool was granted, with the declared secret injected host-side. These pin that rule
 * and — critically — that the raw secret only ever lands in an outbound header, never
 * in the returned value, and isn't mangled by $-sequences. This is the trust boundary
 * for every authenticated tool, so it's worth nailing down without a live frame. */

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveNetRequest, hostAllowed } from "../src/runtime/netPolicy.ts";
import type { NetGrant } from "../src/shell/types.ts";

const PLAIN: NetGrant[] = [{ domain: "api.github.com" }];
const INJECT: NetGrant[] = [
  { domain: "api.openai.com", inject: { secret: "OPENAI_API_KEY", header: "Authorization", format: "Bearer {}" } },
];
const noSecret = () => undefined;

test("hostAllowed matches an exact domain and any subdomain, nothing else", () => {
  assert.ok(hostAllowed("api.github.com", PLAIN));
  assert.ok(hostAllowed("uploads.api.github.com", PLAIN));
  assert.equal(hostAllowed("api.github.com.evil.com", PLAIN), null);
  assert.equal(hostAllowed("github.com", PLAIN), null); // a parent is not a subdomain
});

test("a granted https URL resolves with the matched grant", () => {
  const r = resolveNetRequest("https://api.github.com/repos/x", null, PLAIN, noSecret);
  assert.equal(r.url.hostname, "api.github.com");
  assert.equal(r.grant.domain, "api.github.com");
  assert.equal(r.headers.get("authorization"), null); // no inject on this grant
});

test("http is refused — no silent downgrade to cleartext", () => {
  assert.throws(() => resolveNetRequest("http://api.github.com/x", null, PLAIN, noSecret), /only https/);
});

test("a non-default port on a granted host is refused", () => {
  assert.throws(() => resolveNetRequest("https://api.github.com:8443/x", null, PLAIN, noSecret), /non-standard port/);
});

test("an off-allowlist host is refused even over https", () => {
  assert.throws(() => resolveNetRequest("https://evil.com/x", null, PLAIN, noSecret), /not in this tool's allowlist/);
});

test("a malformed URL is refused", () => {
  assert.throws(() => resolveNetRequest("not a url", null, PLAIN, noSecret), /invalid URL/);
});

test("a declared secret is injected into the header, formatted per the grant", () => {
  const r = resolveNetRequest("https://api.openai.com/v1/chat", null, INJECT, (n) =>
    n === "OPENAI_API_KEY" ? "sk-test123" : undefined,
  );
  assert.equal(r.headers.get("authorization"), "Bearer sk-test123");
});

test("no secret present → no header injected (tool still runs, just unauthenticated)", () => {
  const r = resolveNetRequest("https://api.openai.com/v1/chat", null, INJECT, noSecret);
  assert.equal(r.headers.get("authorization"), null);
});

test("$-sequences in the secret are inserted literally, not treated as replace patterns", () => {
  const r = resolveNetRequest("https://api.openai.com/v1/chat", null, INJECT, () => "a$1$&b");
  assert.equal(r.headers.get("authorization"), "Bearer a$1$&b");
});

test("caller-supplied headers are preserved alongside the injected one", () => {
  const r = resolveNetRequest("https://api.openai.com/v1", { headers: { "x-trace": "42" } }, INJECT, () => "sk");
  assert.equal(r.headers.get("x-trace"), "42");
  assert.equal(r.headers.get("authorization"), "Bearer sk");
});
