/* toolboy net relay — SSRF guard.

   The relay forwards a tool's request to a third-party API the browser couldn't
   reach directly (CORS). Because it makes an outbound fetch on behalf of a
   caller, it must never be coaxed into hitting an internal address — private
   ranges, loopback, link-local, or a cloud metadata endpoint (the classic
   169.254.169.254 credential-theft target). This module is the literal-address
   blocklist; it's deliberately standalone so it can be reasoned about and tested
   on its own.

   Residual risk (named, not hidden): this blocks literal IPs and known internal
   hostnames, but not DNS rebinding — a hostname that resolves to a private IP at
   fetch time. Cloudflare Workers egress to the public internet (they can't route
   to a user's LAN), which blunts the impact, but a hardened deployment should add
   resolve-then-pin. See backend/README.md. */

/** Parse a dotted-quad IPv4 string to a uint32, or null if it isn't one. */
function ipv4ToInt(host: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  if (octets.some((o) => o > 255)) return null;
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

/** [network, prefixLength] CIDRs that must never be forwarded to. */
const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (incl. cloud metadata 169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved / 255.255.255.255 broadcast
];

function v4InBlockedRange(ip: number): boolean {
  for (const [net, bits] of BLOCKED_V4) {
    const base = ipv4ToInt(net)!;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((ip & mask) === (base & mask)) return true;
  }
  return false;
}

/** Internal hostnames that resolve to local/internal infra regardless of IP. */
function isBlockedName(host: string): boolean {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  );
}

/** True if `hostname` (the host portion of a URL, brackets already stripped for
    IPv6) must NOT be forwarded to. Fail closed: anything we can't positively
    classify as a safe public host is rejected. */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, ""); // drop FQDN trailing dot
  if (!host) return true;
  if (isBlockedName(host)) return true;

  // Numeric / hex hosts (e.g. http://2130706433 == 127.0.0.1, http://0x7f000001)
  // are valid to the URL parser but defeat dotted-quad checks — reject outright.
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/.test(host)) return true;

  const v4 = ipv4ToInt(host);
  if (v4 !== null) return v4InBlockedRange(v4);

  // IPv6 literal (URL.hostname keeps the brackets; caller passes them stripped).
  if (host.includes(":")) {
    if (host === "::1" || host === "::") return true; // loopback / unspecified
    if (host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb"))
      return true; // link-local fe80::/10
    if (host.startsWith("fc") || host.startsWith("fd")) return true; // unique-local fc00::/7
    if (host.startsWith("fec")) return true; // deprecated site-local
    // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4
    const mapped = /::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(host);
    if (mapped) {
      const inner = ipv4ToInt(mapped[1]);
      return inner === null ? true : v4InBlockedRange(inner);
    }
    return false; // a routable public IPv6
  }

  return false; // a plain public hostname
}
