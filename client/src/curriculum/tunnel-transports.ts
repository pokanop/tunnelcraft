import type { Module } from "./types";

/* Tunnel Engineering — T06: Hostile-Network Transports.

   T01–T05 quietly assumed one carriage: UDP. WireGuard is UDP (T03), hole
   punching sprays UDP (T04), the mesh gossips over UDP (T05). Real networks
   do not cooperate — corporate DPI firewalls and many mobile carriers block,
   throttle, or deprioritize UDP outright. This module makes the *transport*
   (what moves the bytes) a design axis of its own, independent of the overlay
   that rides it: a connector abstraction, then the transports you plug into
   it — TCP and WebSocket, QUIC, KCP, faketcp obfuscation — and gateway-assisted
   traversal (UPnP IGD, NAT-PMP) as first-class companions to hole punching.

   It extends T05: T05 made the *control plane* pluggable; T06 makes the
   *carriage* pluggable. Read them as a pair.

   EasyTier (github.com/EasyTier/EasyTier — a Rust/Tokio mesh VPN) is the
   read-real-code anchor: it ships exactly this menu of carriages behind a
   URL-scheme connector abstraction (tcp:// udp:// ws:// wss:// wg:// quic,
   plus FakeTCP, and KCP/QUIC loss-resistance proxies). It is LGPL-3.0:
   everything below is described from its public docs and architecture and
   links to the source; no code is reproduced. Read and link freely; do not
   paste its source into proprietary work without attribution and a license
   review. The non-EasyTier projects cited (quinn, KCP, Phantun, udp2raw,
   igd-next, natpmp) are separate works under their own licenses — linked as
   further reading, not excerpted. */

