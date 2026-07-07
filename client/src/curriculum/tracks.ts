/* Assemble all modules into ordered tracks */
import { CORE_MODULES } from "./core";
import { TUNNEL_MESH } from "./tunnel-mesh";
import { NET_A } from "./net-a";
import { NET_DHCP } from "./net-dhcp";
import { NET_WIFI } from "./net-wifi";
import { NET_B } from "./net-b";
import { NET_C } from "./net-c";
import { NET_D } from "./net-d";
import { NET_V6T } from "./net-v6t";
import { NET_CLOUD } from "./net-cloud";
import { RUST_EXTRA } from "./rust-extra";
import { RUST_FUTURE } from "./rust-future";
import { RUST_IDIOM } from "./rust-idiom";
import { RUST_UNSAFE } from "./rust-unsafe";
import { PLATFORM_A } from "./platform-a";
import { PLATFORM_B } from "./platform-b";
import type { Module, Track } from "./types";

const POOL: Module[] = [
  ...CORE_MODULES,
  ...TUNNEL_MESH,
  ...NET_A,
  ...NET_DHCP,
  ...NET_WIFI,
  ...NET_B,
  ...NET_C,
  ...NET_D,
  ...NET_V6T,
  ...NET_CLOUD,
  ...RUST_EXTRA,
  ...RUST_FUTURE,
  ...RUST_IDIOM,
  ...RUST_UNSAFE,
  ...PLATFORM_A,
  ...PLATFORM_B,
];
const byId: Record<string, Module> = Object.fromEntries(POOL.map((m) => [m.id, m]));

const ORDER: string[] = [
  // NET track (m01=N01, m02=N08, m03=N11 from core;
  // n04w/n06w/n14w = N04/N06/N14 wireless modules from net-wifi;
  // n15=N15 DHCP, taught right after N05 where addressing lands)
  "m01",
  "n02",
  "n03",
  "n04w",
  "n04",
  "n15",
  "n06w",
  "n05",
  "m02",
  "n07",
  "n08",
  "m03",
  "n10",
  "n11",
  "n14w",
  "n19",
  "n12",
  "n13",
  "n16",
  // RUST track (r06=R04 futures-by-hand, r07=R06 unsafe/FFI/atomics —
  // ids and codes are decoupled; codes renumbered when these were inserted)
  "m04",
  "r05",
  "m05",
  "r06",
  "m06",
  "r07",
  "r04",
  // TUNNEL track
  "m07",
  "m08",
  "m09",
  "m10",
  "t05",
  // SHIP track
  "m11",
  "p01",
  "p02",
  "p03",
  "p04",
  "m12",
  "m13",
];

export const ALL_MODULES: Module[] = ORDER.map((id) => {
  const m = byId[id];
  if (!m) throw new Error("missing module: " + id);
  return m;
});

export const TRACKS: Track[] = [
  {
    id: "net",
    code: "TRACK 1",
    title: "Network Fundamentals",
    blurb:
      "Zero to certifiable: layers, Ethernet, Wi-Fi & RF, IP & IPv6, DHCP, enterprise wireless, subnetting, TCP internals, routing & BGP, NAT, DNS, TLS/QUIC, cellular & CGNAT, IPv6 transition (NAT64/DNS64/464XLAT), the toolbelt, security doctrine, and cloud networking — VPCs, load balancers, IPsec & SD-WAN.",
    modules: [
      "m01",
      "n02",
      "n03",
      "n04w",
      "n04",
      "n15",
      "n06w",
      "n05",
      "m02",
      "n07",
      "n08",
      "m03",
      "n10",
      "n11",
      "n14w",
      "n19",
      "n12",
      "n13",
      "n16",
    ],
  },
  {
    id: "rust",
    code: "TRACK 2",
    title: "Rust for Systems",
    blurb:
      "Idiomatic Rust first — ownership, type-driven design, error craft — then async Tokio, futures written by hand, network programming, unsafe & FFI with atomics, and the professional tooling that makes it shippable.",
    modules: ["m04", "r05", "m05", "r06", "m06", "r07", "r04"],
  },
  {
    id: "tunnel",
    code: "TRACK 3",
    title: "Tunnel Engineering",
    blurb:
      "TUN/TAP packet I/O, Noise & AEAD crypto, WireGuard in practice, NAT traversal, and decentralized mesh VPNs — control-plane topology, gossiped peer tables, and overlay routing.",
    modules: ["m07", "m08", "m09", "m10", "t05"],
  },
  {
    id: "ship",
    code: "TRACK 4",
    title: "Shipping a Real Client",
    blurb:
      "Cross-platform engineering, then deep platform internals — Network Extension, wintun/WFP, policy routing, VpnService, proxies & PAC — the architecture of a production client, and the capstone.",
    modules: ["m11", "p01", "p02", "p03", "p04", "m12", "m13"],
  },
];

/* Well-known ports for the N16 infinite drill */
export interface PortEntry {
  svc: string;
  port: number;
}
export const PORTS: PortEntry[] = [
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
