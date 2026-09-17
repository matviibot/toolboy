/* The two pure pieces of the persistence story.
 *
 * `repoIdentity` decides what a tool's saved data belongs to. It has to be stable
 * across refs — data is keyed by it, so if it moved when a repo moved to a new commit,
 * every tool would silently lose its state on update. That's the exact failure the key
 * change exists to prevent, so it's pinned here rather than left to reading.
 *
 * `parseSnapshot` reads a file the user picked by hand. It must reject anything that
 * isn't a vault with a message a human can act on, and it must not throw away the good
 * rows in a file with one bad one.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { repoIdentity } from "../src/loader/resolver";
import { parseSnapshot } from "../src/shell/vault";

test("repo identity is stable across refs and commits", () => {
  const main = repoIdentity("gh:matviibot/tools@main");
  assert.equal(main, "gh:matviibot/tools");
  // the whole point: a pinned commit and a branch are the same toolbox
  assert.equal(repoIdentity("gh:matviibot/tools@a1b2c3d"), main);
  assert.equal(repoIdentity("gh:matviibot/tools@feat/some/branch"), main);
});

test("a sub-path is part of the identity, a ref is not", () => {
  // two manifests in one repo are two toolboxes and must not share a namespace
  assert.equal(repoIdentity("gh:o/r@main#packages/a"), "gh:o/r#packages/a");
  assert.notEqual(repoIdentity("gh:o/r@main#packages/a"), repoIdentity("gh:o/r@main#packages/b"));
  assert.equal(repoIdentity("gh:o/r@main#packages/a"), repoIdentity("gh:o/r@v2#packages/a"));
});

test("different repos sharing an entity id get different namespaces", () => {
  assert.notEqual(repoIdentity("gh:alice/tools@main"), repoIdentity("gh:bob/tools@main"));
});

test("parseSnapshot round-trips a vault", () => {
  const snap = {
    kind: "toolboy.vault",
    version: 1,
    savedAt: "2026-09-17T00:00:00.000Z",
    note: "",
    favourites: [{ id: "words", source: "gh:o/r@main", name: "Word Generator", icon: "shuffle", kind: "tool" }],
    storage: [{ repo: "gh:o/r", tool: "words", key: "favourites", value: ["doll", "jeans"] }],
  };
  const out = parseSnapshot(JSON.stringify(snap));
  assert.equal(out.favourites.length, 1);
  assert.deepEqual(out.storage[0].value, ["doll", "jeans"]);
  assert.equal(out.savedAt, snap.savedAt);
});

test("parseSnapshot refuses things that aren't vaults", () => {
  assert.throws(() => parseSnapshot("not json at all"), /isn't JSON/);
  assert.throws(() => parseSnapshot('{"kind":"something-else"}'), /isn't a toolboy vault/);
  assert.throws(() => parseSnapshot('{"kind":"toolboy.vault"}'), /missing its contents/);
});

test("one malformed row doesn't cost the user the rest of the file", () => {
  const out = parseSnapshot(
    JSON.stringify({
      kind: "toolboy.vault",
      favourites: [
        { id: "a", source: "gh:o/r@main", name: "A" },
        { id: "b" }, // no source/name — unusable, drop it
      ],
      storage: [
        { repo: "gh:o/r", tool: "words", key: "k", value: 1 },
        { tool: "words" }, // no repo/key — drop it
      ],
    }),
  );
  assert.equal(out.favourites.length, 1);
  assert.equal(out.favourites[0].id, "a");
  assert.equal(out.storage.length, 1);
});

test("a value of undefined survives the shape filter", () => {
  // `value` is deliberately not type-checked — a tool may legitimately store null,
  // 0, "" or false, and a truthiness test on it would silently drop those entries
  const out = parseSnapshot(
    JSON.stringify({
      kind: "toolboy.vault",
      favourites: [],
      storage: [
        { repo: "r", tool: "t", key: "zero", value: 0 },
        { repo: "r", tool: "t", key: "empty", value: "" },
        { repo: "r", tool: "t", key: "false", value: false },
        { repo: "r", tool: "t", key: "null", value: null },
      ],
    }),
  );
  assert.equal(out.storage.length, 4);
});