export const TUNNEL_TRANSPORTS: Module[] = [
  {
    id: "t06",
    code: "T06",
    title: "Hostile-Network Transports",
    tag: "Decoupling the overlay from its carriage: TCP/WS, QUIC, KCP, obfuscation, and gateway-assisted traversal",
    layers: ["L4", "L7", "RS"],
    est: "~80 min",
    lessons: [
      {
        id: "t06l1",
        title: "The transport is a design axis",
        est: "~12 min",
        blocks: [
          {
            p: "Everything from T01 to T05 rode one **carriage**: UDP. WireGuard's data plane is UDP (T03); STUN and hole punching spray UDP (T04); the mesh gossips its peer table over UDP (T05). That was a reasonable default — UDP is the honest datagram substrate a tunnel wants (N08) — but it was never the *only* option, and on a large fraction of real networks it does not work at all. Corporate firewalls run **deep packet inspection** that blocks or throttles anything that is not recognizable TCP on a blessed port; many mobile carriers deprioritize or drop UDP; hotel and captive-portal Wi-Fi often passes only TCP to 80/443. A UDP-only VPN on those networks simply never connects.",
          },
          {
            p: "So *what moves the bytes* is its own design axis, independent of the overlay that rides on top — exactly parallel to T05, which made the **control plane** (who owns the map) an axis independent of the data plane. Here the axis is the **transport**: keep the overlay (peers, identity, crypto, overlay routing — T02/T03/T05) written once, and let the ciphertext it produces travel over whichever carriage the current network permits. UDP when you can; TCP or WebSocket when UDP is blocked; QUIC when you want a better datagram pipe; KCP on a lossy link; an obfuscated carriage when the middlebox is actively hostile.",
          },
          {
            p: "The mechanism is a **connector / transport abstraction**: a narrow interface — dial a peer, get back a bidirectional pipe of framed messages — that every transport implements. In Rust that pipe is usually something bounded by `AsyncRead + AsyncWrite + Unpin + Send` (a stream carriage) or a `Sink`/`Stream` of datagrams. The overlay depends only on the interface, so adding a transport is a new `impl`, not a rewrite. EasyTier makes this literal: each carriage is a **URL scheme** — `tcp://`, `udp://`, `ws://`, `wss://`, `wg://`, `quic` — and a **connector** dials one and yields a tunnel; you list several and it races them.",
          },
          {
            diagram: {
              kind: "stack",
              title: "Bake in UDP, or plug in a carriage",
              gapLabel: "what moves the bytes?",
              cols: [
                {
                  title: "Baked in · UDP only",
                  cells: [
                    { label: "Overlay", sub: "assumes one socket", tone: "acc" },
                    { label: "Carriage", sub: "UDP, hardcoded", tone: "bad" },
                    { label: "UDP blocked", sub: "no connection at all", tone: "bad" },
                    { label: "New transport", sub: "rewrite the overlay", tone: "bad" },
                  ],
                },
                {
                  title: "Connector abstraction · T06",
                  cells: [
                    { label: "Overlay", sub: "written once", tone: "acc" },
                    { label: "Connector iface", sub: "dial → framed pipe", tone: "ok" },
                    { label: "Carriage", sub: "UDP·QUIC·TCP·WS·KCP", tone: "ok" },
                    { label: "UDP blocked", sub: "swap carriage, mesh untouched", tone: "acc2" },
                  ],
                },
              ],
              caption:
                "The overlay talks to an interface, not a socket. Reachability, reliability, multiplexing, and camouflage become properties of the carriage you plug in — chosen per network, without touching identity, crypto, or routing.",
            },
          },
          {
            p: "One law from the fundamentals governs the whole module: **put reliability at the layer that wants it** (N08's UDP choice, N09's meltdown, N11's QUIC streams — the same rule sighted repeatedly). WireGuard's datagram data plane is content with an *unreliable* carriage because the tunneled protocols inside handle their own reliability. The moment you move to a *reliable stream* carriage (TCP), you have added a second reliability layer nobody asked for — and the next lesson is the price of that mistake.",
          },
          {
            note: "Case study, used throughout: EasyTier (github.com/EasyTier/EasyTier) ships every carriage this module teaches — TCP, UDP, WS/WSS, QUIC, FakeTCP, and KCP/QUIC loss-resistance proxies — behind a URL-scheme connector abstraction (see easytier/src/connector). A superb read-real-code target. LGPL-3.0: read and link freely; do not paste its source into proprietary curriculum or products without attribution and a license review. Everything here is from its public docs and architecture, not copied.",
            label: "EasyTier, honestly",
          },
        ],
      },
      {
        id: "t06l2",
        title: "Tunnels over TCP and WebSocket",
        est: "~13 min",
        blocks: [
          {
            p: "When UDP is blocked, the universal escape is the one port every network passes: **TCP to 443**. Wrap the tunnel's ciphertext in a TCP connection and the DPI firewall sees an ordinary outbound web flow. But TCP hands you a *byte stream*, not datagrams — it guarantees bytes arrive in order, and guarantees *nothing* about where one message ends and the next begins. So the first job of any stream carriage is **framing**: re-imposing message boundaries the stream erased (glossary: *Framing*). The workhorse is a **length prefix** — write a fixed-width length, then the bytes; on the read side, read the length, then read *exactly* that many bytes. This is the same 4-byte big-endian convention as the S03 capstone's R2 frame.",
          },
          {
            code: {
              lang: "rust",
              title: "length-prefix framing — give a stream message boundaries",
              run: true,
              body: 'fn encode(payload: &[u8]) -> Vec<u8> {\n    // [u32 big-endian length][payload] — network byte order, like the R2 frame.\n    let mut out = Vec::with_capacity(4 + payload.len());\n    out.extend_from_slice(&(payload.len() as u32).to_be_bytes());\n    out.extend_from_slice(payload);\n    out\n}\n\n// Pull one whole frame off the front of a stream buffer, if it has arrived.\nfn decode(buf: &[u8]) -> Option<(&[u8], usize)> {\n    if buf.len() < 4 {\n        return None; // length header not fully here yet\n    }\n    let len = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]) as usize;\n    if buf.len() < 4 + len {\n        return None; // body still in flight — wait for more bytes\n    }\n    Some((&buf[4..4 + len], 4 + len))\n}\n\nfn main() {\n    // Two tunnel packets, concatenated on the wire as TCP would deliver them.\n    let mut wire = encode(b"handshake");\n    wire.extend(encode(b"ping"));\n\n    // The reader recovers exact boundaries the byte stream did not preserve.\n    let mut off = 0;\n    while let Some((frame, used)) = decode(&wire[off..]) {\n        println!("frame = {:?}", std::str::from_utf8(frame).unwrap());\n        off += used;\n    }\n    // => frame = "handshake"\n    // => frame = "ping"\n}',
            },
          },
          {
            p: "**The trap: TCP-over-TCP meltdown.** Tunneling a reliable protocol (the TCP flows your users run *inside* the VPN) over another reliable protocol (the outer TCP carriage) stacks two independent retransmit-and-backoff loops. When the underlay drops a segment, the outer TCP holds *everything* behind it (head-of-line blocking) and slows down; meanwhile the inner TCP, seeing its own packets delayed, *also* times out and retransmits — piling a second backoff on top. Under loss the two controllers fight and throughput collapses toward zero (N09 named this meltdown; here it is a design constraint). The lesson: **a TCP carriage is a fallback for reachability, never a default for performance.** Prefer a datagram carriage (UDP, or QUIC — next lesson) whenever one flows, and climb to TCP only when forced.",
          },
          {
            p: "**WebSocket (WS/WSS) goes one better than raw TCP.** Wrap the frames in the WebSocket protocol — an HTTP `Upgrade` handshake, then message-framed binary — over TLS on 443 (WSS). Three wins: (1) to a middlebox it is *indistinguishable from ordinary HTTPS*, the hardest traffic to justify blocking; (2) it traverses **HTTP forward proxies** that only permit `CONNECT`/`Upgrade`, where raw TCP would be refused; (3) WebSocket is already message-oriented, so it does your framing and gives you ping/pong keepalives for free. The cost: an HTTP+TLS handshake up front, and you are still on a **reliable stream** — meltdown still applies, so the datagram-first rule stands. Rust reaches for `tokio-tungstenite` (WS) over `tokio-rustls` (TLS).",
          },
          {
            diagram: {
              kind: "flow",
              title: "Climb the fallback ladder only as far as forced",
              nodes: [
                { label: "UDP", sub: "blocked / throttled", tone: "bad" },
                { label: "TCP :443", sub: "framed stream", tone: "acc2" },
                { label: "WS", sub: "HTTP Upgrade", tone: "acc2" },
                { label: "WSS :443", sub: "looks like HTTPS", tone: "ok" },
              ],
              arrows: ["UDP dies", "proxy blocks raw TCP", "wrap + TLS"],
              caption:
                "Each rung trades performance for reachability. By WSS you pass HTTP proxies and vanish into web traffic — but you are a reliable stream now, so stop climbing the moment a carriage connects.",
            },
          },
          {
            p: "So the selection order for reaching *out* of a hostile network: **raw UDP** (fastest, default) → **QUIC** (a better datagram pipe, T06L3) → **WSS on 443** (proxy- and DPI-hostile networks) → **raw TCP** (simplest last-ditch when only UDP is filtered and no proxy sits in the way). Real clients try several in parallel and keep the best that connects — Happy-Eyeballs thinking (N11) applied to your own carriage.",
          },
          {
            note: "EasyTier ships `tcp://`, `ws://`, and `wss://` connectors alongside UDP for exactly this — a node behind a UDP-hostile firewall lists a `wss://` peer and blends into 443 traffic (github.com/EasyTier/EasyTier, LGPL-3.0 — link and read, do not lift). The TCP-over-TCP meltdown is also why its relays add KCP/QUIC proxies rather than naively forwarding over TCP (T06L3–L4).",
            label: "in the wild",
          },
        ],
      },
      {
        id: "t06l3",
        title: "QUIC as a transport (quinn)",
        est: "~13 min",
        blocks: [
          {
            p: "QUIC is the premium datagram carriage. N11 taught what it *is* — TLS 1.3 fused into the transport, independent streams, connection IDs that survive network changes, 1-RTT/0-RTT setup, and unreliable DATAGRAM frames (RFC 9221). This lesson is about *using it as your tunnel's transport*, in Rust, via **`quinn`** (the async, pure-Rust QUIC on Tokio). Three properties make QUIC beat a bare-TCP carriage for a mesh overlay:",
          },
          {
            ul: [
              "**Stream multiplexing without head-of-line blocking.** Many independent streams share one connection; a lost packet stalls only *its* stream, not the others (N11). Multiplex many tunneled flows over a single TCP carriage and one lost segment stalls *all* of them — the meltdown's blocking cousin. QUIC gives you a cheap stream per peer or per flow.",
              "**Connection migration.** A QUIC connection is named by its **connection ID**, not the 4-tuple — so it outlives a change of IP or port. The phone hops Wi-Fi→LTE, or the NAT rebinds your port, and the connection *survives* with no re-handshake and no dropped tunnel. This is WireGuard's roam-by-identity (T03) arriving in the mainstream transport (N11).",
              "**Built-in TLS 1.3 and DATAGRAM frames.** The carriage is already authenticated and encrypted, and RFC 9221 datagrams let you run packet-shaped, *unreliable* cargo over QUIC — so you get streams, migration, and camouflage-as-HTTP/3 *without* re-imposing reliability (dodging meltdown, T06L2). It is the hook MASQUE/CONNECT-IP hangs a whole VPN on (S02).",
            ],
          },
          {
            note: "The honest caveat, and the whole point of pairing this lesson with the last: **QUIC rides UDP.** On a network that blocks UDP entirely, QUIC does not connect either — you still fall back to WSS/TCP (T06L2). QUIC's role is *the best carriage where UDP flows*: better than bare TCP, mobile-friendly, and it looks like HTTP/3 on 443. Two different problems — 'UDP is blocked' (→ TCP/WS/faketcp) versus 'UDP flows but I want mux and migration' (→ QUIC). Do not confuse them.",
            label: "QUIC ≠ a UDP-block fix",
          },
          {
            p: "In `quinn`, an **`Endpoint`** owns one UDP socket and multiplexes every connection over it. You `connect()` to get a `Connection`, then `open_bi()` for a bidirectional stream. Migration is client-driven: bind a socket on the new network path and hand it to the endpoint with **`rebind()`** — it swaps the underlying socket under all live connections, packets now leave from the new address, and the server (with migration permitted — quinn allows it by default) validates the new path and keeps the *same* connection going. The connection ID never changed, so open streams keep flowing:",
          },
          {
            code: {
              lang: "rust",
              title: "quinn: migrate a live connection to a new path (teaching sketch)",
              body: 'use quinn::Endpoint;\n\n// A QUIC connection is named by its connection ID, not the 4-tuple, so it\n// can outlive a change of local socket (N11; T03\'s roam-by-identity).\nlet (mut send, mut recv) = conn.open_bi().await?; // one of many independent streams\nsend.write_all(b"hello over quic").await?;\n\n// ...the device roams Wi-Fi -> LTE. Bind a socket on the new path and hand\n// it to the endpoint; every live connection migrates atomically.\nlet roamed = std::net::UdpSocket::bind("0.0.0.0:0")?; // OS-assigned port, new interface\nendpoint.rebind(roamed)?;\n\n// Same `conn`, same `send` stream: no re-handshake, no dropped tunnel. The\n// server sees a new remote address, validates the path, and carries on.\nsend.write_all(b"...still the same connection").await?;',
            },
          },
          {
            diagram: {
              kind: "seq",
              title: "Connection migration, blow by blow",
              actors: [
                { id: "c", label: "client", sub: "Wi-Fi → LTE", tone: "acc" },
                { id: "s", label: "server", tone: "ok" },
              ],
              steps: [
                {
                  from: "c",
                  to: "s",
                  label: "1-RTT handshake",
                  sub: "connection ID assigned",
                  tone: "ok",
                },
                { from: "c", to: "s", label: "stream data", sub: "open_bi()", tone: "ok" },
                { note: "Wi-Fi drops — client rebinds to an LTE socket (endpoint.rebind)" },
                {
                  from: "c",
                  to: "s",
                  label: "same conn, new source addr",
                  sub: "connection ID unchanged",
                  tone: "acc",
                },
                {
                  from: "s",
                  to: "c",
                  label: "path validation",
                  sub: "probe the new 4-tuple",
                  tone: "acc2",
                },
                { note: "connection continues — streams intact, no re-handshake", tone: "ok" },
              ],
              caption:
                "The 4-tuple changed; the connection ID did not. QUIC validates the new path and carries on — the mainstream transport doing what WireGuard did by hand (T03).",
            },
          },
          {
            note: "EasyTier offers a QUIC carriage and uses QUIC (with KCP) as a loss-resistance proxy on relay paths — a production example of QUIC-as-tunnel-transport (github.com/EasyTier/EasyTier, LGPL-3.0). The `quinn` project (github.com/quinn-rs/quinn) is the read-the-source anchor for the API above — a separate work under its own license; linked, not excerpted.",
            label: "go deeper",
          },
        ],
      },
      {
        id: "t06l4",
        title: "KCP for loss recovery on unreliable links",
        est: "~11 min",
        blocks: [
          {
            p: "QUIC and TCP are *polite*. Their congestion control (Cubic, BBR) reads every loss as a signal of congestion and **backs off** — the correct move on a shared, congested backbone. But on a link whose loss comes from *unreliability* rather than congestion — flaky Wi-Fi, a saturated cellular cell, satellite, a bad last mile — backing off is exactly wrong: you slow down precisely when you should be resending fast. **KCP** is the answer for that regime: a **fast ARQ protocol** (automatic repeat request — the acknowledge-and-retransmit family that TCP, QUIC, and KCP all belong to) layered over UDP, tuned to trade bandwidth for latency.",
          },
          {
            p: "KCP is deliberately *rude*. It re-implements reliability like TCP but strips out the politeness: it retransmits a segment after a few **skipped ACKs** instead of waiting out a full retransmission timeout; it sends ACKs **immediately** rather than delaying to batch them; it backs its RTO off by **×1.5** instead of TCP's ×2, so a couple of drops do not balloon the timeout to ×8; and it can **disable flow control entirely** (the `nc` option), skipping slow-start and loss-backoff altogether. It is only an algorithm — you supply the datagram transport (UDP) underneath — and it is frequently paired with **FEC** (forward error correction), sending redundant data so some loss is repaired with no round-trip at all.",
          },
          {
            diagram: {
              kind: "flow",
              title: "Fast retransmit: don't wait for the clock",
              nodes: [
                { label: "sent 1·2·3·4·5", sub: "5 segments out", tone: "acc" },
                { label: "ACK 1,3,4", sub: "2 skipped", tone: "acc2" },
                { label: "infer 2 lost", sub: "no RTO wait", tone: "bad" },
                { label: "resend 2", sub: "immediately", tone: "ok" },
              ],
              arrows: ["peer ACKs", "skip-ACK ≥ 2", "retransmit"],
              caption:
                "TCP waits for a timeout (or 3 dup-ACKs) then backs off; KCP treats the skipped ACKs as proof of loss and resends at once. Lower latency, at the cost of occasionally resending a segment that was merely reordered.",
            },
          },
          {
            p: "The published trade is concrete: KCP's own measurements claim **~30–40% lower average latency** (and a far smaller worst case) for **~10–20% more bandwidth** than TCP on lossy links. So KCP beats QUIC precisely when latency matters, loss is high, and bandwidth is cheap or dedicated: real-time tunnels (game/voice) over a bad last mile, satellite hops, congested mobile. QUIC and TCP win the opposite cases — a *shared or metered* link where being a good neighbour matters, or a *clean* link where politeness costs nothing and QUIC's streams and migration are pure upside.",
          },
          {
            tbl: {
              head: ["", "TCP / QUIC (default CC)", "KCP (nodelay)"],
              rows: [
                ["Reads loss as", "congestion → back off", "just loss → resend"],
                ["Retransmit on", "RTO, or 3 dup-ACKs", "skipped ACKs, no RTO wait"],
                ["RTO backoff", "× 2 (exponential)", "× 1.5 (gentler)"],
                ["ACK timing", "delayed / batched", "immediate"],
                ["Flow control", "always fair", "optional (nc = 1)"],
                ["Cost", "polite, bandwidth-lean", "~10–20% more bandwidth"],
                ["Best on", "shared · metered · clean", "lossy · latency-critical · owned"],
              ],
            },
          },
          {
            note: "One honest warning: KCP is antisocial by design — it degrades other flows sharing the bottleneck, because it will not yield. Use it where you own the link budget or the link is effectively dedicated; do not unleash rude ARQ on a shared corporate uplink. EasyTier exposes KCP as a proxy mode for high-loss relay paths (github.com/EasyTier/EasyTier, LGPL-3.0); the algorithm is skywind3000/kcp (github.com/skywind3000/kcp), with Rust bindings in the `kcp` / `tokio_kcp` crates — separate works, linked for reading.",
            label: "use it responsibly",
          },
        ],
      },
      {
        id: "t06l5",
        title: "faketcp and obfuscation",
        est: "~11 min",
        blocks: [
          {
            p: "Some middleboxes do more than block UDP — they **classify** traffic and drop or throttle anything that is not recognizable TCP, even on 443. **Obfuscation** answers by making your packets *look like* something the box permits. The canonical technique is **faketcp**: send what are really UDP-style datagrams, but dressed in bytes that resemble a TCP flow — a plausible SYN / SYN-ACK / ACK handshake up front, then sequence and acknowledgement numbers that advance like a real connection (udp2raw even mimics MSS, SACK, and timestamp options). The DPI box sees 'a TCP flow' and lets it pass; underneath there is **no real TCP stack** — no congestion control, no retransmission, out-of-order delivery is fine — so you keep datagram semantics and dodge the TCP-over-TCP meltdown (T06L2) entirely.",
          },
          {
            p: "Building it is where the cost lands. You cannot use ordinary sockets — the OS would run its own TCP state machine over your bytes. You need **raw sockets** (Linux `AF_PACKET` / raw IP) to craft and read packets *below* the kernel's TCP stack, or **WinDivert** (which captures and reinjects packets in userspace) on Windows. And because the kernel never opened these 'connections', when it sees the peer's ACKs it does not recognize, its own stack fires a **RST** to tear the phantom connection down — so you must **firewall out the kernel's own RSTs** (an `iptables`/nftables drop rule on that tuple; tools like udp2raw add it automatically). It works, but it is a privileged, fiddly, easily-broken setup.",
          },
          {
            diagram: {
              kind: "seq",
              title: "The fake handshake — and the kernel you must muzzle",
              actors: [
                { id: "u", label: "faketcp", sub: "raw socket / WinDivert", tone: "acc" },
                { id: "m", label: "DPI middlebox", tone: "l3" },
                { id: "p", label: "peer", tone: "ok" },
              ],
              steps: [
                { from: "u", to: "m", label: "SYN", sub: "looks like TCP setup", tone: "acc2" },
                { from: "m", to: "p", label: "pass", sub: "'a TCP flow'", tone: "ok" },
                {
                  from: "p",
                  to: "u",
                  label: "SYN-ACK / data",
                  sub: "advancing seq/ack",
                  tone: "ok",
                },
                { note: "local kernel: 'I never opened this' → wants to send RST", tone: "bad" },
                {
                  note: "iptables DROP on the tuple muzzles the kernel RST — fragile, privileged",
                  tone: "bad",
                },
              ],
              caption:
                "The middlebox is fooled by the shape; your own OS is not, and tries to reset the connection it did not open. Suppressing that RST is the maintenance tax faketcp never stops charging.",
            },
          },
          {
            p: "Weigh it honestly against the alternatives — the issue this module was built for asks specifically for **legality, detection, and maintenance cost**:",
          },
          {
            tbl: {
              head: ["", "WS / WSS :443", "faketcp (udp2raw / Phantun)"],
              rows: [
                ["Disguise", "real HTTPS on 443", "UDP dressed as a TCP flow"],
                ["Privilege", "none — normal socket", "root / admin — raw sock, WinDivert"],
                ["Mobile / app store", "works, ships", "blocked — no raw sockets on iOS/Android"],
                ["Beats", "HTTP proxies · UDP-blocking DPI", "boxes that drop non-TCP packets"],
                ["Kernel fights you", "no", "yes — must firewall its RSTs"],
                ["Detection", "strong — it is TLS", "weak vs stateful DPI (no real CC)"],
                ["Upkeep", "low", "high — OS/offload/firewall churn"],
              ],
            },
          },
          {
            p: "**Detection** is the honest weak point: faketcp beats *naive* DPI, but a stateful censor that tracks real TCP semantics (window growth, retransmit behaviour, RTT) can spot a 'TCP' flow that never does congestion control. It is a cat-and-mouse arms race, which is why modern anti-censorship increasingly favours *fully-encrypted, structureless* protocols or true TLS mimicry over faketcp. **Legality and policy** is the part to take seriously: this is dual-use technology. Circumventing a network's access policy can violate its acceptable-use terms — a firing offence on a corporate network you do not own — and in some jurisdictions evading state censorship carries real legal risk for the *user*. Anti-censorship is a legitimate and important use; know your threat model and the law where you operate, and do not deploy obfuscation on networks whose rules bind you.",
          },
          {
            note: "Bottom line: faketcp is a niche, high-cost, desktop-only rung at the far end of the ladder. Reach for WSS-on-443 first — it looks like HTTPS, needs no privilege, ships on mobile, and passes proxies. Read-the-source anchors, all separate works under their own licenses (linked, not excerpted): Phantun (github.com/dndx/phantun — faketcp in safe Rust via TUN, WinDivert on Windows) and udp2raw (github.com/wangyu-/udp2raw — the original, raw-socket faketcp/ICMP). EasyTier also offers a FakeTCP carriage (LGPL-3.0).",
            label: "reach for the cheap disguise first",
          },
        ],
      },
      {
        id: "t06l6",
        title: "Gateway-assisted traversal: UPnP IGD & NAT-PMP",
        est: "~11 min",
        blocks: [
          {
            p: "T04 gave you two ways past a NAT: *trick* it (hole punching) or *pay* a relay. There is a third, often better where it works: **ask the gateway politely to forward a port.** If the router speaks a port-control protocol, you request 'map external port X to my internal port Y for N seconds', and now you own a **stable, publicly reachable, inbound-capable endpoint** — no STUN dance, no keepalives to hold the mapping open, no relay tax. That is exactly what a node needs if it is going to *serve* as a rendezvous or relay for others (the community/public shared node of T05).",
          },
          {
            p: "Two protocols cover almost every home gateway. **UPnP IGD** (Internet Gateway Device) is the old, ubiquitous consumer-router protocol: SOAP over HTTP on the LAN, the gateway discovered by SSDP multicast. In Rust it is **`igd-next`** (the maintained fork of `igd`): `search_gateway()` finds the router, then `gateway.add_port(protocol, external_port, local_addr, lease_seconds, description)` requests the mapping — the exact call the S03 capstone's R14 rung builds on. **NAT-PMP** (Apple) and its IETF successor **PCP** (Port Control Protocol, RFC 6887) are the simpler, modern alternative: compact binary UDP requests straight to the gateway on port 5351, with a lifetime you renew. Rust: the **`natpmp`** crate, or **`crab_nat`** for pure-Rust NAT-PMP *and* PCP with automatic fallback.",
          },
          {
            diagram: {
              kind: "topo",
              title: "Ask the NAT for a door",
              nodes: [
                { id: "p", label: "you", sub: "192.168.1.20:51820", x: 0, y: 1, tone: "acc" },
                {
                  id: "g",
                  label: "gateway",
                  sub: "UPnP / NAT-PMP",
                  x: 1,
                  y: 1,
                  tone: "l3",
                  shape: "round",
                },
                {
                  id: "r",
                  label: "remote peer",
                  sub: "dials your ext:51820",
                  x: 2,
                  y: 1,
                  tone: "ok",
                },
              ],
              links: [
                { from: "p", to: "g", label: "AddPortMapping 51820", tone: "ok" },
                { from: "r", to: "g", label: "inbound → mapped port", tone: "ok" },
              ],
              caption:
                "The gateway forwards its external :51820 to you. A remote peer connects inbound directly — no hole punching, no relay. But this only exists where you control the gateway.",
            },
          },
          {
            p: "**How it complements hole punching:** treat a gateway mapping as one more **ICE candidate** (T04L3). Fire the UPnP/NAT-PMP request *in parallel* with STUN and hole punching; if the gateway obliges, you have a candidate that is *stable* (it does not depend on keepalive traffic) and *accepts inbound* (unlike a punched hole, which needs both sides active) — so ICE will rightly prefer it, and it slots in as a rung *before* you pay for a relay. It is cheap to try and pure upside when it lands.",
          },
          {
            p: "**Why you can never depend on it.** On **carrier-grade NAT** — most mobile data, and a growing share of home ISPs — there is no gateway *you* control: the address-sharing NAT lives deep in the carrier's network and speaks neither UPnP nor NAT-PMP to you, which is exactly why the T04 relay fallback exists. UPnP is also **frequently disabled** by policy: it is a notorious malware vector (any LAN host can silently punch holes; there have been WAN-exposed-IGD CVEs), so enterprise and security-conscious networks turn it off. And every mapping is **soft state** — it carries a lease and the router forgets it on reboot, so you must renew before expiry (DHCP's discipline, N15; the mesh's soft-state cadence, T05) and remove it cleanly on exit. Request the minimum, lease it short, tear it down.",
          },
          {
            note: "This is the T04/T06 rung the S03 capstone integrates as R14: `igd-next` opening and verifying a UDP mapping on the local router as a companion to R12's relay fallback — reference implementation with a mock-gateway test in labs/capstone/src/upnp.rs. EasyTier likewise uses UPnP/IGD port mapping to improve reachability (github.com/EasyTier/EasyTier, LGPL-3.0 — link and read). The crates named here (igd-next, natpmp, crab_nat) are separate works under their own licenses.",
            label: "capstone rung R14",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "t06e1",
        kind: "CODE LAB",
        title: "Wrap a tunnel in a TCP frame reader",
        type: "blank",
        prompt:
          "Fill the blanks to read one length-prefixed frame off a TCP tunnel carriage — the read path that turns a byte stream back into whole tunnel packets.",
        code: "use tokio::io::AsyncReadExt;\n\n// Wire format: [u32 big-endian length][payload] — the S03 R2 convention.\nlet mut len_buf = [0u8; 4];\nstream.§0§(&mut len_buf).await?;            // pull exactly the 4-byte header\nlet len = u32::§1§(len_buf) as usize;       // decode the big-endian length\n\nlet mut frame = vec![0u8; len];\nstream.read_exact(&mut frame).await?;       // then exactly `len` payload bytes\n// `frame` is now one whole tunnel packet — the message boundary restored.",
        blanks: [
          { opts: ["read_exact", "read", "read_to_end"], a: 0 },
          { opts: ["from_be_bytes", "from_le_bytes", "from_ne_bytes"], a: 0 },
        ],
        why: "`read_exact` is the whole game: plain `read` may return a *partial* read (the classic TCP framing bug — you get 2 of 4 length bytes and misparse), and `read_to_end` drains the entire stream, merging every frame into one. The length is network byte order, so `from_be_bytes` — `from_le_bytes` would read the length backwards and then `read_exact` would block forever waiting for a giant frame that never comes.",
      },
      {
        id: "t06e2",
        kind: "CODE LAB",
        title: "Migrate a live QUIC connection",
        type: "blank",
        prompt:
          "The phone just moved Wi-Fi → LTE. Fill the blanks so the QUIC connection migrates to a fresh socket without tearing down `conn`.",
        code: 'use quinn::Endpoint;\n\n// Bind a socket on the new network path (OS-assigned port).\nlet new_sock = std::net::UdpSocket::bind("0.0.0.0:0")?;\n\n// Swap the endpoint\'s socket under all live connections — this IS the migration.\nendpoint.§0§(new_sock)?;\n\n// `conn` is the SAME connection (named by its QUIC connection ID, not the\n// 4-tuple), so open a stream on it and keep going — no re-handshake.\nlet (mut send, mut recv) = conn.§1§().await?;\nsend.write_all(b"still here").await?;',
        blanks: [
          { opts: ["rebind", "reconnect", "close"], a: 0 },
          { opts: ["open_bi", "connect", "accept"], a: 0 },
        ],
        why: "`endpoint.rebind(sock)` swaps the UDP socket live under every active connection — the client-side trigger for QUIC migration; `reconnect`/`close` would drop the connection and forfeit the whole point. `conn.open_bi()` opens a bidirectional stream on the *existing* connection — `connect` is an `Endpoint` method that starts a *new* connection, and `accept` is the server side. The connection ID is unchanged, so streams survive the move (N11; T03's roam-by-identity).",
      },
      {
        id: "t06e3",
        kind: "MATCH LAB",
        title: "Pick the carriage for the network",
        type: "match",
        prompt:
          "Match each carriage to the network condition it is the right tool for. Each transport buys one property at one cost.",
        pairs: [
          {
            t: "Raw UDP",
            d: "Open network — nothing is blocked; want the leanest, fastest datagram path",
          },
          {
            t: "QUIC (quinn)",
            d: "UDP flows, but the client roams Wi-Fi↔LTE and needs streams that survive the move",
          },
          {
            t: "WSS on 443",
            d: "A corporate proxy blocks UDP and raw TCP; must look exactly like HTTPS to get out",
          },
          {
            t: "KCP",
            d: "A lossy, latency-critical link you effectively own; willing to spend bandwidth to cut delay",
          },
          {
            t: "faketcp",
            d: "A middlebox drops everything that is not TCP, and you run a rooted desktop client",
          },
          {
            t: "UPnP IGD",
            d: "Behind a home router you control; want a stable inbound port without a relay",
          },
        ],
        why: "The axis is the network, not preference: UDP is the default, QUIC upgrades the datagram path with mux + migration (but still needs UDP), WSS is the reachability fallback that vanishes into web traffic, KCP wins the high-loss latency regime at a bandwidth cost, faketcp is the privileged last resort against non-TCP-dropping DPI, and gateway mapping is the traversal aid that only exists where you control the gateway (useless on carrier-grade NAT).",
      },
    ],
    quiz: {
      id: "t06q",
      questions: [
        {
          q: "You tunnel your users' TCP traffic inside a single outer TCP connection to port 443. On a clean link it is fine; on a 3%-loss link throughput collapses far below what raw UDP achieves. Why?",
          opts: [
            "TLS on 443 adds too much per-packet overhead",
            "TCP-over-TCP meltdown: the outer and inner retransmit/backoff loops stack — the outer stalls everything behind a lost segment while the inner also times out and resends",
            "Port 443 is rate-limited by the firewall",
            "The outer TCP connection runs out of sequence numbers",
          ],
          a: 1,
          why: "Two reliable layers fight: the outer TCP holds everything behind a dropped segment (head-of-line) and slows down, while the inner TCP, seeing its packets delayed, times out and retransmits on top — backoffs compound and throughput craters under loss. It is why a stream carriage is a reachability fallback, not a default, and why datagram carriages (UDP/QUIC) are preferred.",
        },
        {
          q: "A corporate network blocks UDP entirely but allows HTTPS. A teammate suggests 'switch the tunnel to QUIC — it's on 443.' Does that fix it?",
          opts: [
            "Yes — QUIC runs on 443 so it passes any HTTPS-allowing firewall",
            "No — QUIC is carried over UDP, so a UDP block stops it too; you need a TCP-based carriage like WSS",
            "Yes — QUIC automatically falls back to TCP inside the same connection",
            "No — QUIC only works on mobile networks",
          ],
          a: 1,
          why: "QUIC rides UDP, so a UDP block stops QUIC as surely as it stops WireGuard — there is no standard QUIC-over-TCP fallback inside the connection. This is the crux of the module: QUIC is the best carriage *where UDP flows* (mux + migration), but the UDP-hostile-network fix is a reliable-stream carriage — WSS on 443, which is genuinely indistinguishable from web traffic.",
        },
        {
          q: "What does QUIC connection migration give a roaming mesh client, and what identifies the connection across the move?",
          opts: [
            "It re-runs the handshake on the new network; the 4-tuple identifies the connection",
            "The connection survives an IP/port change with no re-handshake, because it is identified by its connection ID, not the 4-tuple",
            "It falls back to a relay during the switch; the TLS session ticket identifies it",
            "Nothing — QUIC connections drop and reconnect on any network change",
          ],
          a: 1,
          why: "A QUIC connection is named by its connection ID, so a phone hopping Wi-Fi→LTE (or a NAT rebinding your port) keeps its streams alive — the client rebinds its socket, the server validates the new path, and the same connection continues. It is WireGuard's roam-by-identity (T03) built into the mainstream transport (N11).",
        },
        {
          q: "On a satellite link with 4% loss carrying a latency-sensitive tunnel, KCP outperforms QUIC's default congestion control. What is the mechanism, and the cost?",
          opts: [
            "KCP compresses packets; the cost is CPU",
            "KCP treats loss as loss (not congestion) and retransmits fast on skipped ACKs without backing off — at the cost of ~10–20% more bandwidth and unfairness to neighbours",
            "KCP encrypts more efficiently; the cost is weaker security",
            "KCP uses TCP instead of UDP; the cost is meltdown",
          ],
          a: 1,
          why: "Default congestion control reads the 4% loss as congestion and backs off — wrong when the loss is just an unreliable link. KCP resends aggressively on skipped ACKs, ACKs immediately, and backs off gently (RTO ×1.5), buying ~30–40% lower latency for ~10–20% more bandwidth. The catch: it is antisocial, so reserve it for links you own or that are effectively dedicated.",
        },
        {
          q: "Your client opens a stable inbound port via UPnP at home, but the same code does nothing on a phone's cellular data. Why — and what is UPnP's relationship to hole punching?",
          opts: [
            "Cellular blocks UPnP's port; use a different external port",
            "Carrier-grade NAT has no gateway the client controls, so there is nothing to ask — UPnP/NAT-PMP are a traversal *aid* where you own the gateway, complementing hole punching and relay elsewhere",
            "UPnP only works over IPv6, which cellular lacks",
            "The phone's OS forbids all port mappings for security",
          ],
          a: 1,
          why: "UPnP IGD and NAT-PMP ask *your* gateway to forward a port — great at home for a stable, inbound-capable endpoint, and a first-class ICE candidate alongside STUN. But carrier-grade NAT lives deep in the operator's network and answers to no one on your side, so on mobile you are back to hole punching plus the relay fallback (T04). It complements traversal; it never replaces it.",
        },
      ],
    },
  },
];
