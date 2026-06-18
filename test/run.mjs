/* Zero-dependency test runner.
 *
 * The repo has no test framework — but it ships esbuild (via Vite) and runs on Node,
 * whose built-in node:test auto-runs registered tests. So we bundle each *.test.ts
 * (resolving its .ts imports) to ESM with esbuild, then execute it. Node exits non-zero
 * if any test fails. No vitest/jest/tsx to install. */

import { build } from "esbuild";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tests = readdirSync(here).filter((f) => f.endsWith(".test.ts"));

let failed = false;
for (const t of tests) {
  const out = join(tmpdir(), `toolboy-${t}-${process.pid}.mjs`);
  await build({
    entryPoints: [join(here, t)],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: out,
    logLevel: "warning",
  });
  try {
    await import(pathToFileURL(out).href);
  } catch (err) {
    failed = true;
    console.error(err);
  }
}

// node:test reports its own pass/fail and sets exitCode; surface bundling/import errors too.
process.on("exit", (code) => {
  if (failed && code === 0) process.exitCode = 1;
});
