import type { Module } from "./types";

export const CORE_MODULES: Module[] = [
  /* ---------------- N01 ---------------- */
  {
    id: "m01",
    code: "N01",
    title: "The Map: How Networks Actually Move Bytes",
    layers: ["L1", "L2", "L3", "L4", "L7"],
    est: "~75 min",
    tag: "Layers, encapsulation, IP addressing, routing, and MTU — the mental model every tunnel is built on.",
    lessons: [
      {
        id: "m01l1",
        title: "Why layers exist (and which ones matter)",
        est: "8 min",
        blocks: [
          {
            p: "Networking is a stack of contracts. Each layer promises a service to the layer above and demands one from the layer below. The OSI model names seven; the internet actually runs on four or five. What matters for tunnel engineering is knowing exactly which layer you are standing on at any moment, because a VPN is a machine that lifts traffic out of one layer, wraps it, and re-injects it somewhere else.",
          },
          {
            ul: [
              "**L2 (link)** — frames between directly connected machines: Ethernet, Wi-Fi. TAP devices live here.",
              "**L3 (network)** — IP packets routed hop-by-hop across networks. TUN devices and WireGuard live here.",
              "**L4 (transport)** — TCP streams and UDP datagrams, addressed by port. SOCKS proxies and MASQUE CONNECT-UDP live here.",
              "**L7 (application)** — HTTP, DNS, QUIC payloads. Split-tunnel-by-app and posture checks reason at this level.",
            ],
          },
          {
            p: "Encapsulation is the mechanic that ties it together: each layer prepends a header to the payload it received. A VPN is recursive encapsulation — a full IP packet becomes the **payload** of another protocol.",
          },
          {
            diagram: {
              kind: "packet",
              title: "A WireGuard-tunneled web request, on the wire",
              segs: [
                { label: "Eth", tone: "l2" },
                { label: "IP", sub: "you → VPN", tone: "l3" },
                { label: "UDP", sub: ":51820", tone: "l4" },
                { label: "WG", sub: "transport", tone: "acc" },
                {
                  label: "encrypted",
                  tone: "acc",
                  inner: [
                    { label: "IP", sub: "you → site", tone: "l3" },
                    { label: "TCP", sub: ":443", tone: "l4" },
                    { label: "TLS", tone: "l6" },
                    { label: "HTTP", tone: "l7" },
                  ],
                },
              ],
              caption:
                "The inner packet is a complete, routable IP packet; the outer stack exists only to carry it across the underlay.",
            },
          },
          {
            note: "Vocabulary you will use daily: the **underlay** is the real network path (your Wi-Fi, your ISP). The **overlay** is the virtual network your tunnel creates. Every hard VPN bug is a disagreement between the two.",
            label: "FIELD NOTE",
          },
        ],
      },
      {
        id: "m01l2",
        title: "IP addressing & CIDR, cold",
        est: "12 min",
        blocks: [
          {
            p: "An IPv4 address is a 32-bit integer with a costume on. CIDR notation, `10.8.0.0/24`, says: the first 24 bits identify the network, the remaining 8 identify hosts inside it. Everything else — network address, broadcast, host count — is bit arithmetic.",
          },
          {
            code: {
              lang: "text",
              body: `10.8.0.0/24
mask      = 24 ones then 8 zeros   -> 255.255.255.0
network   = ip AND mask            -> 10.8.0.0
broadcast = network OR (NOT mask)  -> 10.8.0.255
usable    = 2^(32-24) - 2          -> 254 hosts

Trickier: 172.16.37.190/26
/26 -> block size 64 in the last octet: .0 .64 .128 .192
network   = 172.16.37.128
broadcast = 172.16.37.191
usable    = 62`,
            },
          },
          {
            p: "Memorize the private (RFC 1918) ranges, because your overlay addressing must never collide with a user's LAN: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`. Also know `100.64.0.0/10` (CGNAT space, which Tailscale famously borrowed) and `169.254.0.0/16` (link-local).",
          },
          { p: "In Rust, this arithmetic is one `u32`:" },
          {
            code: {
              lang: "rust",
              body: `use std::net::Ipv4Addr;

fn network(addr: Ipv4Addr, prefix: u8) -> Ipv4Addr {
    let ip = u32::from(addr);
    let mask = if prefix == 0 { 0 } else { u32::MAX << (32 - prefix) };
    Ipv4Addr::from(ip & mask)
}

fn contains(net: Ipv4Addr, prefix: u8, addr: Ipv4Addr) -> bool {
    network(net, prefix) == network(addr, prefix)
}
// contains() is the seed of cryptokey routing (T03)
// and of your AllowedIPs matcher.`,
            },
          },
        ],
      },
      {
        id: "m01l3",
        title: "Routing: longest prefix wins",
        est: "10 min",
        blocks: [
          {
            p: "A routing table answers one question: given this destination IP, which interface and next hop? The rule is **longest prefix match** — the most specific route wins. A `/32` beats a `/24` beats the default route `0.0.0.0/0`. Every VPN client is, at heart, a program that manipulates this table without breaking the machine it runs on.",
          },
          {
            code: {
              lang: "sh",
              body: `$ ip route
default via 192.168.1.1 dev wlan0        # the underlay default
10.8.0.0/24 dev wg0 scope link           # the overlay subnet
192.168.1.0/24 dev wlan0 scope link      # the LAN`,
            },
          },
          {
            p: "The classic full-tunnel trick: instead of replacing the default route (fragile, easy to leak), add `0.0.0.0/1` and `128.0.0.0/1` via the tunnel. Each is more specific than `0.0.0.0/0`, so together they capture everything — while the original default remains intact underneath for recovery. One more `/32` route pins the VPN server's own endpoint to the physical interface, or your encrypted packets would route into the tunnel that carries them: a **routing loop**.",
          },
          {
            note: "This /1 + /1 override plus the endpoint /32 pin is exactly what `wg-quick` does. When you build your own client you will re-implement it on every OS — with a different API each time (S01).",
            label: "FIELD NOTE",
          },
        ],
      },
      {
        id: "m01l4",
        title: "MTU, fragmentation & the 80-byte tax",
        est: "10 min",
        blocks: [
          {
            p: "Every link has an MTU — the largest frame it will carry, typically 1500 bytes on Ethernet. Tunnels add headers **inside** that limit, so the overlay MTU must shrink. WireGuard over IPv4 costs 60 bytes; over IPv6, 80. Hence the canonical `wg0` MTU of 1420.",
          },
          {
            diagram: {
              kind: "packet",
              title: "Spending the 1500-byte underlay MTU (WG over IPv6)",
              segs: [
                { label: "IPv6", sub: "40 B", tone: "l3" },
                { label: "UDP", sub: "8 B", tone: "l4" },
                { label: "WG header", sub: "16 B", tone: "acc" },
                { label: "inner IP packet", sub: "up to 1420 B", tone: "ok" },
                { label: "auth tag", sub: "16 B", tone: "acc" },
              ],
              caption:
                "40 + 8 + 16 + 16 bytes of tunnel overhead inside 1500 leave 1420 for the inner packet — the canonical wg0 MTU.",
            },
          },
          {
            p: "Get this wrong and you meet the most infamous class of VPN bug: small packets flow (ping works!), large packets vanish (every real page hangs). The cause is usually a black hole — a router drops the too-big packet and the ICMP 'fragmentation needed' message never makes it back. Defenses: a conservative tunnel MTU, and clamping TCP MSS on SYN packets crossing the tunnel so endpoints negotiate smaller segments up front.",
          },
          {
            note: "Debug ritual: `ping -M do -s 1392 peer` probes the path with don't-fragment set (1392 payload + 28 header = 1420 packet). Binary-search the size until it stops working — that is your real path MTU.",
            label: "DEBUG RITUAL",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "m01e1",
        type: "order",
        title: "Encapsulation, in order",
        kind: "SEQUENCE LAB",
        prompt:
          "A browser sends an HTTP request. Tap the stages in the order they wrap the data on its way down the stack.",
        items: [
          "HTTP request bytes — application data",
          "+ TCP header — now a segment",
          "+ IP header — now a packet",
          "+ Ethernet header & trailer — now a frame",
          "Bits on the wire",
        ],
        why: "Down the stack, each layer prepends its header to everything above it. A VPN repeats the recursion: the finished IP packet becomes application data for the tunnel.",
      },
      {
        id: "m01e2",
        type: "cidr",
        title: "CIDR trainer — infinite reps",
        kind: "LIVE DRILL",
        prompt:
          "Subnet math must be reflexive before you write an AllowedIPs matcher. Compute the network address, broadcast address, and usable host count. New problems forever.",
      },
    ],
    quiz: {
      id: "m01q",
      questions: [
        {
          q: "A client must reach its VPN server at 203.0.113.5 while routing all traffic through wg0. Why add a 203.0.113.5/32 route via the physical interface?",
          opts: [
            "To make the handshake faster by skipping encryption",
            "To prevent a routing loop where the tunnel's own encrypted packets are routed back into the tunnel",
            "Because /32 routes are required for UDP traffic",
          ],
          a: 1,
          why: "Without the pin, longest-prefix match would send the tunnel's ciphertext into the tunnel — recursion, then silence.",
        },
        {
          q: "Your tunnel MTU equals the underlay's 1500. Ping works but HTTPS pages hang forever. Most likely cause?",
          opts: [
            "The AEAD cipher is too slow for large packets",
            "Large encapsulated packets exceed the underlay MTU and are black-holed",
            "The TCP handshake is blocked by a firewall",
          ],
          a: 1,
          why: "Small ICMP fits even with tunnel overhead; full-size TCP segments don't. Classic MTU black hole — shrink the tunnel MTU and clamp MSS.",
        },
        {
          q: "Which route wins for destination 10.8.0.7: 0.0.0.0/0 via eth0, 10.8.0.0/24 dev wg0, or 10.8.0.7/32 dev lo?",
          opts: [
            "The default route — it is listed first",
            "10.8.0.0/24 — it is the overlay subnet",
            "10.8.0.7/32 — longest prefix always wins",
          ],
          a: 2,
          why: "Order in the table is irrelevant; specificity decides. A /32 is as specific as IPv4 gets.",
        },
      ],
    },
  },

  /* ---------------- N08 ---------------- */
  {
    id: "m02",
    code: "N08",
    title: "Transport: TCP, UDP & the Socket Contract",
    layers: ["L4"],
    est: "~55 min",
    tag: "Streams vs datagrams, the handshake, why serious tunnels ride UDP, and what a socket really promises.",
    lessons: [
      {
        id: "m02l1",
        title: "UDP: the honest datagram",
        est: "8 min",
        blocks: [
          {
            p: "UDP adds exactly one idea to IP: **ports**, so multiple programs can share an address. No connection, no ordering, no retransmission, no congestion control. A datagram arrives whole or not at all. That brutal simplicity is why serious VPN protocols ride UDP — the tunnel wants raw, unordered carriage, because the traffic **inside** already carries whatever reliability it needs.",
          },
          {
            code: {
              lang: "rust",
              body: `use std::net::UdpSocket;

fn main() -> std::io::Result<()> {
    let sock = UdpSocket::bind("0.0.0.0:51820")?;
    let mut buf = [0u8; 65535]; // max theoretical datagram
    loop {
        let (n, peer) = sock.recv_from(&mut buf)?;
        sock.send_to(&buf[..n], peer)?; // echo it back
    }
}`,
            },
          },
          {
            p: "Note the contract of `recv_from`: one call, one complete datagram. If your buffer is too small the excess is **truncated and gone** — which is why packet code sizes buffers to the maximum, then trims with a slice.",
          },
        ],
      },
      {
        id: "m02l2",
        title: "TCP: streams, the handshake, and the meltdown",
        est: "10 min",
        blocks: [
          {
            p: "TCP turns unreliable packets into a reliable, ordered byte stream: sequence numbers, acknowledgments, retransmission timers, congestion windows. It opens with the three-way handshake — SYN, SYN-ACK, ACK — which is also where MSS is negotiated (your N01 clamping target) and where a full round trip is spent before any data moves.",
          },
          {
            diagram: {
              kind: "seq",
              title: "The three-way handshake",
              actors: [
                { id: "c", label: "client", tone: "l4" },
                { id: "s", label: "server", tone: "l4" },
              ],
              steps: [
                { from: "c", to: "s", label: "SYN", sub: "seq=x, MSS offer" },
                { from: "s", to: "c", label: "SYN-ACK", sub: "seq=y, ack=x+1" },
                { from: "c", to: "s", label: "ACK", sub: "ack=y+1", tone: "ok" },
                { note: "established — one full RTT before any data", tone: "dim" },
                { from: "c", to: "s", label: "data", sub: "paced by ack + cwnd", tone: "ok" },
              ],
              caption:
                "One round trip spent before byte one — the cost QUIC folds into its crypto handshake and WireGuard's 1-RTT design echoes.",
            },
          },
          {
            p: "The reason you never tunnel naively over TCP: **TCP-over-TCP meltdown**. The inner connection retransmits on loss; so does the outer one. When the underlay drops a packet, both control loops back off and retransmit against each other, and throughput collapses exactly when the network is stressed. OpenVPN's TCP mode exists only as a firewall-escape hatch; MASQUE (S02) solves the same problem properly with QUIC's unreliable DATAGRAM frames.",
          },
          {
            note: "Design rule: the carrier should be **dumber** than the cargo. TCP inside UDP: fine. TCP inside TCP: meltdown. That asymmetry shapes every protocol choice in this course.",
            label: "DESIGN RULE",
          },
        ],
      },
      {
        id: "m02l3",
        title: "Sockets: the API under every crate",
        est: "10 min",
        blocks: [
          {
            p: "Every networking library on every OS bottoms out in the Berkeley sockets API. Knowing the primitive verbs makes tokio, socket2, and platform quirks legible.",
          },
          {
            ul: [
              "`socket()` — allocate an endpoint (family, type, protocol).",
              "`bind()` — claim a local address and port. Port 0 means: kernel, pick an ephemeral one for me.",
              "`listen()` / `accept()` — TCP server side; each accept yields a **new** connected socket.",
              "`connect()` — TCP: run the handshake. UDP: merely set a default peer (no packets sent!).",
              "`send`/`recv`, `sendto`/`recvfrom` — move bytes; the -to/-from pair is the connectionless flavor.",
              "`setsockopt()` — the escape hatch where everything platform-specific lives (R04).",
            ],
          },
          {
            p: "Two facts that regularly surprise people: a UDP `connect` filters inbound traffic to that peer and lets the kernel deliver ICMP errors to you, and an `accept`ed TCP socket shares the listener's port — the 4-tuple (src ip, src port, dst ip, dst port) is what must be unique, not the port.",
          },
        ],
      },
      {
        id: "m02l4",
        title: "Firewalls & conntrack: state you don't control",
        est: "8 min",
        blocks: [
          {
            p: "Between your socket and the internet sit stateful middleboxes. A stateful firewall watches outbound traffic and creates temporary permissions for the replies — `ESTABLISHED,RELATED` in Linux conntrack terms. For UDP there is no connection to track, so the firewall fakes one: an outbound datagram opens a return window keyed on the address pair, with a timeout measured in tens of seconds.",
          },
          {
            p: "This is the physics behind two things you will build later: **persistent keepalives** (N11/T03) exist to refresh those UDP windows before they expire, and **hole punching** (T04) works by deliberately creating outbound state on both sides at once. Middlebox state is invisible, unqueryable, and expires silently — your protocol must assume it and refresh it.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "m02e1",
        type: "order",
        title: "Life of a TCP connection",
        kind: "SEQUENCE LAB",
        prompt: "Order the events of a well-behaved TCP connection from first packet to close.",
        items: [
          "Client sends SYN (seq = x, offers MSS)",
          "Server replies SYN-ACK (seq = y, ack = x+1)",
          "Client sends ACK (ack = y+1) — connection established",
          "Data flows both ways, paced by ack + congestion window",
          "FIN / ACK exchange closes each direction independently",
        ],
        why: "One round trip before any data — which is why QUIC folds its crypto handshake into the transport handshake, and why WireGuard's 1-RTT design matters.",
      },
    ],
    quiz: {
      id: "m02q",
      questions: [
        {
          q: "Why do WireGuard, QUIC, and modern VPN protocols run over UDP rather than TCP?",
          opts: [
            "UDP packets are encrypted by default",
            "Tunneling reliable traffic over a reliable carrier causes competing retransmission loops (meltdown); UDP carries without interfering",
            "UDP has larger maximum packet sizes than TCP",
          ],
          a: 1,
          why: "The cargo already handles reliability. A dumb carrier lets the inner control loops work as designed.",
        },
        {
          q: "You bind a UDP socket and call connect() on it. What actually happens?",
          opts: [
            "A three-way handshake runs with the peer",
            "Nothing on the wire — the kernel just fixes the default peer and filters inbound datagrams to it",
            "The socket switches to reliable delivery mode",
          ],
          a: 1,
          why: "UDP connect is bookkeeping, not negotiation. Zero packets are sent.",
        },
        {
          q: "An outbound UDP flow works, then replies silently stop arriving after ~30 seconds of quiet. The most likely culprit is:",
          opts: [
            "The remote host crashed",
            "A stateful firewall or NAT expired its mapping for the idle flow",
            "UDP checksum failures",
          ],
          a: 1,
          why: "Idle UDP state times out fast. This is precisely why persistent keepalive exists — and why its default suggestion is 25 s, under common 30 s timeouts.",
        },
      ],
    },
  },

  /* ---------------- N11 ---------------- */
  {
    id: "m03",
    code: "N11",
    title: "The Hostile Internet: NAT & DNS",
    layers: ["L3", "L4", "L7"],
    est: "~55 min",
    tag: "Address translation, the four NAT temperaments, DNS resolution, and the leaks that make or break a VPN.",
    lessons: [
      {
        id: "m03l1",
        title: "NAT: the lie that saved IPv4",
        est: "8 min",
        blocks: [
          {
            p: "Network Address Translation lets a whole LAN hide behind one public IP. Your router rewrites the source address and port of outbound packets, records the mapping in a table, and reverses the rewrite for replies. It works so transparently that most software never notices — until that software is a VPN trying to receive unsolicited packets.",
          },
          {
            diagram: {
              kind: "seq",
              title: "One datagram through NAT, and back",
              actors: [
                { id: "app", label: "app", sub: "192.168.1.7:51820", tone: "l7" },
                { id: "nat", label: "NAT", sub: "203.0.113.9", tone: "l3" },
                { id: "srv", label: "server", tone: "l4" },
              ],
              steps: [
                { from: "app", to: "nat", label: "UDP out", sub: "src 192.168.1.7:51820" },
                { note: "mapping recorded: 192.168.1.7:51820 ⇄ :41000", tone: "acc" },
                {
                  from: "nat",
                  to: "srv",
                  label: "rewritten",
                  sub: "src 203.0.113.9:41000",
                  tone: "acc",
                },
                { from: "srv", to: "nat", label: "reply", sub: "dst 203.0.113.9:41000" },
                {
                  from: "nat",
                  to: "app",
                  label: "translated",
                  sub: "dst 192.168.1.7:51820",
                  tone: "ok",
                },
              ],
              caption:
                "The mapping row is temporary state: nobody outside can create it, and it evaporates when idle.",
            },
          },
          {
            p: "The consequences: nobody outside can reach you unless you talk first, your app does not know its own public address, and the mapping is temporary state that vanishes when idle. All three problems become engineering work in T04.",
          },
        ],
      },
      {
        id: "m03l2",
        title: "The four NAT temperaments",
        est: "10 min",
        blocks: [
          {
            p: "NATs differ in two behaviors (RFC 4787 vocabulary): **mapping** — do I get the same external port for every destination I talk to? — and **filtering** — who is allowed to send back through that port? The folk taxonomy compresses this into four types:",
          },
          {
            tbl: {
              head: ["Type", "Behavior", "Hole-punchable?"],
              rows: [
                [
                  "Full cone",
                  "One mapping for all destinations; anyone may send to it",
                  "Trivially",
                ],
                ["Restricted cone", "One mapping; only IPs you contacted may reply", "Yes"],
                [
                  "Port-restricted",
                  "One mapping; only exact ip:port you contacted may reply",
                  "Yes, with simultaneous send",
                ],
                [
                  "Symmetric",
                  "New mapping per destination — external port unpredictable",
                  "Only via port prediction or relay",
                ],
              ],
            },
          },
          {
            p: "The one that matters: **endpoint-independent mapping** (the cone family) means a STUN server can tell you a public ip:port that is also valid for other peers. **Symmetric** NAT breaks that assumption — the port STUN sees is not the port your peer will see — which is why every production mesh VPN ships a relay fallback.",
          },
        ],
      },
      {
        id: "m03l3",
        title: "DNS: resolution, and where VPNs leak",
        est: "10 min",
        blocks: [
          {
            p: "A DNS query walks from stub resolver → recursive resolver → root → TLD → authoritative servers, with caching at every step. For a VPN client, DNS is less about the protocol and more about **which resolver gets the question**. If tunnel traffic is encrypted but DNS queries still go to the ISP's resolver in plaintext, you have built a privacy product that broadcasts every site the user visits. That is the classic **DNS leak**.",
          },
          {
            diagram: {
              kind: "flow",
              title: "Where a name goes",
              nodes: [
                { label: "stub", sub: "app / OS", tone: "l7" },
                { label: "recursive", sub: "the leak point", tone: "acc" },
                { label: "root", tone: "dim" },
                { label: "TLD", sub: ".com", tone: "dim" },
                { label: "auth", sub: "example.com", tone: "l7" },
              ],
              arrows: ["query", "referral", "referral", "answer"],
              caption:
                "Caching at every hop — but privacy is decided at hop one: which recursive resolver hears every name the user visits.",
            },
          },
          {
            ul: [
              "**Full tunnel:** push a resolver reachable only through the tunnel, and force it — per-OS mechanics differ wildly (S01).",
              "**Split tunnel:** you may need **split DNS** — corp domains to the corp resolver through the tunnel, everything else to the local resolver. This is a routing decision at L7.",
              "**Verify, always:** leak testing belongs in CI, not in a postmortem.",
            ],
          },
          {
            note: "Modern wrinkle: OS-level encrypted DNS (DoH/DoT) and browser-level DoH can bypass your carefully-set resolver entirely. A production client detects and handles this, or documents that it doesn't.",
            label: "FIELD NOTE",
          },
        ],
      },
      {
        id: "m03l4",
        title: "Keepalives: paying rent on middlebox state",
        est: "7 min",
        blocks: [
          {
            p: "Every NAT mapping and firewall window you depend on is leased, not owned. UDP mappings commonly expire after 30–120 seconds of silence; aggressive mobile carriers go lower. A quiet tunnel therefore goes deaf: the server tries to reach the client and the NAT, having forgotten the mapping, drops the packets.",
          },
          {
            p: "The fix is boring and essential: send a small packet often enough to refresh the lease. WireGuard's `PersistentKeepalive = 25` sends a 32-byte keepalive every 25 seconds — chosen to slip under 30-second timeouts. The cost is battery and radio wake-ups, which is why it's off by default and why mobile clients treat keepalive tuning as a real design problem, not a config detail.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "m03e1",
        type: "order",
        title: "Life of a NAT'd packet",
        kind: "SEQUENCE LAB",
        prompt: "Order the steps as a datagram leaves a LAN, gets a reply, and comes home.",
        items: [
          "App sends UDP from 192.168.1.7:51820",
          "NAT rewrites source to 203.0.113.9:41000 and records the mapping",
          "Server receives the packet and replies to 203.0.113.9:41000",
          "NAT matches the mapping and rewrites the destination back",
          "App receives the reply as if NAT never existed",
        ],
        why: "The mapping row in step 2 is the resource everything else in NAT traversal fights over: creating it, discovering it, and keeping it alive.",
      },
    ],
    quiz: {
      id: "m03q",
      questions: [
        {
          q: "STUN reports your public endpoint as 203.0.113.9:41000, but a peer sending there gets nothing, and each new destination you contact sees a different port. Your NAT is:",
          opts: ["Full cone", "Port-restricted cone", "Symmetric"],
          a: 2,
          why: "Per-destination mappings are the signature of symmetric NAT — the STUN-observed port is only valid for the STUN server.",
        },
        {
          q: "A VPN advertises full-tunnel encryption but the OS keeps using the DHCP-provided resolver. What happens?",
          opts: [
            "Nothing — DNS is already encrypted by default",
            "Every hostname the user visits is visible to the local network: a DNS leak",
            "DNS fails because the resolver is unreachable",
          ],
          a: 1,
          why: "The tunnel hides packet contents and destinations by IP, but the plaintext queries to the LAN resolver announce every domain anyway.",
        },
        {
          q: "Why is WireGuard's suggested persistent keepalive 25 seconds rather than 60?",
          opts: [
            "The protocol requires a handshake every 25 s",
            "Common NAT/firewall UDP timeouts start around 30 s; the keepalive must refresh state before the shortest lease expires",
            "Anything longer would trigger a rekey",
          ],
          a: 1,
          why: "It's rent on middlebox state. Pay before the eviction notice, with margin.",
        },
      ],
    },
  },

  /* ---------------- R01 ---------------- */
  {
    id: "m04",
    code: "R01",
    title: "Rust Foundations: Ownership as a Network Skill",
    layers: ["RS"],
    est: "~80 min",
    tag: "Ownership, borrowing, Result, traits, lifetimes — taught on packet buffers, because that's where you'll use them.",
    lessons: [
      {
        id: "m04l1",
        title: "Ownership & borrowing on packet buffers",
        est: "14 min",
        blocks: [
          {
            p: "Rust's core deal: every value has exactly one owner; the value is dropped when the owner goes out of scope; you may lend it out as many shared references (`&T`) as you like, **or** one exclusive reference (`&mut T`) — never both at once. In networking terms: a packet buffer can be inspected by many readers or mutated by one writer, and the compiler proves no reader ever sees a half-written packet. Data races become type errors.",
          },
          {
            diagram: {
              kind: "state",
              title: "What the borrow checker allows",
              states: [
                { id: "shared", label: "&T (shared)", x: 0, y: 0, tone: "l4" },
                { id: "owned", label: "owned", x: 1, y: 0, tone: "acc" },
                { id: "excl", label: "&mut (excl)", x: 2, y: 0, tone: "ok" },
                { id: "moved", label: "moved", x: 1, y: 1, tone: "dim" },
              ],
              edges: [
                { from: "owned", to: "shared", label: "&T, many", bend: 24 },
                { from: "shared", to: "owned", label: "all end", bend: 24 },
                { from: "owned", to: "excl", label: "&mut, one", bend: 24 },
                { from: "excl", to: "owned", label: "ends", bend: 24 },
                { from: "owned", to: "moved", label: "transmit(buf)", tone: "bad" },
              ],
              caption:
                "Many readers or one writer, never both — and after a move the old name is gone: use-after-send is a compile error.",
            },
          },
          {
            code: {
              lang: "rust",
              body: `fn checksum(buf: &[u8]) -> u16 { /* read-only borrow */ 0 }
fn scramble(buf: &mut [u8]) { /* exclusive borrow */ }
fn transmit(buf: Vec<u8>) { /* takes ownership */ }

let mut packet = vec![0u8; 1500];
scramble(&mut packet);        // lend exclusively, briefly
let sum = checksum(&packet);  // lend shared
transmit(packet);             // give it away — moved
// packet is unusable here: value moved. The compiler
// just prevented a use-after-send bug.`,
            },
          },
          {
            p: "The mental shift: stop asking 'how do I keep access to this?' and start asking 'who should own this next?'. Packet pipelines are ownership relay races — buffer moves from reader to parser to encryptor to socket — and the borrow checker is the referee that guarantees no one runs with a baton already handed off.",
          },
        ],
      },
      {
        id: "m04l2",
        title: "Result, Option & the ? operator",
        est: "12 min",
        blocks: [
          {
            p: "Rust has no exceptions and no null. A fallible operation returns `Result<T, E>`; an absent value is `Option<T>`. The `?` operator propagates errors up the call chain, converting types via `From` along the way. Networking code is 90% fallible operations, so this becomes muscle memory fast.",
          },
          {
            code: {
              lang: "rust",
              body: `use std::net::{SocketAddr, UdpSocket};

#[derive(Debug, thiserror::Error)]
enum TunnelError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("packet too short: {0} bytes")]
    Truncated(usize),
}

fn peer_of(pkt: &[u8]) -> Option<SocketAddr> {
    if pkt.len() < 20 { return None }
    /* parse... */ None
}

fn pump(sock: &UdpSocket, buf: &mut [u8]) -> Result<usize, TunnelError> {
    let (n, _from) = sock.recv_from(buf)?;   // io::Error -> TunnelError via From
    if n < 32 { return Err(TunnelError::Truncated(n)) }
    Ok(n)
}`,
            },
          },
          {
            ul: [
              "**Library code:** concrete error enums with `thiserror` — callers can match on variants.",
              "**Application code:** `anyhow::Result` — rich context, no ceremony.",
              '`unwrap()` in production paths is a code smell; `expect("why this cannot fail")` at least documents the bet.',
            ],
          },
        ],
      },
      {
        id: "m04l3",
        title: "Traits: designing small contracts",
        est: "14 min",
        blocks: [
          {
            p: "Traits are Rust's interfaces, and the backbone of your eventual architecture: `TunnelEngine`, `ConfigSource`, `PostureProvider` are all traits (S02). The craft is keeping them **small** — one capability per trait — so implementations stay honest and tests stay cheap.",
          },
          {
            code: {
              lang: "rust",
              body: `/// Anything that can carry an outbound IP packet.
trait PacketSink {
    fn send_packet(&mut self, pkt: &[u8]) -> std::io::Result<()>;
}

// Static dispatch: monomorphized, zero-cost, resolved at compile time.
fn flush<S: PacketSink>(sink: &mut S, queue: &mut Vec<Vec<u8>>) {
    for p in queue.drain(..) { let _ = sink.send_packet(&p); }
}

// Dynamic dispatch: one vtable pointer, engines swappable at runtime.
struct Router { engines: Vec<Box<dyn PacketSink>> }`,
            },
          },
          {
            p: "Rule of thumb: generics (`impl Trait`, `<S: PacketSink>`) inside hot paths where the concrete type is known; `dyn Trait` at architectural seams where you genuinely need runtime substitution — like choosing between a WireGuard engine and a MASQUE engine per flow. `dyn` costs one pointer indirection; clarity at a boundary is usually worth it.",
          },
        ],
      },
      {
        id: "m04l4",
        title: "Lifetimes without fear",
        est: "12 min",
        blocks: [
          {
            p: "A lifetime is just a name for 'how long this borrow is valid'. Most of the time **elision** writes them for you. You name them explicitly when the compiler cannot guess the relationship — typically when returning a borrow tied to an input. In packet code, the canonical case is zero-copy parsing: views into a buffer instead of copies of it.",
          },
          {
            code: {
              lang: "rust",
              body: `/// A parsed view — zero copies, just borrows into the datagram.
struct Ipv4View<'a> {
    header: &'a [u8],
    payload: &'a [u8],
}

fn parse(buf: &[u8]) -> Option<Ipv4View<'_>> {
    let ihl = ((*buf.first()? & 0x0f) as usize) * 4;
    if buf.len() < ihl { return None }
    let (header, payload) = buf.split_at(ihl);
    Some(Ipv4View { header, payload })
}
// The '_ says: the view lives no longer than buf.
// Try to drop buf while the view exists — compile error,
// which is a use-after-free caught at build time.`,
            },
          },
          {
            p: "When a lifetime fight gets ugly, remember you have an exit: **own the data**. `Bytes` from the `bytes` crate gives cheap reference-counted slices — clone-friendly views with no lifetime parameters — and is the idiomatic middle ground in async packet pipelines where borrows can't cross `.await` points comfortably.",
          },
        ],
      },
      {
        id: "m04l5",
        title: "Idiomatic patterns you'll reach for weekly",
        est: "12 min",
        blocks: [
          { h: "Newtypes: make invalid states unrepresentable" },
          {
            code: {
              lang: "rust",
              body: `struct PublicKey([u8; 32]);
struct PrivateKey([u8; 32]);
// send_handshake(pubkey: PublicKey) can no longer be
// called with a private key. Same bytes, different types,
// whole bug class deleted.`,
            },
          },
          { h: "From / TryFrom: conversions at the boundary" },
          {
            code: {
              lang: "rust",
              body: `impl TryFrom<&[u8]> for PublicKey {
    type Error = KeyError;
    fn try_from(b: &[u8]) -> Result<Self, KeyError> {
        let arr: [u8; 32] = b.try_into().map_err(|_| KeyError::Length)?;
        Ok(PublicKey(arr))
    }
}`,
            },
          },
          { h: "Iterators over index loops" },
          {
            code: {
              lang: "rust",
              body: `// find the best route: no bounds checks, no off-by-ones
let best = routes.iter()
    .filter(|r| r.contains(dst))
    .max_by_key(|r| r.prefix_len);`,
            },
          },
          {
            p: "And the builder pattern for anything with more than three optional knobs — you will want it for `TunnelConfig`. The common thread: push invariants into types, so the code that runs at 2 a.m. has fewer ways to be wrong.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "m04e1",
        type: "blank",
        title: "Borrow-check the packet path",
        kind: "CODE LAB",
        prompt:
          "Fill each blank so this compiles — choose the least-privileged borrow that still works.",
        code: `fn checksum(buf: §0§) -> u16 { 0 /* ... */ }
fn scramble(buf: &mut Vec<u8>) { /* ... */ }
fn transmit(buf: Vec<u8>) { /* consumes */ }

let mut packet = vec![0u8; 1500];
scramble(§1§ packet);       // mutate in place
let sum = checksum(§2§packet); // read-only pass
transmit(packet);              // hand it off for good`,
        blanks: [
          { opts: ["&[u8]", "Vec<u8>", "&mut Vec<u8>"], a: 0 },
          { opts: ["&mut", "&", "*"], a: 0 },
          { opts: ["&", "&mut", "*"], a: 0 },
        ],
        why: "checksum only reads, so it takes the weakest form — a shared slice (&[u8] also accepts &Vec via deref). scramble needs &mut; transmit takes ownership because the buffer's journey ends there.",
      },
    ],
    quiz: {
      id: "m04q",
      questions: [
        {
          q: "Why does the compiler reject holding a shared reference to a packet buffer while another task mutates it?",
          opts: [
            "References are slower than copies",
            "Shared + exclusive access at once is the definition of a data race; Rust makes it unrepresentable",
            "Buffers must always be heap-allocated first",
          ],
          a: 1,
          why: "Aliasing XOR mutation is the whole theorem. Readers can never observe a torn write, by construction.",
        },
        {
          q: "You're writing the reusable core library of your VPN client. Errors should be:",
          opts: [
            "anyhow::Result everywhere for convenience",
            "A concrete enum (e.g. with thiserror) so callers can match on variants and react differently",
            "Strings, logged and swallowed",
          ],
          a: 1,
          why: "Libraries expose typed errors so the app layer can distinguish 'handshake timeout' from 'permission denied'. anyhow belongs at the application edge.",
        },
        {
          q: "A hot per-packet function needs polymorphism over the sink type. Prefer:",
          opts: [
            "Box<dyn PacketSink> for flexibility",
            "Generics with a trait bound — monomorphized, no indirection in the hot path",
            "Function pointers",
          ],
          a: 1,
          why: "Static dispatch costs nothing at runtime. Save dyn for the architectural seams where runtime substitution is the point.",
        },
      ],
    },
  },

  /* ---------------- R03 ---------------- */
  {
    id: "m05",
    code: "R03",
    title: "Async Rust & Tokio: One Thread, Ten Thousand Sockets",
    layers: ["RS"],
    est: "~70 min",
    tag: "Futures, tasks, channels, select!, and cancellation — the concurrency toolkit a tunnel daemon runs on.",
    lessons: [
      {
        id: "m05l1",
        title: "Why async, and what a Future really is",
        est: "12 min",
        blocks: [
          {
            p: "A VPN daemon is the poster child for async: dozens of sockets and timers, each idle 99.9% of the time. Thread-per-socket wastes stacks and context switches; async multiplexes them all onto a few threads. The machinery: an `async fn` compiles into a state machine implementing `Future`. Calling it does nothing. A runtime (tokio) **polls** it; when it would block, it returns `Pending` after registering a wake-up with the OS (epoll/kqueue/IOCP), and the thread moves on to other work.",
          },
          {
            diagram: {
              kind: "state",
              title: "Life of a Future",
              states: [
                { id: "created", label: "created", x: 0, y: 0, tone: "dim" },
                { id: "polled", label: "polled", x: 1, y: 0, tone: "acc" },
                { id: "ready", label: "Ready(T)", x: 2, y: 0, tone: "ok" },
                { id: "pending", label: "Pending", x: 1, y: 1, tone: "l4" },
              ],
              edges: [
                { from: "created", to: "polled", label: "first poll" },
                { from: "polled", to: "ready", label: "done", tone: "ok" },
                { from: "polled", to: "pending", label: "would block", bend: 22 },
                { from: "pending", to: "polled", label: "waker fires", bend: 22 },
              ],
              caption:
                "Nothing runs until polled; a blocked task registers a waker and costs the thread nothing until the OS wakes it.",
            },
          },
          {
            code: {
              lang: "rust",
              body: `// This function does NOTHING until awaited.
async fn handshake(peer: SocketAddr) -> Result<Session, Error> {
    let sock = UdpSocket::bind("0.0.0.0:0").await?;
    sock.send_to(&initiation(), peer).await?;
    let resp = recv_with_timeout(&sock).await?;
    finalize(resp)
}`,
            },
          },
          {
            note: "Two laws of the runtime: never block a worker thread (no std::net, no heavy CPU loops — use `spawn_blocking` for those), and remember every `.await` is a possible pause point where your task's state must be self-contained.",
            label: "RUNTIME LAW",
          },
        ],
      },
      {
        id: "m05l2",
        title: "Tasks: spawning and the 'static bound",
        est: "12 min",
        blocks: [
          {
            p: "`tokio::spawn` hands a future to the runtime as an independent, cooperatively-scheduled task — the async analogue of a thread, at ~namespace-of-bytes cost. Because a spawned task may outlive the function that spawned it, its future must be `'static`: it cannot borrow from the spawner's stack. Hence the constant idiom: `move` closures plus cheap clones of shared handles.",
          },
          {
            code: {
              lang: "rust",
              body: `let sock = Arc::new(UdpSocket::bind("0.0.0.0:51820").await?);

// receive loop as an independent task
let rx_sock = Arc::clone(&sock);
let recv_task = tokio::spawn(async move {
    let mut buf = vec![0u8; 65535];
    loop {
        let (n, peer) = rx_sock.recv_from(&mut buf).await?;
        process(&buf[..n], peer).await;
    }
    #[allow(unreachable_code)]
    Ok::<(), std::io::Error>(())
});`,
            },
          },
          {
            p: "Shared state across tasks: `Arc<T>` for shared ownership; `Mutex` for mutation — and prefer `std::sync::Mutex` for short, non-await-holding critical sections, `tokio::sync::Mutex` only when you must hold a lock across an `.await`. Better than either: don't share, **send** — which is the next lesson.",
          },
        ],
      },
      {
        id: "m05l3",
        title: "Channels & the actor pattern",
        est: "12 min",
        blocks: [
          {
            p: "The cleanest concurrent architecture for an engine core: each subsystem is a task that owns its state outright and communicates by message. No locks, no deadlocks, ownership stays simple. tokio gives you `mpsc` (many producers, one consumer — the work queue), `oneshot` (single reply — perfect for request/response into an actor), `watch` (latest-value broadcast — **ideal for config snapshots**), and `broadcast` (fan-out events).",
          },
          {
            code: {
              lang: "rust",
              body: `enum Cmd {
    SendPacket(Vec<u8>),
    Rekey { reply: oneshot::Sender<Result<(), Error>> },
    Shutdown,
}

async fn engine_actor(mut rx: mpsc::Receiver<Cmd>, mut state: EngineState) {
    while let Some(cmd) = rx.recv().await {
        match cmd {
            Cmd::SendPacket(p) => state.encrypt_and_send(p).await,
            Cmd::Rekey { reply } => { let _ = reply.send(state.rekey().await); }
            Cmd::Shutdown => break,
        }
    }
} // state dropped here: clean teardown for free`,
            },
          },
          {
            note: "This is the skeleton of a TunnelEngine runtime: the trait object lives inside an actor, the rest of the system holds only a cheap `mpsc::Sender` handle. Backpressure comes free — a bounded channel makes fast producers wait.",
            label: "ARCHITECTURE SEED",
          },
        ],
      },
      {
        id: "m05l4",
        title: "select!, timeouts & graceful cancellation",
        est: "12 min",
        blocks: [
          {
            p: "`tokio::select!` races futures and runs the branch that finishes first — the essential tool for event loops that juggle socket I/O, timers, and shutdown signals at once. Pair it with `tokio::time::timeout` for deadlines and `CancellationToken` (tokio-util) for structured shutdown.",
          },
          {
            code: {
              lang: "rust",
              body: `loop {
    tokio::select! {
        // inbound ciphertext
        r = sock.recv_from(&mut buf) => handle_net(r?).await,
        // WireGuard timer tick: rekeys, keepalives (T03)
        _ = timer.tick() => engine.update_timers().await,
        // config snapshot changed (watch channel)
        _ = cfg_rx.changed() => engine.apply(cfg_rx.borrow().clone()),
        // shutdown requested
        _ = token.cancelled() => break,
    }
}`,
            },
          },
          {
            p: "The sharp edge: when `select!` picks a branch, the **other futures are dropped** — cancelled mid-flight. Rust futures are cancel-safe only if dropping them can't lose data or corrupt state. `recv_from` into your own buffer is cancel-safe; a multi-step read that has already consumed half a message is not. Check cancel-safety notes in tokio's docs the way you'd check unsafe blocks.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "m05e1",
        type: "blank",
        title: "Wire up the pump task",
        kind: "CODE LAB",
        prompt:
          "Complete this receive-pump so datagrams flow from the socket into the engine's channel.",
        code: `async fn pump(sock: Arc<UdpSocket>, tx: mpsc::Sender<Vec<u8>>) {
    let mut buf = vec![0u8; 65535];
    loop {
        let Ok((n, _peer)) = sock.recv_from(&mut buf)§0§ else { break };
        if tx.send(buf[..n].to_vec())§1§.is_err() {
            break; // engine actor is gone — shut down
        }
    }
}

// in main(), run it concurrently:
§2§(pump(sock, tx));`,
        blanks: [
          { opts: [".await", ".unwrap()", ".poll()"], a: 0 },
          { opts: [".await", ".now()", ".blocking()"], a: 0 },
          { opts: ["tokio::spawn", "std::thread::spawn", "pump.call"], a: 0 },
        ],
        why: "Both socket recv and channel send are async — they yield at .await instead of blocking the worker. tokio::spawn detaches the loop as its own task; a std thread would need a whole separate runtime handle.",
      },
    ],
    quiz: {
      id: "m05q",
      questions: [
        {
          q: "Inside an async task you call std::net::UdpSocket::recv_from (the blocking one). What goes wrong?",
          opts: [
            "Nothing — tokio detects and adapts",
            "It blocks an entire runtime worker thread, starving every other task scheduled on it",
            "It panics immediately",
          ],
          a: 1,
          why: "Blocking calls freeze the worker; with few workers, a handful of these can stall the whole daemon. Use tokio's sockets, or spawn_blocking.",
        },
        {
          q: "Config updates must reach many long-lived tasks, and late subscribers only care about the latest snapshot. Best channel?",
          opts: ["mpsc", "oneshot", "watch"],
          a: 2,
          why: "watch stores exactly the most recent value and wakes receivers on change — the canonical carrier for versioned config snapshots from a ConfigSource.",
        },
        {
          q: "A select! branch loses the race and its future is dropped halfway through reading a length-prefixed frame from a TCP stream. The risk is:",
          opts: [
            "None — futures are always cancel-safe",
            "Partial-read state is lost; the stream is now desynchronized (not cancel-safe)",
            "The TCP connection is automatically reset",
          ],
          a: 1,
          why: "Cancellation is just Drop. Multi-step reads must either be cancel-safe by design or owned by a dedicated task that select! never cancels.",
        },
      ],
    },
  },

  /* ---------------- R05 (renumbered when R04 Futures-by-Hand landed) ---------------- */
  {
    id: "m06",
    code: "R05",
    title: "Network Programming in Rust, for Real",
    layers: ["L4", "RS"],
    est: "~65 min",
    tag: "Sockets in practice: buffers, framing, zero-copy Bytes, socket2 escape hatches, and typed config with serde.",
    lessons: [
      {
        id: "m06l1",
        title: "std::net vs tokio::net — and buffer discipline",
        est: "12 min",
        blocks: [
          {
            p: "`std::net` is blocking and perfect for tiny tools and tests. `tokio::net` mirrors the same types asynchronously and is what your daemon uses. The APIs rhyme deliberately — same bind/connect/recv_from shapes — so the real skill is buffer discipline: allocate once, reuse forever. Per-packet `Vec` allocation is the most common self-inflicted perf wound in tunnel code.",
          },
          {
            code: {
              lang: "rust",
              body: `// One buffer, reused across the loop's lifetime.
let mut buf = vec![0u8; 65535];
loop {
    let (n, peer) = sock.recv_from(&mut buf).await?;
    // hand off only what's needed; copy the slice
    // (or use Bytes — next lessons — to avoid even that)
    engine.ingest(&buf[..n], peer);
}`,
            },
          },
          {
            p: "Size UDP receive buffers at 65535 (the datagram maximum) unless you enforce a smaller protocol MTU. Undersized buffers do not error politely — the kernel truncates the datagram and the tail is simply gone.",
          },
        ],
      },
      {
        id: "m06l2",
        title: "Framing: where streams become messages",
        est: "12 min",
        blocks: [
          {
            p: "UDP gives you message boundaries for free. TCP does not — it is a featureless byte river, and 'one write' does **not** mean 'one read'. Any protocol over TCP needs **framing**: a rule for where messages start and end. Length-prefixing is the workhorse: 4 bytes of big-endian length, then that many bytes of payload.",
          },
          {
            diagram: {
              kind: "packet",
              title: "Length-prefixed frames in the byte river",
              segs: [
                {
                  label: "frame 1",
                  tone: "l4",
                  inner: [
                    { label: "len", sub: "4 B, BE", tone: "acc" },
                    { label: "payload", sub: "len bytes" },
                  ],
                },
                {
                  label: "frame 2",
                  tone: "l4",
                  inner: [
                    { label: "len", sub: "4 B, BE", tone: "acc" },
                    { label: "payload", sub: "len bytes" },
                  ],
                },
              ],
              caption:
                "TCP hands you one continuous stream — the prefix is the only thing that says where a message ends and the next begins.",
            },
          },
          {
            code: {
              lang: "rust",
              body: `use tokio::io::AsyncReadExt;

async fn read_frame(s: &mut TcpStream, max: u32) -> io::Result<Vec<u8>> {
    let mut len_bytes = [0u8; 4];
    s.read_exact(&mut len_bytes).await?;        // never partial
    let len = u32::from_be_bytes(len_bytes);
    if len > max {                               // hostile input guard
        return Err(io::Error::new(io::ErrorKind::InvalidData, "frame too large"));
    }
    let mut payload = vec![0u8; len as usize];
    s.read_exact(&mut payload).await?;
    Ok(payload)
}`,
            },
          },
          {
            note: "That max check is not optional. A 4 GB length prefix from a malicious peer is a one-packet denial of service against naive code. Parsers face the internet; write them like it.",
            label: "SECURITY RULE",
          },
        ],
      },
      {
        id: "m06l3",
        title: "Zero-copy pipelines with Bytes",
        est: "12 min",
        blocks: [
          {
            p: "The `bytes` crate's `Bytes` type is a reference-counted, immutable byte buffer whose `clone()` and `slice()` are O(1) — they create views, not copies. In a pipeline where one received datagram must visit the parser, the router, and the telemetry task, `Bytes` lets all three hold the same allocation. Crucially, it is `'static` and `Send`, so it flows through channels and across `.await` points without lifetime gymnastics (the escape hatch promised in R01).",
          },
          {
            code: {
              lang: "rust",
              body: `use bytes::{Bytes, BytesMut};

let mut buf = BytesMut::with_capacity(65535);
buf.resize(65535, 0);
let n = sock.recv(&mut buf[..]).await?;
buf.truncate(n);
let pkt: Bytes = buf.freeze();      // immutable, shareable

router_tx.send(pkt.clone()).await?; // O(1) — refcount bump
telemetry_tx.send(pkt).await?;      // same bytes, zero copies`,
            },
          },
        ],
      },
      {
        id: "m06l4",
        title: "socket2: the platform escape hatch",
        est: "12 min",
        blocks: [
          {
            p: "std and tokio expose the portable 90% of socket behavior. The last 10% — the part VPN clients live in — needs raw socket options, and `socket2` is the idiomatic bridge: build and configure a socket at full fidelity, then convert it into a tokio socket.",
          },
          {
            ul: [
              "`SO_REUSEADDR` — rebind fast after restart; essential for daemons.",
              "`SO_BINDTODEVICE` (Linux) — pin the underlay socket to the physical interface so tunnel traffic can't loop into the tunnel; the socket-level twin of the /32 route pin from N01.",
              "`SO_MARK` (Linux) — mark tunnel packets so routing rules and nftables can special-case them; how wg-quick's `FwMark` works.",
              "`IP_MTU_DISCOVER` / DF bit — control fragmentation behavior for your MTU probing.",
              "Buffer sizes (`SO_RCVBUF`) — kernel-side headroom for bursty tunnel traffic.",
            ],
          },
          {
            code: {
              lang: "rust",
              body: `use socket2::{Domain, Protocol, Socket, Type};

let raw = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))?;
raw.set_reuse_address(true)?;
raw.set_nonblocking(true)?;               // required before handing to tokio
raw.bind(&"0.0.0.0:51820".parse::<SocketAddr>()?.into())?;
let sock = tokio::net::UdpSocket::from_std(raw.into())?;`,
            },
          },
        ],
      },
      {
        id: "m06l5",
        title: "Typed config with serde",
        est: "10 min",
        blocks: [
          {
            p: "Config is untrusted input from your most dangerous user: future-you. Parse it into strong types at the boundary, reject unknown fields, and let the type system carry the invariants inward — the same philosophy as newtypes in R01, and the foundation of the ConfigSource anti-corruption layer in S02.",
          },
          {
            code: {
              lang: "rust",
              body: `use serde::Deserialize;
use std::net::SocketAddr;

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct PeerConfig {
    public_key: String,               // validated -> PublicKey after parse
    endpoint: Option<SocketAddr>,     // parsed, not a String!
    allowed_ips: Vec<String>,         // -> Vec<IpNet> in the domain type
    #[serde(default)]
    keepalive_secs: Option<u16>,
}

let cfg: PeerConfig = toml::from_str(raw)?;`,
            },
          },
          {
            p: "`deny_unknown_fields` turns typos into load-time errors instead of silently-ignored settings. And note the two-stage pattern: a serde-shaped struct at the edge, converted via `TryFrom` into a stricter domain struct. Wire format and domain model are different things; keeping them separate is what lets either evolve.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "m06e1",
        type: "blank",
        title: "Harden the frame reader",
        kind: "CODE LAB",
        prompt:
          "Fill the blanks to make this TCP frame reader both correct and hostile-input-safe.",
        code: `async fn read_frame(s: &mut TcpStream) -> io::Result<Vec<u8>> {
    let mut len_bytes = [0u8; 4];
    s.§0§(&mut len_bytes).await?;
    let len = u32::§1§(len_bytes);
    if len > 1_048_576 {
        return Err(io::Error::new(ErrorKind::InvalidData, "too large"));
    }
    let mut payload = vec![0u8; len as usize];
    s.§0§(&mut payload).await?;
    Ok(payload)
}`,
        blanks: [
          { opts: ["read_exact", "read", "peek"], a: 0 },
          { opts: ["from_be_bytes", "from_ne_bytes", "from_str"], a: 0 },
        ],
        why: "read() may return fewer bytes than asked — read_exact loops until the buffer is full or errors. Network byte order is big-endian, so from_be_bytes; native-endian would break between architectures.",
      },
    ],
    quiz: {
      id: "m06q",
      questions: [
        {
          q: "Your TCP-based control channel occasionally 'merges' two messages into one read. The bug is:",
          opts: [
            "A kernel buffer overflow",
            "Missing framing — TCP is a byte stream with no message boundaries, so reads and writes don't correspond",
            "Nagle's algorithm corrupting data",
          ],
          a: 1,
          why: "Nothing is corrupted; your assumption was. Add length-prefix framing (or a codec) and the 'merging' disappears.",
        },
        {
          q: "One received datagram must be seen by the router task and the metrics task. The zero-copy idiom is:",
          opts: [
            "Clone the Vec<u8> for each task",
            "Freeze it into Bytes and clone the handle — O(1) refcounted views",
            "Wrap the Vec in Mutex and share a reference",
          ],
          a: 1,
          why: "Bytes::clone bumps a refcount. It's also 'static + Send, so it crosses channels and awaits freely.",
        },
        {
          q: "Why does a VPN client bind its underlay UDP socket to the physical interface (SO_BINDTODEVICE or equivalent)?",
          opts: [
            "It improves encryption strength",
            "So the tunnel's own encrypted packets can never be routed back into the tunnel once the default route points at it",
            "It is required to receive broadcast packets",
          ],
          a: 1,
          why: "Belt to go with the /32-route suspenders: the loop-prevention problem from N01, solved at the socket layer.",
        },
      ],
    },
  },
  {
    id: "m07",
    code: "T01",
    title: "TUN/TAP & Packet I/O",
    tag: "Where userspace touches raw packets",
    layers: ["L2", "L3", "RS"],
    est: "~70 min",
    lessons: [
      {
        id: "m07l1",
        title: "TUN vs TAP",
        est: "~10 min",
        blocks: [
          {
            p: "A **TUN device** is a virtual network interface whose other end is a file descriptor in your process. The kernel routes IP packets to it like any interface; instead of hitting a wire, the bytes appear in your `read()`. Write bytes back and the kernel treats them as packets that just arrived. It operates at **L3**: you see raw IP packets, no Ethernet headers.",
          },
          {
            p: "A **TAP device** is the same idea at **L2**: full Ethernet frames, MAC addresses and all. TAPs matter for bridging VMs and simulating LANs. VPN clients almost always want TUN — you are routing IP, and carrying 14 extra bytes of fake Ethernet per packet buys nothing.",
          },
          {
            note: "The entire trick of a VPN client is: get the OS to route interesting traffic to your TUN, read the packets, encrypt them, and send them out a normal UDP socket bound to the real interface. Everything else is bookkeeping.",
            label: "the one-sentence VPN",
          },
          {
            diagram: {
              kind: "flow",
              title: "The one-sentence VPN, drawn",
              nodes: [
                { label: "app", sub: "socket write", tone: "l7" },
                { label: "kernel", sub: "routes to tun0", tone: "l3" },
                { label: "TUN fd", sub: "read()", tone: "acc" },
                { label: "engine", sub: "encrypt", tone: "acc" },
                { label: "UDP", sub: "real NIC", tone: "l4" },
              ],
              arrows: ["route", "plaintext", "wrap", "ciphertext"],
              caption:
                "Read, encrypt, send — inbound runs the same pump in reverse, and the UDP socket stays pinned to the physical interface.",
            },
          },
          {
            p: "Because the TUN fd is just a file descriptor, it plugs straight into your async runtime: wrap it in `AsyncFd` or use a crate that already did, and `select!` over TUN reads, socket reads, and config updates in one loop.",
          },
        ],
      },
      {
        id: "m07l2",
        title: "Creating a TUN on each OS",
        est: "~10 min",
        blocks: [
          {
            p: "**Linux:** open `/dev/net/tun`, issue a `TUNSETIFF` ioctl with `IFF_TUN | IFF_NO_PI`, and you have an interface. Configure address and routes via netlink (`rtnetlink` crate) or `ip` commands. Root or `CAP_NET_ADMIN` required.",
          },
          {
            p: "**macOS:** there is no /dev/net/tun. You open a **control socket** to the `com.apple.net.utun_control` kernel provider and connect; the kernel hands you `utunN`. Quirk: every packet is prefixed with a 4-byte protocol family header (AF_INET / AF_INET6) you must strip on read and add on write.",
          },
          {
            p: "**Windows:** historically the tap-windows NDIS driver; modern clients use **wintun**, WireGuard's purpose-built driver. You don't get an fd — you get a pair of **ring buffers** shared with the driver and an event handle to wait on. Much faster, but a genuinely different I/O model.",
          },
          {
            p: "**Mobile:** you don't create the device at all. iOS `NEPacketTunnelProvider` and Android `VpnService` hand your code an already-configured fd (or packet flow object). Your Rust core should therefore accept *an already-open device* as an input, not insist on creating one — this single design choice is most of what makes a core portable.",
          },
          {
            code: {
              lang: "rust",
              title: "tun device, portably (tun-rs style)",
              body: "let mut cfg = tun::Configuration::default();\ncfg.address((10, 8, 0, 2))\n   .netmask((255, 255, 255, 0))\n   .mtu(1420)\n   .up();\n\nlet dev = tun::create_as_async(&cfg)?;   // Linux/macOS/Windows behind one API\nlet mut buf = vec![0u8; 1500];\nlet n = dev.recv(&mut buf).await?;        // one raw IP packet\nprocess_packet(&buf[..n]);",
            },
          },
          {
            ul: [
              "`tun` / `tun-rs` — cross-platform device creation + async wrappers.",
              "`wintun` — direct bindings to the Windows ring-buffer driver.",
              "`rtnetlink` — programmatic Linux route/address management.",
            ],
          },
        ],
      },
      {
        id: "m07l3",
        title: "The packet loop",
        est: "~10 min",
        blocks: [
          {
            p: "Every tunnel client converges on the same two pumps. **Outbound:** read plaintext IP packet from TUN → decide which tunnel/peer owns it → encrypt → send ciphertext via UDP socket. **Inbound:** receive ciphertext from UDP → decrypt → validate → write plaintext into TUN.",
          },
          {
            code: {
              lang: "rust",
              title: "the eternal loop",
              body: "loop {\n    tokio::select! {\n        Ok(n) = tun.recv(&mut tbuf) => {\n            let pkt = &tbuf[..n];\n            let peer = router.route(dst_ip(pkt))?;   // cryptokey routing\n            let ct = peer.encrypt(pkt)?;\n            udp.send_to(&ct, peer.endpoint).await?;\n        }\n        Ok((n, from)) = udp.recv_from(&mut ubuf) => {\n            let pt = session.decrypt(&ubuf[..n], from)?;\n            tun.send(&pt).await?;\n        }\n        _ = timers.tick() => session.update_timers(),\n        Some(cfg) = cfg_rx.recv() => router.apply(cfg),\n    }\n}",
            },
          },
          {
            p: "Performance notes that matter in practice: reuse buffers (R04), keep the hot path allocation-free, and consider batching — Linux `recvmmsg`/`sendmmsg` move many packets per syscall, and wintun's rings batch naturally. But get it *correct* single-packet first; profile before batching.",
          },
          {
            note: "The `select!` loop is also your integration point for everything from R03: config watch channels, cancellation tokens, and timer ticks all become just more arms.",
            label: "it all connects",
          },
        ],
      },
      {
        id: "m07l4",
        title: "smoltcp: a TCP/IP stack in your process",
        est: "~10 min",
        blocks: [
          {
            p: "Sometimes you have the opposite problem: you hold raw IP packets but need to speak TCP *to* them, with no kernel to help. Example: your client accepts SOCKS5 connections (streams) but the tunnel carries raw packets — someone must fabricate valid TCP segments. That someone is a **userspace network stack**.",
          },
          {
            p: "`smoltcp` is the Rust answer: a `no_std`-capable TCP/IP stack designed for embedded, perfect for tunnels. You feed it raw packets via a `Device` trait; it maintains socket state machines and hands you byte streams — the kernel's job, in a library.",
          },
          {
            p: "This is exactly how stream-based engines carry packet-based traffic and vice versa. In your architecture terms: smoltcp is an adapter between the **Packet** and **Stream** carriages. Tailscale's userspace-networking mode (gVisor's netstack, same concept in Go) proves this pattern at scale.",
          },
          {
            code: {
              lang: "rust",
              title: "smoltcp in one glance",
              body: "let mut iface = Interface::new(config, &mut device, Instant::now());\nlet mut sockets = SocketSet::new(vec![]);\nlet tcp = tcp::Socket::new(rx_buf, tx_buf);\nlet handle = sockets.add(tcp);\n\nloop {\n    iface.poll(Instant::now(), &mut device, &mut sockets);\n    let sock = sockets.get_mut::<tcp::Socket>(handle);\n    if sock.can_recv() { sock.recv(|data| { consume(data); (data.len(), ()) })?; }\n}",
            },
          },
        ],
      },
    ],
    exercises: [
      {
        id: "m07e1",
        kind: "ORDER LAB",
        title: "Life of an outbound packet",
        type: "order",
        prompt: "A browser packet is about to leave through your VPN. Put the journey in order.",
        items: [
          "App writes to a socket; kernel routes the packet to the tun interface",
          "Your process reads the raw IP packet from the tun fd",
          "Router/dispatch decides which tunnel owns this flow",
          "Engine encrypts and encapsulates the packet",
          "UDP socket sends ciphertext to the peer endpoint",
        ],
        why: "Read, route, wrap, send — the eternal outbound pump. Inbound runs it in reverse.",
      },
    ],
    quiz: {
      id: "m07q",
      questions: [
        {
          q: "Why do VPN clients use TUN rather than TAP?",
          opts: [
            "TAP is deprecated on modern kernels",
            "They route at L3, so raw IP packets are exactly what they need — Ethernet framing is dead weight",
            "TUN devices are faster because they are compiled into the kernel",
          ],
          a: 1,
          why: "TAP earns its 14 bytes/frame only when you genuinely need L2 (bridging, VMs).",
        },
        {
          q: "What is the macOS utun quirk your read/write path must handle?",
          opts: [
            "Packets are big-endian only",
            "A 4-byte protocol-family header prefixes every packet",
            "Reads must be exactly MTU-sized",
          ],
          a: 1,
          why: "Strip AF_INET/AF_INET6 on read, prepend on write — forget it and every packet is garbage.",
        },
        {
          q: "Why should your Rust core accept an already-open TUN device instead of always creating one?",
          opts: [
            "Creating devices is slow",
            "iOS and Android never let you create the device — the OS hands your code a pre-configured fd",
            "It avoids needing the tun crate",
          ],
          a: 1,
          why: "NEPacketTunnelProvider and VpnService own device creation. Cores that insist on creating devices are cores that only ship on desktop.",
        },
      ],
    },
  },
  {
    id: "m08",
    code: "T02",
    title: "Crypto for Tunnels",
    tag: "Noise, WireGuard's handshake, and key lifetimes",
    layers: ["L7", "RS"],
    est: "~65 min",
    lessons: [
      {
        id: "m08l1",
        title: "The toolbox",
        est: "~10 min",
        blocks: [
          {
            p: "Modern tunnel crypto is a small, opinionated kit. **X25519**: Diffie–Hellman over Curve25519 — two parties each combine their private key with the other's public key and arrive at the same shared secret. **ChaCha20-Poly1305**: an AEAD cipher — encrypts *and* authenticates, so tampering is detected, fast even without AES hardware. **BLAKE2s**: hashing. **HKDF**: stretches shared secrets into the multiple independent keys a session needs.",
          },
          {
            p: "**AEAD** deserves emphasis: Authenticated Encryption with Associated Data. You never encrypt without authenticating — an attacker who can flip ciphertext bits without detection can often decrypt everything eventually. Poly1305 is the tamper seal.",
          },
          {
            note: "AEAD nonces must NEVER repeat under the same key. Encrypt two messages with one (key, nonce) pair and ChaCha20-Poly1305 loses both confidentiality and integrity. WireGuard's fix is elegant: the message counter IS the nonce — replay protection and nonce uniqueness from one integer.",
            label: "the cardinal sin",
          },
          {
            p: "You will never implement these primitives. You will *compose* them — via `boringtun`, or the RustCrypto crates (`chacha20poly1305`, `x25519-dalek`, `blake2`) if building something custom. The skill is knowing what each piece guarantees and what it assumes.",
          },
        ],
      },
      {
        id: "m08l2",
        title: "Noise: handshakes from a pattern language",
        est: "~10 min",
        blocks: [
          {
            p: "The **Noise Protocol Framework** is a grammar for building handshakes from DH operations. A pattern like `IK` is a recipe stating exactly which keys are exchanged, in what order, and what security properties fall out. Analyze the pattern once, formally; every protocol built on it inherits the proof.",
          },
          {
            p: "WireGuard uses **Noise_IK**: **I** — the initiator sends their static (long-term) identity key in the first message, encrypted; **K** — the responder's static key is *known* to the initiator beforehand (it's in your config). That prior knowledge is why WireGuard completes in **one round trip**.",
          },
          {
            p: "The tradeoff profile: 1-RTT handshakes, **forward secrecy** (ephemeral keys mean today's session keys don't fall if the static key leaks tomorrow), and **initiator identity hiding** (the client's public key travels encrypted — a passive observer can't tell *who* is connecting, though the server obviously learns it).",
          },
          {
            ul: [
              "Compare TLS: certificate chains, negotiation, multiple round trips, enormous state machine.",
              "Noise_IK: fixed algorithms, no negotiation, no certificates — keys are exchanged out of band (your config file *is* the PKI).",
              "No negotiation = no downgrade attacks = tiny attack surface. This is a design philosophy, not an accident.",
            ],
          },
        ],
      },
      {
        id: "m08l3",
        title: "The WireGuard handshake, message by message",
        est: "~10 min",
        blocks: [
          {
            p: "**Message 1 — Handshake Initiation.** Initiator generates a fresh ephemeral keypair, performs DH combinations of (ephemeral, static) × (responder static), and sends: ephemeral public key, encrypted static identity, encrypted timestamp. The timestamp defeats replaying old initiations.",
          },
          {
            p: "**Message 2 — Handshake Response.** Responder does the mirror DH math, contributes its own ephemeral key, and confirms. After this single round trip, both sides run the accumulated secrets through **HKDF** to derive two directional transport keys: yours-to-mine and mine-to-yours.",
          },
          {
            p: "**Message 3 — first transport packet.** The initiator's first encrypted data packet doubles as handshake confirmation. If there's no data to send, a keepalive serves. Total cost to an encrypted tunnel: one round trip.",
          },
          {
            diagram: {
              kind: "seq",
              title: "Noise_IK in three messages",
              actors: [
                { id: "i", label: "initiator", sub: "knows server pubkey", tone: "acc" },
                { id: "r", label: "responder", tone: "acc2" },
              ],
              steps: [
                { from: "i", to: "r", label: "1 initiation", sub: "eph pub + enc static + ts" },
                { from: "r", to: "i", label: "2 response", sub: "eph pub + confirm" },
                { note: "HKDF → two directional transport keys", tone: "acc" },
                {
                  from: "i",
                  to: "r",
                  label: "3 transport",
                  sub: "counter 0 — confirms",
                  tone: "ok",
                },
              ],
              caption:
                "One round trip to keys because the responder's identity is known in advance — the K in IK.",
            },
          },
          {
            p: "**DoS armor:** handshake initiations cost the responder CPU (DH is not free). Under load, a responder can reply with a **cookie** — a lightweight MAC over the sender's source IP — and require it be echoed before doing real work. Spoofed-source floods die cheaply; honest initiators retry with the cookie.",
          },
          {
            note: "This 3-step dance is exactly what the animated strip on this app's home screen depicts: initiation → response → transport.",
            label: "you have seen this",
          },
        ],
      },
      {
        id: "m08l4",
        title: "Sessions age fast on purpose",
        est: "~10 min",
        blocks: [
          {
            p: "Transport keys are deliberately short-lived: rekey after **120 seconds** or 2⁶⁰ messages, whichever comes first. A new handshake runs *alongside* the old session and traffic cuts over seamlessly — the user never sees it. Frequent rekeying bounds how much traffic any single compromised key can expose.",
          },
          {
            p: "**Replay protection:** each transport packet carries its counter (which is also its nonce). The receiver keeps a **sliding window** — packets older than the window or already seen are dropped. Out-of-order delivery within the window is tolerated, because UDP.",
          },
          {
            p: "**Silence discipline:** a WireGuard peer sends *nothing* — not even handshake responses — to packets that don't authenticate. To an unauthorized scanner, the port looks closed. This is why WireGuard is invisible to port scans, and why your monitoring must not assume ICMP-style liveness.",
          },
          {
            code: {
              lang: "rust",
              title: "the timer constants that run the world",
              body: "const REKEY_AFTER_TIME: u64 = 120;       // start new handshake\nconst REJECT_AFTER_TIME: u64 = 180;      // hard cutoff for old keys\nconst REKEY_TIMEOUT: u64 = 5;            // retry unanswered initiation\nconst KEEPALIVE_TIMEOUT: u64 = 10;       // passive keepalive\nconst REKEY_AFTER_MESSAGES: u64 = 1 << 60;",
            },
          },
        ],
      },
    ],
    exercises: [
      {
        id: "m08e1",
        kind: "ORDER LAB",
        title: "Handshake to first byte",
        type: "order",
        prompt: "Order the steps from cold start to flowing data.",
        items: [
          "Initiator derives ephemeral key and sends Handshake Initiation",
          "Responder validates, derives keys, sends Handshake Response",
          "Both sides compute transport keys (HKDF chain)",
          "Initiator sends first encrypted transport message (confirms handshake)",
          "Counters increment as data flows; rekey scheduled at 120 s",
        ],
        why: "One round trip to keys, and the first data packet doubles as confirmation. Everything after is counters and clocks.",
      },
    ],
    quiz: {
      id: "m08q",
      questions: [
        {
          q: "Why can WireGuard complete its handshake in one round trip?",
          opts: [
            "It skips authentication on the first message",
            "Noise_IK: the initiator already knows the responder's static public key from config",
            "It reuses keys from the previous session",
          ],
          a: 1,
          why: "The K in IK. Pre-shared knowledge of the responder's identity removes a whole round trip of discovery.",
        },
        {
          q: "What makes nonce reuse catastrophic with ChaCha20-Poly1305?",
          opts: [
            "It slows down encryption",
            "Same (key, nonce) on two messages breaks both confidentiality and authenticity",
            "It causes packet loss",
          ],
          a: 1,
          why: "Which is why WireGuard makes the message counter the nonce — uniqueness is structural, not hoped-for.",
        },
        {
          q: "A port scanner probes a WireGuard endpoint. What does it see?",
          opts: [
            "An ICMP port-unreachable reply",
            "Nothing — unauthenticated packets get no response at all",
            "A TCP RST",
          ],
          a: 1,
          why: "Silence discipline: if the MAC doesn't verify, the packet never existed. The service is invisible without the right key.",
        },
      ],
    },
  },
  {
    id: "m09",
    code: "T03",
    title: "WireGuard in Practice",
    tag: "Cryptokey routing, config anatomy, and boringtun",
    layers: ["L3", "L7", "RS"],
    est: "~65 min",
    lessons: [
      {
        id: "m09l1",
        title: "Cryptokey routing: the big idea",
        est: "~10 min",
        blocks: [
          {
            p: "WireGuard's central data structure maps **public keys ⇄ allowed IP ranges**. Outbound: look up the packet's destination IP in the peers' `AllowedIPs`; the matching peer's key encrypts it. Inbound: after decryption succeeds under some peer's key, the inner source IP must fall within *that peer's* `AllowedIPs` — otherwise the packet is dropped.",
          },
          {
            p: "Read that twice, because it fuses **routing and identity**. A packet claiming to be from 10.0.0.3 is only accepted if it decrypted under the key *assigned* 10.0.0.3. IP spoofing inside the tunnel is structurally impossible — there is no separate ACL to misconfigure.",
          },
          {
            diagram: {
              kind: "stack",
              title: "One table, two jobs",
              cols: [
                {
                  title: "outbound = routing",
                  cells: [
                    { label: "dst 10.0.0.3", sub: "plaintext from TUN", tone: "l3" },
                    { label: "AllowedIPs match", sub: "10.0.0.0/24 → peer B", tone: "acc" },
                    { label: "encrypt", sub: "peer B's key", tone: "ok" },
                  ],
                },
                {
                  title: "inbound = identity",
                  cells: [
                    { label: "decrypts OK", sub: "under peer B's key", tone: "ok" },
                    { label: "src in AllowedIPs?", sub: "10.0.0.3 ∈ 10.0.0.0/24", tone: "acc" },
                    { label: "accept or drop", sub: "no separate ACL", tone: "l3" },
                  ],
                },
              ],
              gapLabel: "same table",
              caption:
                "Decrypting under a key and claiming an address are one check — the peer assigned an IP is the only one believed to be it.",
            },
          },
          {
            p: "`AllowedIPs = 0.0.0.0/0` therefore means two things at once: route *everything* out through this peer, and accept *any* inner source from it. That's a full-tunnel default gateway. `AllowedIPs = 10.0.0.0/24` is a split tunnel: only that subnet goes in, only that subnet is believed coming out.",
          },
          {
            note: "Longest-prefix match applies across peers, exactly like a routing table (N01). One peer with 0.0.0.0/0 and another with 10.0.0.0/24 coexist fine: the /24 wins for its range.",
            label: "N01 pays off",
          },
        ],
      },
      {
        id: "m09l2",
        title: "Config anatomy",
        est: "~10 min",
        blocks: [
          {
            code: {
              lang: "sh",
              title: "wg0.conf, annotated",
              body: "[Interface]\nPrivateKey = <base64 X25519 private key>   # your identity\nAddress    = 10.8.0.2/24                    # inner (tunnel) IP\nDNS        = 10.8.0.1                       # resolver while up (N11!)\nListenPort = 51820                          # omit for random\n\n[Peer]\nPublicKey  = <server public key>            # the K in Noise_IK\nEndpoint   = vpn.example.com:51820          # underlay address\nAllowedIPs = 0.0.0.0/0, ::/0                # full tunnel\nPersistentKeepalive = 25                    # NAT survival (N11!)",
            },
          },
          {
            p: "Notice what is **absent**: no cipher suites, no negotiation options, no certificate paths, no version pins. WireGuard's refusal to negotiate means a config is four or five meaningful lines. Every line above connects to a module you've done: DNS leaks (N11), keepalive=25 (N11's NAT timeouts), AllowedIPs (N01's prefixes).",
          },
          {
            p: "In *your* client, this file format is just one `ConfigSource` among several — a broker API, an MDM push, a QR code. Parse it at the boundary into your own validated domain types (R04's two-stage pattern) and never let the wg-quick format leak into core logic.",
          },
        ],
      },
      {
        id: "m09l3",
        title: "boringtun: WireGuard as a library",
        est: "~10 min",
        blocks: [
          {
            p: "`boringtun` (Cloudflare) implements the entire WireGuard *protocol* — Noise handshake, timers, replay windows — as a pure Rust library with **no I/O**. It transforms buffers. You own the sockets, the TUN, the event loop. This 'sans-I/O' design is exactly why it embeds cleanly into a custom client like yours.",
          },
          {
            p: "The core type is `Tunn`, one per peer. Two directions: `encapsulate(plaintext) → TunnResult` and `decapsulate(ciphertext) → TunnResult`. The result tells you what to *do*: write these bytes to the network, write these to the TUN, or nothing.",
          },
          {
            code: {
              lang: "rust",
              title: "the TunnResult contract",
              body: "match tunn.decapsulate(None, &ciphertext, &mut buf) {\n    TunnResult::WriteToTunnelV4(pkt, _src) => tun.send(pkt).await?,\n    TunnResult::WriteToNetwork(resp) => {\n        // handshake reply or queued packet — send it, then drain:\n        udp.send_to(resp, endpoint).await?;\n        while let TunnResult::WriteToNetwork(more) =\n            tunn.decapsulate(None, &[], &mut buf) {\n            udp.send_to(more, endpoint).await?;\n        }\n    }\n    TunnResult::Done => {}\n    TunnResult::Err(e) => log_drop(e),\n    _ => {}\n}",
            },
          },
          {
            note: "The drain loop is the classic boringtun gotcha: after a handshake completes, queued packets are released one call at a time. Call decapsulate with an empty datagram until it stops returning WriteToNetwork, or your first packets after every handshake silently stall.",
            label: "gotcha",
          },
        ],
      },
      {
        id: "m09l4",
        title: "Driving the timers",
        est: "~10 min",
        blocks: [
          {
            p: "WireGuard's liveness is a **state machine driven by time**: rekey at 120 s, retry handshakes at 5 s, passive keepalives at 10 s, persistent keepalives if configured. boringtun does not own a clock — *you* must call `update_timers()` regularly (every ~100–250 ms) and dispatch whatever it returns.",
          },
          {
            p: "`update_timers` returns a `TunnResult` too: often `WriteToNetwork` containing a handshake initiation or keepalive that must go out *now*. Skip the calls and sessions silently expire; the tunnel 'works' for two minutes then dies — the signature bug of every hand-rolled boringtun integration.",
          },
          {
            code: {
              lang: "rust",
              title: "the timer arm of your select! loop",
              body: "let mut tick = tokio::time::interval(Duration::from_millis(250));\nloop {\n    tokio::select! {\n        _ = tick.tick() => {\n            for peer in peers.iter_mut() {\n                match peer.tunn.update_timers(&mut buf) {\n                    TunnResult::WriteToNetwork(pkt) =>\n                        udp.send_to(pkt, peer.endpoint).await?,\n                    _ => {}\n                }\n            }\n        }\n        // ... tun + udp arms from T01 ...\n    }\n}",
            },
          },
          {
            p: "Endpoint **roaming** falls out of the same design: WireGuard identifies peers by key, not address, so when a valid packet arrives from a new source address (phone hops Wi-Fi → LTE), you simply update that peer's endpoint to the new address. Connections survive network changes without renegotiation.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "m09e1",
        kind: "CODE LAB",
        title: "Complete the boringtun loop",
        type: "blank",
        prompt: "Fill in the two blanks in this timer-driving code.",
        code: 'match peer.tunn.update_timers(&mut buf) {\n    TunnResult::WriteToNetwork(pkt) => {\n        udp.send_to(pkt, peer.endpoint).await?;\n    }\n    TunnResult::§0§ => { /* nothing to do this tick */ }\n    TunnResult::Err(e) => tracing::warn!(?e, "timer error"),\n    _ => {}\n}\n// called every ~250ms so §1§ can emit rekeys and keepalives',
        blanks: [
          { opts: ["Done", "Err", "Sleep"], a: 0 },
          { opts: ["update_timers", "tick", "poll_rekey"], a: 0 },
        ],
        why: "Done means idle — no traffic needed this tick. And update_timers is the heartbeat: without regular calls, rekeys never fire and the tunnel dies at 180 s.",
      },
    ],
    quiz: {
      id: "m09q",
      questions: [
        {
          q: "A packet decrypts successfully under peer X's key, but its inner source IP is not in X's AllowedIPs. What happens?",
          opts: [
            "It is forwarded anyway since decryption proves authenticity",
            "It is dropped — cryptokey routing binds identity to addresses in both directions",
            "It is rerouted to the peer that owns that IP",
          ],
          a: 1,
          why: "Inbound AllowedIPs is an identity check, not a routing hint. This is what makes in-tunnel spoofing structurally impossible.",
        },
        {
          q: "Why does boringtun require you to call update_timers() yourself?",
          opts: [
            "A bug that was never fixed",
            "It's sans-I/O by design: it owns no clock, sockets, or threads — you drive it, which is why it embeds anywhere",
            "Only needed on Windows",
          ],
          a: 1,
          why: "The library transforms buffers; you own the event loop. Freedom and responsibility in one API.",
        },
        {
          q: "Your phone switches from Wi-Fi to LTE mid-session. Why does the tunnel survive?",
          opts: [
            "The OS replays the handshake automatically",
            "Peers are identified by public key, not address — the endpoint just updates when authenticated packets arrive from the new address",
            "TCP retransmits cover the gap",
          ],
          a: 1,
          why: "Roaming is free when identity lives in the key. Compare IPsec, where an address change is an incident.",
        },
      ],
    },
  },
  {
    id: "m10",
    code: "T04",
    title: "NAT Traversal",
    tag: "STUN, hole punching, ICE, and relays of last resort",
    layers: ["L3", "L4"],
    est: "~60 min",
    lessons: [
      {
        id: "m10l1",
        title: "STUN: learning your own address",
        est: "~10 min",
        blocks: [
          {
            p: "Behind NAT (N11) you don't know what the world sees. **STUN** fixes that: send a request from your socket to a public STUN server; it replies with the source IP:port it observed — your **reflexive address**, i.e. the NAT mapping your socket currently owns.",
          },
          {
            p: "The address comes back in an **XOR-MAPPED-ADDRESS** attribute — XORed with the STUN magic cookie, not obfuscation for security but to stop broken NATs that 'helpfully' rewrite any bytes that look like their own IP inside payloads.",
          },
          {
            p: "Comparing answers teaches you your NAT's personality (the RFC 4787 table from N11): same mapping reported by two different STUN servers ⇒ endpoint-independent mapping, hole punching will likely work. Different mappings ⇒ endpoint-dependent ('symmetric'), prepare for the hard path.",
          },
          {
            note: "Crucial detail: STUN must be sent from the SAME socket you'll use for tunnel traffic. A different socket gets a different mapping, and the address you learned is useless.",
            label: "same socket!",
          },
        ],
      },
      {
        id: "m10l2",
        title: "Hole punching",
        est: "~10 min",
        blocks: [
          {
            p: "Two peers, both NATted, want a direct path. Each learns its reflexive address via STUN, they swap addresses through a **signaling channel** (a coordination server both can reach), then both fire UDP packets at each other **simultaneously**.",
          },
          {
            p: "Why it works: A's outbound packet toward B creates an outbound mapping in A's NAT — so when B's packet arrives moments later, A's NAT sees a 'reply' to an existing flow and lets it through. Ditto in mirror. Both NATs are tricked into believing they initiated. First packets may die crossing in flight; retry a few times and the hole stabilizes.",
          },
          {
            diagram: {
              kind: "seq",
              title: "Hole punching, blow by blow",
              actors: [
                { id: "a", label: "peer A", tone: "acc" },
                { id: "na", label: "NAT A", tone: "l3" },
                { id: "nb", label: "NAT B", tone: "l3" },
                { id: "b", label: "peer B", tone: "acc" },
              ],
              steps: [
                { note: "reflexive addresses already swapped via signaling" },
                {
                  from: "a",
                  to: "nb",
                  label: "probe",
                  sub: "opens mapping in NAT A",
                  tone: "bad",
                  dashed: true,
                },
                { note: "…dies at NAT B: no mapping there yet", tone: "bad" },
                {
                  from: "b",
                  to: "a",
                  label: "probe",
                  sub: "a 'reply' to NAT A's flow",
                  tone: "ok",
                },
                { from: "a", to: "b", label: "probe", sub: "now matches NAT B too", tone: "ok" },
                { note: "hole open — direct UDP both ways", tone: "ok" },
              ],
              caption:
                "Each outbound probe plants the mapping that admits the other side's packet — both NATs believe they initiated.",
            },
          },
          {
            p: "**Symmetric NATs** break the trick: the mapping A learned from STUN was for the flow *to the STUN server*; the flow to B gets a fresh, different port. Countermeasure: the non-symmetric side sprays probes across a range of likely ports — the birthday paradox makes a hit surprisingly cheap (hundreds of probes for good odds, not tens of thousands). Symmetric-to-symmetric usually means relay.",
          },
        ],
      },
      {
        id: "m10l3",
        title: "ICE: try everything, pick the best",
        est: "~10 min",
        blocks: [
          {
            p: "**ICE** systematizes traversal. Each side gathers **candidates**: *host* (local addresses), *server-reflexive* (from STUN), and *relay* (from a TURN server). Exchange candidate lists via signaling, form all pairs, probe every pair with connectivity checks, then nominate the best pair that worked.",
          },
          {
            p: "The priority order encodes the obvious economics: host beats reflexive beats relay — prefer LAN-direct, then internet-direct, and pay the relay tax only when nothing else connects. Two laptops on the same coffee-shop Wi-Fi should talk over the LAN even if both are 'connected to a VPN in Frankfurt'.",
          },
          {
            ul: [
              "Host candidate: my socket's local address — free, works on shared L2.",
              "Server-reflexive: my NAT mapping seen by STUN — works when punching succeeds.",
              "Relay: an address on a server that forwards for me — always works, costs latency and someone's bandwidth.",
            ],
          },
        ],
      },
      {
        id: "m10l4",
        title: "Relays: TURN and DERP",
        est: "~10 min",
        blocks: [
          {
            p: "**TURN** is the IETF relay: authenticated clients allocate a relayed address on the server; peers send there; the server forwards. It's the guaranteed fallback — ugly, metered, and essential.",
          },
          {
            p: "**DERP** (Tailscale's design) modernizes the idea: relays speak HTTPS on port 443 (traverses corporate firewalls that kill UDP entirely), and packets are addressed **by WireGuard public key**, not by allocated IP. Every client keeps a home DERP connection, so there is *always* a path — the relay carries the first (encrypted) packets instantly while hole punching runs in parallel, then traffic upgrades to the direct path transparently.",
          },
          {
            p: "Key insight for your client: because payloads are end-to-end encrypted by WireGuard *before* relaying, relays are **untrusted infrastructure**. They see ciphertext and metadata only. Relay-first-then-upgrade turns NAT traversal from a connect-time gamble into a background optimization — connections feel instant, then quietly get fast.",
          },
          {
            note: "Reading list: Tailscale's 'How NAT traversal works' is the field's best essay. RFC 8445 (ICE), RFC 5389/8489 (STUN), RFC 8656 (TURN) are the formal versions.",
            label: "go deeper",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "m10e1",
        kind: "ORDER LAB",
        title: "Two peers, two NATs, one connection",
        type: "order",
        prompt: "Order the steps of a successful ICE-style connection with relay fallback.",
        items: [
          "Each peer queries STUN and learns its reflexive address",
          "Peers exchange candidate lists via the signaling channel",
          "Both sides send simultaneous UDP probes at each other's candidates",
          "Each NAT sees inbound packets as replies to its own outbound flow",
          "Working pairs are ranked; the best direct path is nominated",
          "Traffic flows direct, with the relay held as fallback",
        ],
        why: "STUN teaches, signaling coordinates, simultaneity opens, nomination optimizes, the relay guarantees.",
      },
    ],
    quiz: {
      id: "m10q",
      questions: [
        {
          q: "Why must STUN queries use the same socket as tunnel traffic?",
          opts: [
            "STUN servers rate-limit new sockets",
            "NAT mappings are per-socket-flow — a different socket owns a different mapping, so the learned address wouldn't be yours",
            "The OS requires it",
          ],
          a: 1,
          why: "The reflexive address describes one specific mapping. Learn it on the socket that will use it.",
        },
        {
          q: "Why does simultaneous sending open both NATs?",
          opts: [
            "The packets merge in transit",
            "Each side's outbound packet creates a mapping, so the other side's packet arrives looking like a reply to an established flow",
            "NATs whitelist STUN traffic",
          ],
          a: 1,
          why: "Both NATs believe their own host initiated. Nobody lied — the timing did the work.",
        },
        {
          q: "What makes DERP-style relays acceptable to route through even though you don't trust them?",
          opts: [
            "They are audited annually",
            "Packets are already end-to-end encrypted by WireGuard — relays see only ciphertext and metadata",
            "They only relay handshakes",
          ],
          a: 1,
          why: "Encrypt end-to-end first, then any relay is just an untrusted bent pipe. Design order matters.",
        },
      ],
    },
  },
  {
    id: "m11",
    code: "S01",
    title: "Cross-Platform Engineering",
    tag: "One Rust core, five operating systems",
    layers: ["XP", "L3", "RS"],
    est: "~60 min",
    lessons: [
      {
        id: "m11l1",
        title: "The capability matrix",
        est: "~10 min",
        blocks: [
          {
            p: "Every platform gives you a packet device, a way to set routes/DNS, and a firewall — but through wildly different doors. Internalize this table; it dictates your architecture more than any Rust decision does.",
          },
          {
            tbl: {
              head: [
                "Platform",
                "Packet device",
                "Routes & DNS",
                "Firewall / enforcement",
                "Privilege model",
              ],
              rows: [
                [
                  "Linux",
                  "/dev/net/tun (ioctl)",
                  "netlink (rtnetlink)",
                  "nftables / iptables",
                  "root or CAP_NET_ADMIN",
                ],
                [
                  "macOS",
                  "utun control socket",
                  "PF_ROUTE + scoped resolvers",
                  "PF; NetworkExtension entitlements",
                  "Network Extension (sandboxed)",
                ],
                [
                  "iOS",
                  "handed to you",
                  "NEPacketTunnelProvider settings object",
                  "OS-enforced includeAllNetworks",
                  "NEPacketTunnelProvider only",
                ],
                [
                  "Windows",
                  "wintun rings",
                  "IP Helper API + interface metrics",
                  "WFP filters",
                  "Administrator / service",
                ],
                [
                  "Android",
                  "handed to you",
                  "VpnService.Builder",
                  "OS per-app VPN, protect()",
                  "VpnService + user consent",
                ],
              ],
            },
          },
          {
            p: "The pattern: desktop OSes let a privileged process do anything but make *you* assemble correctness from parts (routes + DNS + firewall must all agree). Mobile OSes hand you a sealed, pre-integrated tunnel object — less power, fewer footguns, and absolutely no choice about it.",
          },
        ],
      },
      {
        id: "m11l2",
        title: "Routing & DNS, per platform",
        est: "~10 min",
        blocks: [
          {
            p: "**Full tunnel** everywhere uses the N01 trick — `0.0.0.0/1` + `128.0.0.0/1` beating the default route, plus a /32 pin for the VPN server via the physical gateway. On Linux you speak netlink; on Windows you also manage **interface metrics** (lower metric wins ties, and Windows loves creating ties); on mobile you just declare routes in the builder/settings object and the OS installs them.",
          },
          {
            p: "**DNS is the platform-divergence champion.** Linux: is it plain resolv.conf, systemd-resolved, or NetworkManager? Detect and drive the right one. macOS: *scoped resolvers* let you send only certain domains to the tunnel DNS — powerful for split-DNS enterprise setups. Windows: per-adapter DNS plus the NRPT for domain rules; beware **smart multi-homed resolution** racing queries out every adapter (a leak by design — disable via policy). Mobile: DNS is just fields in the tunnel settings.",
          },
          {
            p: "**Split tunnel by route** (only 10.0.0.0/8 goes in) is table stakes everywhere. **Split by app** is where platforms diverge hard: Android has it natively (allowed/disallowed app lists), Windows needs WFP filters keyed on app ID, macOS offers per-app VPN via MDM, Linux does it with cgroup marks + policy routing (`SO_MARK` from R04 pays off), and iOS gives ordinary apps almost nothing.",
          },
        ],
      },
      {
        id: "m11l3",
        title: "Core/shell: the architecture that ships",
        est: "~10 min",
        blocks: [
          {
            p: "The winning shape, proven by Mullvad, Tailscale, and WireGuard's own apps: a **Rust core** owning everything portable — protocol, crypto, packet loop, routing decisions, state machine, config handling — and a thin **native shell** per platform owning everything the OS insists on: device creation, permission prompts, lifecycle callbacks, UI.",
          },
          {
            diagram: {
              kind: "stack",
              title: "Core/shell: the shape that ships",
              cols: [
                {
                  title: "native shell — per OS",
                  cells: [
                    { label: "UI", tone: "l7" },
                    { label: "permissions", sub: "prompts, entitlements", tone: "l7" },
                    { label: "lifecycle", sub: "OS callbacks", tone: "l7" },
                    { label: "device creation", sub: "TUN / rings / fd", tone: "l2" },
                  ],
                },
                {
                  title: "Rust core — one",
                  cells: [
                    { label: "protocol + crypto", tone: "acc" },
                    { label: "packet loop", tone: "acc" },
                    { label: "routing + state", tone: "acc" },
                    { label: "config", sub: "snapshots", tone: "ok" },
                  ],
                },
              ],
              gapLabel: "narrow FFI",
              caption:
                "connect() and events cross a narrow boundary: the shell never sees a packet, the core never sees a permission dialog.",
            },
          },
          {
            p: "Define the boundary as a narrow, semantic API: `connect(config)`, `disconnect()`, `set_network_available(bool)`, `events() → stream`. The shell calls down; the core emits events up. The shell never sees a packet; the core never sees a permission dialog.",
          },
          {
            ul: [
              "**uniffi** (Mullvad, et al.): write a UDL/proc-macro interface once, generate Swift + Kotlin bindings. The workhorse.",
              "**cbindgen**: emit a C header from Rust for maximum-control C ABI integration.",
              "Desktop alternative: run the core as a **daemon/system service** and talk IPC (gRPC/Unix socket) — Mullvad's model; sidesteps FFI entirely on Linux/Windows/macOS.",
            ],
          },
          {
            note: "Threading gotcha: mobile shells call you on *their* threads (main thread, binder threads). The FFI layer's first job is to hop onto your tokio runtime (Handle::spawn) and never block the caller. Most 'random ANR/crash' bugs in Rust-core mobile apps are violations of this rule.",
            label: "FFI reality",
          },
        ],
      },
      {
        id: "m11l4",
        title: "Kill switch: fail closed",
        est: "~10 min",
        blocks: [
          {
            p: "A VPN that leaks during reconnection is a VPN that leaks exactly when it matters. **Fail-closed** means: install firewall rules that drop all traffic except (a) the tunnel interface and (b) the encrypted underlay flow to your server — *before* bringing the tunnel up — so any gap in tunnel coverage results in silence, not leakage.",
          },
          {
            p: "Per platform: Linux nftables rules; Windows WFP filters (permit tunnel interface + your process's UDP flow, block the rest); macOS PF anchors or the NetworkExtension `includeAllNetworks` flag; Android `setBlocking` + always-on VPN with 'block connections without VPN'; iOS `includeAllNetworks` (with its known ecosystem quirks).",
          },
          {
            p: "Test it the honest way: while a download runs, kill your own daemon with SIGKILL. Zero packets should escape on the physical interface (verify with tcpdump/Wireshark from N08's toolkit). If the kill switch depends on your process being alive to enforce it, it isn't one — the rules must live in the kernel/OS and outlast you.",
          },
        ],
      },
    ],
    exercises: [],
    quiz: {
      id: "m11q",
      questions: [
        {
          q: "Your Android build works, but the underlay UDP socket's packets keep getting routed back into the VPN. What's the platform-correct fix?",
          opts: [
            "Add a /32 route via the physical gateway",
            "Call VpnService.protect() on the socket fd",
            "Lower the tunnel interface metric",
          ],
          a: 1,
          why: "Android's per-app VPN routing ignores your route tricks; protect() is the sanctioned socket-level escape hatch. Know the platform idiom.",
        },
        {
          q: "On Windows, DNS queries leak out the physical adapter even with tunnel DNS configured. Likely culprit?",
          opts: [
            "wintun dropped the packets",
            "Smart multi-homed name resolution racing queries across all adapters",
            "The DNS server is down",
          ],
          a: 1,
          why: "Windows races resolvers by design. Disable SMHNR via policy or scope it with NRPT rules — route tricks alone can't fix a resolver-level race.",
        },
        {
          q: "Why do serious clients put the kill switch in kernel firewall rules rather than in their own packet loop?",
          opts: [
            "Kernel rules are faster",
            "The rules must keep enforcing when the client process crashes — a kill switch that dies with your daemon is not a kill switch",
            "Firewall APIs are simpler",
          ],
          a: 1,
          why: "Fail-closed means the failure mode itself is safe. SIGKILL your daemon mid-download and watch tcpdump: silence or you're not done.",
        },
        {
          q: "What belongs in the Rust core vs the native shell?",
          opts: [
            "Core: UI and permissions; shell: crypto",
            "Core: protocol, crypto, packet loop, state; shell: device creation, permissions, lifecycle, UI",
            "Everything in the core, always",
          ],
          a: 1,
          why: "The shell owns what the OS insists on; the core owns everything portable. The narrow semantic boundary between them is the whole game.",
        },
      ],
    },
  },
  {
    id: "m12",
    code: "S02",
    title: "Architecture of a Real Client",
    tag: "Flows, engines, carriages, config, and posture",
    layers: ["XP", "L7", "RS"],
    est: "~75 min",
    lessons: [
      {
        id: "m12l1",
        title: "The unified Flow",
        est: "~10 min",
        blocks: [
          {
            p: "Traffic reaches a modern client through many doors: raw packets off a TUN, streams from a SOCKS/HTTP proxy listener, datagrams from apps. If each ingress grows its own pipeline, you get three routing engines, three telemetry paths, and three sets of bugs. The cure is a single internal currency: the **Flow**.",
          },
          {
            p: "A Flow is the normalized representation of one logical connection: its 5-tuple (src/dst address, ports, protocol), plus metadata — originating app if known, ingress source, posture context, timestamps. Every ingress adapter's only job is to turn its raw input *into* a Flow; everything downstream speaks Flow and nothing else.",
          },
          {
            diagram: {
              kind: "topo",
              title: "Everything becomes a Flow",
              nodes: [
                { id: "tun", label: "TUN", sub: "packets", tone: "l3", x: 0, y: 0 },
                { id: "socks", label: "SOCKS", sub: "streams", tone: "l4", x: 0, y: 1 },
                { id: "app", label: "app API", sub: "datagrams", tone: "l7", x: 0, y: 2 },
                {
                  id: "flow",
                  label: "Flow",
                  sub: "5-tuple + meta",
                  tone: "acc",
                  x: 1,
                  y: 1,
                  shape: "round",
                },
                { id: "core", label: "dispatch", sub: "rules + posture", tone: "acc", x: 2, y: 1 },
                { id: "wg", label: "WireGuard", sub: "Packet", tone: "acc2", x: 3, y: 0 },
                { id: "masque", label: "MASQUE", sub: "Datagram", tone: "l5", x: 3, y: 1 },
                { id: "direct", label: "direct", sub: "Stream", tone: "dim", x: 3, y: 2 },
              ],
              links: [
                { from: "tun", to: "flow" },
                { from: "socks", to: "flow" },
                { from: "app", to: "flow" },
                { from: "flow", to: "core", label: "route", tone: "acc" },
                { from: "core", to: "wg" },
                { from: "core", to: "masque" },
                { from: "core", to: "direct" },
              ],
              caption:
                "N ingresses and M engines meet at one core: normalize at the edge, decide once, transport by declared Carriage.",
            },
          },
          {
            p: "This is the same instinct as R04's anti-corruption boundaries, applied to the data plane: normalize at the edge, keep the core dialect-free. One dispatch core means one place to route, one place to observe, one place to test.",
          },
          {
            code: {
              lang: "rust",
              title: "the currency",
              body: "pub struct Flow {\n    pub five_tuple: FiveTuple,\n    pub ingress: Ingress,        // Tun | Socks | Proxy | App\n    pub app: Option<AppId>,\n    pub opened_at: Instant,\n    pub posture: PostureSnapshot,\n}",
            },
          },
        ],
      },
      {
        id: "m12l2",
        title: "TunnelEngine and the Carriage",
        est: "~10 min",
        blocks: [
          {
            p: "Different tunnels move different *shapes* of data. WireGuard moves packets. A TLS/SOCKS upstream moves streams. MASQUE moves datagrams-over-QUIC-streams. Pretend they're all the same and the abstraction leaks everywhere; model the difference explicitly and adapters become visible, testable objects.",
          },
          {
            p: "Hence a `TunnelEngine` trait whose contract says: *I accept Flows, and I declare which* **Carriage** *I transport* — `Packet`, `Stream`, or `Datagram`. When a Flow's natural shape mismatches the engine's carriage, an explicit adapter converts: smoltcp (T01) turns Streams into Packets for WireGuard; a QUIC session turns Packets into Datagrams for MASQUE.",
          },
          {
            code: {
              lang: "rust",
              title: "the trait, in spirit",
              body: "#[async_trait]\npub trait TunnelEngine: Send + Sync {\n    fn carriage(&self) -> Carriage;      // Packet | Stream | Datagram\n    fn health(&self) -> EngineHealth;\n    async fn open(&self, flow: Flow) -> Result<FlowHandle, EngineError>;\n    async fn shutdown(&self);\n}\n\npub enum Carriage { Packet, Stream, Datagram }",
            },
          },
          {
            p: "The payoff: routing logic composes over `dyn TunnelEngine` without knowing WireGuard from MASQUE from 'direct'; a `MockEngine` makes the dispatch core unit-testable with zero network; and adding an engine is additive — no existing code changes. This is R01's trait-object economics buying you an extensible product.",
          },
        ],
      },
      {
        id: "m12l3",
        title: "ConfigSource as anti-corruption boundary",
        est: "~10 min",
        blocks: [
          {
            p: "Config arrives from hostile dialects: files, broker APIs, MDM profiles, deep links. A `ConfigSource` trait quarantines each dialect: every source parses and validates its own format into one internal, versioned `ConfigSnapshot` — R04's two-stage validation, promoted to a first-class subsystem.",
          },
          {
            p: "Snapshots are **immutable and versioned**; distribution is a `watch` channel (R03). Subsystems hold the receiver and reconcile when the version changes. Nobody mutates shared config in place; a new world arrives whole, or not at all.",
          },
          {
            p: "Reconciliation discipline: compute the *diff* between running state and desired snapshot, apply minimally (don't tear down a healthy tunnel to change a DNS server), and make application **atomic per subsystem** — half-applied config is worse than old config. Keep the previous snapshot for instant rollback.",
          },
          {
            code: {
              lang: "rust",
              title: "config plumbing",
              body: "#[async_trait]\npub trait ConfigSource: Send + Sync {\n    async fn load(&self) -> Result<ConfigSnapshot, ConfigError>;\n    async fn watch(&self) -> BoxStream<'static, ConfigSnapshot>;\n}\n\n// broker: watch::Sender<Arc<ConfigSnapshot>>\n// every subsystem: watch::Receiver — R03's pattern, productized",
            },
          },
        ],
      },
      {
        id: "m12l4",
        title: "Posture as a first-class citizen",
        est: "~10 min",
        blocks: [
          {
            p: "**Zero trust** (NIST SP 800-207) in one line: never trust by network location; evaluate every access against identity *and* device state, continuously. For a client, that means **posture** — is disk encryption on? OS patched? screen lock set? EDR running? — is not a login-time checkbox but a live signal.",
          },
          {
            p: "So: a `PostureProvider` trait per signal source (OS APIs, MDM, EDR integrations), each feeding a combined `PostureSnapshot` distributed exactly like config — versioned, watched, reconciled. Posture *changes* trigger re-evaluation of live Flows: the routing engine re-runs its rules, and flows that no longer qualify are downgraded or severed.",
          },
          {
            p: "Design consequences worth stealing: posture checks must be **fast and cached** (they sit near the hot path), **fail-safe** decisions need explicit policy (posture source crashed — do flows continue or drop? that's a product decision, encode it), and every posture-driven verdict must be **explainable** in telemetry, because 'the VPN randomly cut my access' tickets will otherwise consume your life.",
          },
        ],
      },
      {
        id: "m12l5",
        title: "Why MASQUE / CONNECT-IP exists",
        est: "~10 min",
        blocks: [
          {
            p: "WireGuard-over-UDP has a censorship-and-middlebox problem: it *looks like* WireGuard to any DPI box, and hostile networks kill unknown UDP outright. **MASQUE** answers by tunneling inside **HTTP/3 over QUIC on port 443** — the traffic is indistinguishable from ordinary HTTPS browsing.",
          },
          {
            p: "The pieces: CONNECT-UDP (RFC 9298) proxies UDP flows; **CONNECT-IP (RFC 9484)** proxies *entire IP packets* — a full L3 VPN inside an HTTP/3 session. QUIC's unreliable **DATAGRAM** frames (RFC 9221) carry packets without retransmission, dodging the TCP-over-TCP meltdown from N08 even though the outer shell is stream-capable.",
          },
          {
            p: "In your architecture this is just another `TunnelEngine` with `Carriage::Datagram` — which is precisely the argument for the whole design. Apple's iCloud Private Relay runs on MASQUE; it is the likely future of tunnels that must survive hostile networks. Fallback ladder in practice: WireGuard/UDP (fastest) → MASQUE/443 (stealthy) → relay (always works).",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "m12e1",
        kind: "ORDER LAB",
        title: "A Flow crosses the dispatch core",
        type: "order",
        prompt: "Trace one connection through the unified architecture.",
        items: [
          "Ingress: packet, stream, or datagram arrives from a source (tun fd, SOCKS accept, proxy)",
          "Normalize it into a Flow with its 5-tuple and metadata",
          "Routing engine matches rules and posture to pick a TunnelEngine",
          "Engine transports it using its Carriage (Packet / Stream / Datagram)",
          "Egress: bytes leave via the engine's transport; telemetry records the decision",
        ],
        why: "Normalize at the edge, decide in one core, transport by declared shape, observe everything.",
      },
    ],
    quiz: {
      id: "m12q",
      questions: [
        {
          q: "What problem does normalizing everything into a Flow solve?",
          opts: [
            "It compresses packets",
            "It prevents each ingress type from growing its own routing/telemetry pipeline — one dispatch core, one set of rules, one place to test",
            "It is required by RFC 9484",
          ],
          a: 1,
          why: "N ingresses × M engines becomes N adapters + one core + M engines. The economics of the whole design.",
        },
        {
          q: "Why model Carriage (Packet/Stream/Datagram) explicitly instead of a bytes-in-bytes-out engine API?",
          opts: [
            "Rust requires it",
            "Shape mismatches then become explicit, testable adapters (like smoltcp) instead of leaky assumptions buried in every engine",
            "It reduces memory use",
          ],
          a: 1,
          why: "Pretending shapes match is how abstractions leak. Naming the mismatch is how they hold.",
        },
        {
          q: "Under NIST SP 800-207, what should a posture change (e.g., disk encryption disabled) do to already-established flows?",
          opts: [
            "Nothing — posture is checked at connect time",
            "Trigger re-evaluation: continuous verification means live flows can be downgraded or severed",
            "Only log a warning",
          ],
          a: 1,
          why: "'Continuous' is the operative word in continuous verification. Login-time-only checks are perimeter thinking wearing a zero-trust costume.",
        },
        {
          q: "Why carry IP packets in QUIC DATAGRAM frames (RFC 9221) rather than QUIC streams in MASQUE?",
          opts: [
            "Streams are encrypted differently",
            "Streams retransmit — putting TCP-carrying packets on a reliable layer recreates the TCP-over-TCP meltdown",
            "DATAGRAM frames are larger",
          ],
          a: 1,
          why: "N08's lesson, resurfacing at the cutting edge: let the inner protocol own reliability.",
        },
      ],
    },
  },
  {
    id: "m13",
    code: "S03",
    title: "Capstone Roadmap",
    tag: "From hello-tunnel to production client",
    layers: ["XP", "RS", "L7"],
    est: "~45 min",
    lessons: [
      {
        id: "m13l1",
        title: "The milestone ladder",
        est: "~10 min",
        blocks: [
          {
            p: "Expertise compounds when each artifact is *runnable*. This ladder is sequenced so every rung uses the previous rung's code and one new module's ideas. No rung is more than a weekend; together they are a client.",
          },
          {
            ul: [
              "**R1 — UDP echo** (N08/R03): tokio client+server, select! loop, graceful shutdown.",
              "**R2 — Framed protocol** (R04): length-prefixed messages over TCP, max-size guard, property tests.",
              "**R3 — TUN hexdump** (T01): open a TUN, set an address, print every packet; ping it and watch.",
              "**R4 — Static tunnel** (T02/T03): boringtun, one hardcoded peer; ping through encrypted transport.",
              "**R5 — Timers & roaming** (T03): update_timers loop, rekey survives 3 minutes, endpoint roams.",
              "**R6 — ConfigSource** (R04/S02): trait + file source + watch channel; hot-reload a peer without dropping the tunnel.",
              "**R7 — Flow dispatch** (S02): route by CIDR across two engines (WireGuard + direct); MockEngine tests.",
              "**R8 — STUN client** (T04): learn your reflexive address from your tunnel socket; classify your NAT.",
              "**R9 — Second platform** (S01): same core, new shell (start macOS or Windows; mobile after).",
              "**R10 — Kill switch** (S01): fail-closed rules; SIGKILL-under-load leak test passes.",
            ],
          },
        ],
      },
      {
        id: "m13l2",
        title: "Testing tunnels honestly",
        est: "~10 min",
        blocks: [
          {
            p: "**Network namespaces are your laboratory.** `ip netns` conjures isolated network stacks on one Linux box: build client-ns ⇆ (veth) ⇆ router-ns ⇆ server-ns, add `nft masquerade` in the router and you have a NAT testbed; two routers give you the double-NAT hole-punching scenario. Your entire integration suite runs in CI with no cloud.",
          },
          {
            p: "**Watch the wires**: `tcpdump -i any udp port 51820 -w cap.pcap` then read in Wireshark — it dissects WireGuard message types natively. Assert the negative space too: during a kill-switch test, the physical interface capture must be *empty*.",
          },
          {
            p: "**Property tests** (proptest) for every parser and codec — R04's framing, config parsing, packet views: `decode(encode(x)) == x` plus 'random bytes never panic'. **Chaos**: `tc qdisc add dev veth0 root netem loss 5% delay 50ms 20ms reorder 10%` — your rekey and keepalive logic is only real if it survives netem.",
          },
          {
            note: "The netns + netem + tcpdump trio replaces a rack of test hardware. Mastering it is a career skill beyond VPNs.",
            label: "force multiplier",
          },
        ],
      },
      {
        id: "m13l3",
        title: "Shipping it",
        est: "~10 min",
        blocks: [
          {
            p: "**Observability first**: structured `tracing` spans around every flow decision (which rule matched, which engine, what posture said), counters for handshake latency, rekeys, drops by reason. Your future self debugging 'VPN slow on hotel Wi-Fi' will have exactly the data or exactly the regret.",
          },
          {
            p: "**State-machine honesty**: the connection lifecycle (Disconnected → Connecting → Handshaking → Up → Degraded → Reconnecting) should be an explicit enum with logged transitions — half of user-visible bugs are illegal transitions that an explicit machine makes unrepresentable (R01's philosophy at system scale).",
          },
          {
            diagram: {
              kind: "state",
              title: "The connection lifecycle, made explicit",
              states: [
                { id: "disc", label: "Disconnected", x: 0, y: 0, tone: "dim" },
                { id: "conn", label: "Connecting", x: 1, y: 0 },
                { id: "hand", label: "Handshaking", x: 2, y: 0, tone: "acc" },
                { id: "up", label: "Up", x: 3, y: 0, tone: "ok" },
                { id: "rec", label: "Reconnecting", x: 2, y: 1, tone: "acc" },
                { id: "deg", label: "Degraded", x: 3, y: 1, tone: "bad" },
              ],
              edges: [
                { from: "disc", to: "conn", label: "connect" },
                { from: "conn", to: "hand", label: "socket up" },
                { from: "hand", to: "up", label: "1-RTT", tone: "ok" },
                { from: "up", to: "deg", label: "keepalives missed", tone: "bad", bend: 22 },
                { from: "deg", to: "up", label: "traffic resumes", tone: "ok", bend: 22 },
                { from: "deg", to: "rec", label: "path lost" },
                { from: "rec", to: "hand", label: "retry" },
                { from: "up", to: "disc", label: "disconnect", tone: "dim", bend: -70 },
              ],
              caption:
                "Log every transition; anything not drawn here is a bug the enum makes unrepresentable.",
            },
          },
          {
            p: "**Staged rollout**: config versioning + instant rollback (S02's snapshot pattern), canary percentages, and leak tests as release gates. A VPN's failure modes are privacy failures; ship like it.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "m13e1",
        kind: "CAPSTONE",
        title: "The builder's checklist",
        type: "check",
        prompt:
          "Track your ladder. Each item is a runnable artifact — check it off when yours runs.",
        items: [
          "UDP echo client+server in tokio with graceful shutdown",
          "Length-prefixed framing with max-size guard and property tests",
          "Open a TUN device and hexdump live packets",
          "Static boringtun tunnel to a single peer (ping passes encrypted)",
          "Timer loop: rekey at 120 s survives, endpoint roaming works",
          "ConfigSource trait with file source + hot reload via watch channel",
          "Flow dispatch routing by CIDR across two engines with MockEngine tests",
          "STUN client learns reflexive address from the tunnel socket",
          "Second platform shell sharing the same Rust core",
          "Kill switch: SIGKILL-under-load leak test passes in netns lab",
        ],
      },
    ],
  },
];
