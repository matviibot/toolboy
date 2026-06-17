/* toolboy loader — Subresource Integrity for tool bundles.

   A public tool's manifest records `integrity: "sha384-…"`. Before a bundle ever
   runs, the loader hashes the bytes it fetched and checks them against that
   recorded hash (loading.md / security.md): a compromised CDN or repo fails the
   check instead of executing. The cache is content-addressed by this same hash. */

const ALGS: Record<string, AlgorithmIdentifier> = {
  sha256: "SHA-256",
  sha384: "SHA-384",
  sha512: "SHA-512",
};

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Compute an SRI string (default sha384) for some bundle text. */
export async function computeSri(text: string, alg: keyof typeof ALGS = "sha384"): Promise<string> {
  const digest = await crypto.subtle.digest(ALGS[alg], new TextEncoder().encode(text));
  return `${alg}-${toBase64(digest)}`;
}

/** Verify bundle text against a recorded `algo-base64` integrity string. */
export async function verifySri(text: string, integrity: string): Promise<boolean> {
  const dash = integrity.indexOf("-");
  const alg = integrity.slice(0, dash);
  if (!ALGS[alg]) throw new Error(`unsupported integrity algorithm: ${alg}`);
  const actual = await computeSri(text, alg as keyof typeof ALGS);
  return actual === integrity;
}
