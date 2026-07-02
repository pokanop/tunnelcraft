/* Assemble all modules into ordered tracks */
import { CORE_MODULES } from "./core.js";
import { NET_A } from "./net-a.js";
import { NET_WIFI } from "./net-wifi.js";
import { NET_B } from "./net-b.js";
import { NET_C } from "./net-c.js";
import { NET_D } from "./net-d.js";
import { RUST_EXTRA } from "./rust-extra.js";
import { RUST_IDIOM } from "./rust-idiom.js";
import { PLATFORM_A } from "./platform-a.js";
import { PLATFORM_B } from "./platform-b.js";

const POOL = [...CORE_MODULES, ...NET_A, ...NET_WIFI, ...NET_B, ...NET_C, ...NET_D, ...RUST_EXTRA, ...RUST_IDIOM, ...PLATFORM_A, ...PLATFORM_B];
const byId = Object.fromEntries(POOL.map((m) => [m.id, m]));

const ORDER = [
  // NET track (m01=N01, m02=N08, m03=N11 from core)
  "m01","n02","n03","n04","n05","m02","n07","n08","m03","n10","n11","n12","n13",
  // RUST track
  "m04","r05","m05","m06","r04",
  // TUNNEL track
  "m07","m08","m09","m10",
  // SHIP track
  "m11","p01","p02","p03","p04","m12","m13",
];

export const ALL_MODULES = ORDER.map((id) => {
  const m = byId[id];
  if (!m) throw new Error("missing module: " + id);
  return m;
});

export const TRACKS = [
  {
    id: "net", code: "TRACK 1", title: "Network Fundamentals",
    blurb: "Zero to certifiable: layers, Ethernet, IP & IPv6, subnetting, TCP internals, routing & BGP, NAT, DNS, TLS/QUIC, the toolbelt, and security doctrine.",
    modules: ["m01","n02","n03","n04","n05","m02","n07","n08","m03","n10","n11","n12","n13"],
  },
  {
    id: "rust", code: "TRACK 2", title: "Rust for Systems",
    blurb: "Idiomatic Rust first — ownership, type-driven design, error craft — then async Tokio, network programming, and the professional tooling that makes it shippable.",
    modules: ["m04","r05","m05","m06","r04"],
  },
  {
    id: "tunnel", code: "TRACK 3", title: "Tunnel Engineering",
    blurb: "TUN/TAP packet I/O, Noise & AEAD crypto, WireGuard in practice, and NAT traversal.",
    modules: ["m07","m08","m09","m10"],
  },
  {
    id: "ship", code: "TRACK 4", title: "Shipping a Real Client",
    blurb: "Cross-platform engineering, then deep platform internals — Network Extension, wintun/WFP, policy routing, VpnService, proxies & PAC — the architecture of a production client, and the capstone.",
    modules: ["m11","p01","p02","p03","p04","m12","m13"],
  },
];

/* Well-known ports for the N16 infinite drill */
export const PORTS = [
  { svc: "SSH", port: 22 },
  { svc: "DNS", port: 53 },
  { svc: "HTTP", port: 80 },
  { svc: "HTTPS", port: 443 },
  { svc: "SMTP", port: 25 },
  { svc: "POP3", port: 110 },
  { svc: "IMAP", port: 143 },
  { svc: "NTP", port: 123 },
  { svc: "DHCP server", port: 67 },
  { svc: "DHCP client", port: 68 },
  { svc: "LDAP", port: 389 },
  { svc: "LDAPS", port: 636 },
  { svc: "RDP", port: 3389 },
  { svc: "SMB", port: 445 },
  { svc: "FTP control", port: 21 },
  { svc: "WireGuard (default)", port: 51820 },
  { svc: "IPsec IKE", port: 500 },
  { svc: "IPsec NAT-T", port: 4500 },
  { svc: "DNS over TLS", port: 853 },
  { svc: "OpenVPN (default)", port: 1194 },
];
