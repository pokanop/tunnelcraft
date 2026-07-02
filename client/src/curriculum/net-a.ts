import type { Module } from "./types";

/* Networking fundamentals — new modules A: link layer, IP deep dive, subnetting mastery */

export const NET_A: Module[] = [
  {
    id: "n02",
    code: "N02",
    title: "Wires, Frames & Switches",
    layers: ["L1", "L2"],
    est: "~70 min",
    tag: "Physical media, Ethernet framing, MAC learning, VLANs, and ARP — the floor everything else stands on.",
    lessons: [
      {
        id: "n02l1",
        title: "Signals become bits",
        est: "~10 min",
        blocks: [
          {
            p: "Every packet you will ever route is, at the bottom, a physical phenomenon: voltage transitions on copper, light pulses in fiber, radio symbols in the air. You don't need the physics — you need the *vocabulary that describes its limits*, because those limits surface as user-visible behavior.",
          },
          {
            ul: [
              "**Bandwidth** — how many bits per second the link can carry. A capacity, like pipe diameter.",
              "**Throughput** — how many bits per second you actually get after protocol overhead, loss, and congestion. Always ≤ bandwidth.",
              "**Latency** — how long one bit takes to cross. Ruled by distance and the speed of light; more bandwidth does not reduce it.",
              "**Jitter** — variation in latency. The enemy of calls and games, mostly irrelevant to downloads.",
            ],
          },
          {
            p: "**Duplex** matters more than people expect: modern switched Ethernet is full-duplex (both directions simultaneously); Wi-Fi is effectively half-duplex — the medium is shared air, one transmitter at a time per channel. That is why 'my Wi-Fi is 866 Mbps' never behaves like wired 866 Mbps.",
          },
          {
            note: "Latency vs bandwidth is the most useful instinct in this lesson. A satellite link can have huge bandwidth and terrible latency; a LAN cable has modest bandwidth and superb latency. A VPN adds latency (extra hops, encryption) while mostly preserving bandwidth — knowing which one a user is complaining about is half of every performance ticket.",
            label: "diagnosis instinct",
          },
        ],
      },
      {
        id: "n02l2",
        title: "The Ethernet frame",
        est: "~10 min",
        blocks: [
          {
            p: "Ethernet is the L2 contract for nearly every wired network and, with cosmetic changes, Wi-Fi too. A frame wraps your IP packet with addressing for the *local segment only*: a 6-byte **destination MAC**, 6-byte **source MAC**, a 2-byte **EtherType** saying what's inside (0x0800 IPv4, 0x86DD IPv6, 0x0806 ARP), the payload, and a trailing **FCS** checksum. Corrupted frames are silently dropped — recovery is someone else's job (hello, TCP).",
          },
          {
            diagram: {
              kind: "packet",
              title: "Ethernet II frame",
              caption:
                "The L2 envelope spans one segment only — every router hop strips it and writes a fresh one around the same IP packet.",
              segs: [
                { label: "Dst MAC", sub: "6 B — read first", tone: "l2" },
                { label: "Src MAC", sub: "6 B — learned", tone: "l2" },
                { label: "EtherType", sub: "0x0800 = IPv4", tone: "acc" },
                { label: "Payload", sub: "IP packet · ≤1500 B (MTU)", tone: "l3" },
                { label: "FCS", sub: "checksum", tone: "dim" },
              ],
            },
          },
          {
            p: "MAC addresses are flat, burned-in-ish identifiers (first three bytes = vendor). They are **not routable** — they never leave the local segment. Every router hop *rewrites* the frame: new source MAC (the router's), new destination MAC (the next hop), same inner IP packet. L2 addressing is per-hop; L3 addressing is end-to-end. Internalize that split and traceroute, ARP, and 'why does my sniffer show the gateway's MAC?' all make sense.",
          },
          {
            ul: [
              "**Unicast** — one specific MAC.",
              "**Broadcast** — ff:ff:ff:ff:ff:ff, delivered to everyone on the segment. ARP and DHCP discovery (N15) live here.",
              "**Multicast** — a group; the low bit of the first byte is set. IPv6 neighbor discovery uses it instead of broadcast.",
            ],
          },
          {
            p: "Standard Ethernet payload is capped at **1500 bytes** — the MTU you met in N01. The frame itself is a bit bigger (headers + FCS), which is why 'MTU 1500' and 'frame size 1518' are both correct statements about the same wire.",
          },
        ],
      },
      {
        id: "n02l3",
        title: "Switches: MAC learning",
        est: "~10 min",
        blocks: [
          {
            p: "A switch is a MAC-address-indexed packet mover. Its algorithm fits in three lines: **learn** — record the source MAC of every arriving frame against the port it arrived on; **forward** — if the destination MAC is in the table, send the frame out that one port; **flood** — if unknown (or broadcast), send it out every port except the arrival one.",
          },
          {
            p: "That's it. No configuration, no addresses of its own required, self-healing as devices move. The MAC table entries age out in minutes, so stale entries fix themselves. Almost everything a switch does — and almost every switch pathology — falls out of those three verbs.",
          },
          {
            p: "Two domain words you must keep straight: a **collision domain** is where transmissions can physically interfere (each switch port is its own — collisions are essentially extinct on switched full-duplex networks); a **broadcast domain** is how far a broadcast frame reaches — an entire switched LAN is one, and **only a router (or VLAN) ends it**. Broadcast domains that grow too large drown in ARP/DHCP chatter; that is the problem VLANs exist to cut up.",
          },
          {
            note: "Loops are the switch killer: two switches cabled in a circle will flood broadcasts to each other forever — a broadcast storm that melts the LAN in seconds. Spanning Tree Protocol (STP) exists solely to detect loops and block redundant ports. You only need to know it exists and that a 'blocked port' is it doing its job.",
            label: "the loop",
          },
        ],
      },
      {
        id: "n02l4",
        title: "VLANs: many networks, one switch",
        est: "~10 min",
        blocks: [
          {
            p: "A **VLAN** partitions one physical switch into several isolated broadcast domains. Port 1–8 = VLAN 10 (engineering), ports 9–16 = VLAN 20 (guests): frames never cross between them inside the switch, exactly as if they were separate hardware. Traffic between VLANs must go through a **router** — which is precisely where your firewall rules get their chance.",
          },
          {
            p: "Between switches, a **trunk** port carries multiple VLANs at once by inserting an **802.1Q tag** — 4 extra bytes in the Ethernet header holding the VLAN ID (1–4094). Access ports (to laptops, printers) are untagged; the switch assigns their VLAN and strips tags. The tag exists only switch-to-switch.",
          },
          {
            diagram: {
              kind: "topo",
              title: "two VLANs, two switches, one router",
              caption:
                "Same hardware, two isolated broadcast domains: the tagged trunk keeps VLANs separate between switches, and only the router carries traffic across.",
              nodes: [
                { id: "e1", label: "Eng PC", sub: "VLAN 10", tone: "l2", x: 0, y: 0 },
                { id: "g1", label: "Guest PC", sub: "VLAN 20", tone: "dim", x: 0, y: 2 },
                { id: "swa", label: "Switch A", x: 1, y: 1 },
                { id: "e2", label: "Eng PC", sub: "VLAN 10", tone: "l2", x: 2, y: 0 },
                { id: "swb", label: "Switch B", x: 2, y: 1 },
                { id: "rtr", label: "Router", sub: "inter-VLAN", tone: "l3", x: 3, y: 1 },
              ],
              links: [
                { from: "e1", to: "swa", label: "access", tone: "l2" },
                { from: "g1", to: "swa", label: "access", tone: "dim" },
                { from: "swa", to: "swb", label: "trunk · 802.1Q", tone: "acc" },
                { from: "e2", to: "swb", label: "access", tone: "l2" },
                { from: "swb", to: "rtr", label: "routes 10 ↔ 20", tone: "l3" },
              ],
            },
          },
          {
            p: "Why you care as a tunnel engineer: VLANs are the classic **segmentation** tool — guest Wi-Fi that can't see the file server, IoT junk quarantined from workstations. Zero-trust posture logic (S02) is in many ways the modern, identity-based descendant of 'put it in a different VLAN'.",
          },
        ],
      },
      {
        id: "n02l5",
        title: "ARP: gluing L2 to L3",
        est: "~10 min",
        blocks: [
          {
            p: "You know the destination *IP*; the frame needs a destination *MAC*. **ARP** answers the question. Host broadcasts: 'who has 192.168.1.7?' The owner replies unicast: '192.168.1.7 is at aa:bb:cc:dd:ee:ff.' The answer is cached (check yours: `ip neigh` / `arp -a`) for a few minutes.",
          },
          {
            diagram: {
              kind: "seq",
              title: "ARP resolution",
              caption:
                "The question is broadcast so anyone can answer — and nothing verifies who does; that gap is ARP spoofing.",
              actors: [
                { id: "a", label: "Host .50", sub: "needs a MAC", tone: "acc" },
                { id: "b", label: "Host .7", tone: "ok" },
              ],
              steps: [
                { note: "cache miss for 192.168.1.7" },
                {
                  from: "a",
                  to: "b",
                  label: "who has 192.168.1.7?",
                  sub: "broadcast — everyone hears",
                  dashed: true,
                },
                {
                  from: "b",
                  to: "a",
                  label: "is-at aa:bb:cc:dd:ee:ff",
                  sub: "unicast reply",
                  tone: "ok",
                },
                { note: "cached a few minutes — ip neigh / arp -a" },
              ],
            },
          },
          {
            p: "The subnet decision from N01 decides *what you ARP for*: destination in my subnet → ARP for the destination itself; destination elsewhere → ARP for the **default gateway** and send the frame to the router. This is the exact moment where 'is this address local?' becomes physical behavior.",
          },
          {
            p: "ARP has **no authentication**. Any device can shout '192.168.1.1 is at *my* MAC' — **ARP spoofing** — and become the man in the middle for the whole LAN. Gratuitous ARP (announcing yourself unasked) is legitimate (failover uses it) *and* the attack vector. This is a standing argument for end-to-end encryption: on a hostile LAN, L2 belongs to the attacker; AEAD (T02) is what keeps that from mattering.",
          },
          {
            code: {
              lang: "sh",
              title: "watch ARP happen",
              body: "# clear one entry, ping it, and watch the resolution:\nsudo ip neigh flush dev eth0\nsudo tcpdump -i eth0 -n arp &\nping -c1 192.168.1.7\n# who-has 192.168.1.7 tell 192.168.1.50\n# reply 192.168.1.7 is-at aa:bb:cc:dd:ee:ff",
            },
          },
        ],
      },
    ],
    exercises: [
      {
        id: "n02e1",
        type: "match",
        title: "Domain vocabulary lock-in",
        kind: "MATCH LAB",
        prompt:
          "Match each L1/L2 term to what it actually means. These five are the load-bearing vocabulary of every switching conversation.",
        pairs: [
          {
            t: "Broadcast domain",
            d: "How far a broadcast frame reaches — ended only by a router or VLAN boundary",
          },
          {
            t: "Collision domain",
            d: "Where transmissions can physically interfere — one per switch port today",
          },
          { t: "Trunk port", d: "Switch-to-switch link carrying many VLANs via 802.1Q tags" },
          { t: "MAC table", d: "The switch's learned mapping of addresses to ports" },
          {
            t: "Gratuitous ARP",
            d: "Announcing your own IP-to-MAC binding unasked — used by failover and by attackers",
          },
        ],
        why: "Broadcast vs collision domain is a classic certification trap; trunk vs access and the MAC table are daily working vocabulary.",
      },
      {
        id: "n02e2",
        type: "order",
        title: "First contact on a LAN",
        kind: "SEQUENCE LAB",
        prompt:
          "A freshly booted laptop pings another host on the same subnet for the first time. Order what happens on the wire.",
        items: [
          "OS routing decision: destination is in my subnet — deliver directly",
          "ARP cache miss: broadcast 'who has 192.168.1.7?'",
          "Target replies unicast with its MAC; cache updated",
          "ICMP echo request framed with the target's MAC and sent",
          "Switch, having learned both MACs, forwards frames port-to-port",
        ],
        why: "Routing decision → ARP → frame → switch. The same dance precedes nearly every 'first packet' on Ethernet; only the ARP target changes (host vs gateway).",
      },
      {
        id: "n02e_hex",
        type: "hex",
        title: "Read a raw Ethernet frame",
        kind: "DECODE LAB",
        prompt:
          "Here are the first 20 bytes of a frame exactly as they left the wire: a 14-byte **Ethernet II header** followed by the start of the payload. Each question highlights the bytes it's asking about — decode them by eye, no tools.",
        why: "Every capture you'll ever open starts with these 14 bytes. Knowing the layout cold — dst, src, EtherType, payload — is what lets you read a hex dump the way Wireshark does.",
        bytes: "00 1B 44 11 3A B7 A4 5E 60 D2 91 0C 08 00 45 00 00 54 1A 2B",
        questions: [
          {
            q: "The frame opens with six bytes of address. Which address is this, and whose?",
            opts: [
              "Destination MAC 00:1B:44:11:3A:B7 — where the frame is headed",
              "Source MAC 00:1B:44:11:3A:B7 — who sent it",
              "The frame check sequence (FCS)",
            ],
            a: 0,
            span: [0, 6],
            why: "Destination comes *first* on the wire — deliberately, so a switch can start picking the output port before the rest of the frame has even arrived (cut-through switching).",
          },
          {
            q: "Bytes 6–11 are the next six. What are they?",
            opts: [
              "The destination IP address",
              "Source MAC A4:5E:60:D2:91:0C — the sending NIC",
              "A VLAN tag",
            ],
            a: 1,
            span: [6, 12],
            why: "Source MAC follows destination. This is the address the switch *learns* from — it maps A4:5E:60:D2:91:0C to the ingress port in its MAC table.",
          },
          {
            q: "Bytes 12–13 hold 0x0800. What is the receiver told?",
            opts: [
              "The frame is 2048 bytes long",
              "The payload is IPv4 — this is an EtherType, not a length",
              "An 802.1Q VLAN tag starts here",
            ],
            a: 1,
            span: [12, 14],
            why: "Values ≥ 0x0600 in this slot are EtherTypes: 0x0800 = IPv4, 0x0806 = ARP, 0x86DD = IPv6, 0x8100 = VLAN tag. This byte pair is how the kernel picks which L3 handler gets the payload.",
          },
          {
            q: "At which byte offset does the Layer 3 payload begin in this frame?",
            opts: [
              "Offset 12 — immediately after the two MACs",
              "Offset 14 — after dst MAC (6) + src MAC (6) + EtherType (2)",
              "Offset 20 — Ethernet headers are always 20 bytes",
            ],
            a: 1,
            span: [14, 20],
            why: "6 + 6 + 2 = 14: the untagged Ethernet II header size to memorize. An 802.1Q tag (0x8100 at offset 12) would insert 4 bytes and push the payload to offset 18.",
          },
          {
            q: "The first payload byte is 0x45. Is that consistent with the EtherType?",
            opts: [
              "Yes — 0x45 reads as IP version 4 with a 20-byte header, exactly what EtherType 0x0800 promised",
              "No — 0x45 marks an ARP request",
              "It's meaningless padding",
            ],
            a: 0,
            span: [14, 15],
            why: "Layers agree or the packet is garbage: EtherType said IPv4, and the first payload nibble is 4. Cross-checking like this is how you spot corrupt or mis-dissected captures.",
          },
        ],
      },
    ],
    quiz: {
      id: "n02q",
      questions: [
        {
          q: "A frame crosses three routers on its way to a server. How many times is the destination MAC address rewritten?",
          opts: [
            "Zero — MACs are end-to-end",
            "At every hop — L2 addressing only ever spans one segment",
            "Once, at the first router",
          ],
          a: 1,
          why: "Each router strips the frame and builds a new one for the next segment. The IP packet inside is what survives end-to-end.",
        },
        {
          q: "A switch receives a frame for a MAC it has never seen. What does it do?",
          opts: [
            "Drops it",
            "Floods it out all ports except the one it arrived on",
            "Sends an ARP request",
          ],
          a: 1,
          why: "Flooding-when-unknown is the third verb of switching. ARP is a *host* behavior, not a switch behavior — a classic confusion.",
        },
        {
          q: "Hosts in VLAN 10 and VLAN 20 on the same switch need to exchange packets. What is required?",
          opts: [
            "Nothing — same switch means same network",
            "A router (or L3 switch) between the VLANs",
            "A trunk port",
          ],
          a: 1,
          why: "VLANs are separate broadcast domains; crossing them is routing. Trunks carry multiple VLANs between switches but do not connect them to each other.",
        },
        {
          q: "Why is ARP spoofing possible?",
          opts: [
            "ARP replies are encrypted with a weak cipher",
            "ARP has no authentication — any host can claim any IP-to-MAC binding",
            "Switches forward ARP incorrectly",
          ],
          a: 1,
          why: "ARP predates the hostile internet. The durable fix isn't fixing ARP — it's making L2 position worthless via end-to-end encryption.",
        },
      ],
    },
  },
  {
    id: "n04",
    code: "N05",
    title: "IP, ICMP & IPv6",
    layers: ["L3"],
    est: "~70 min",
    tag: "The IPv4 header for real, ICMP as the network's voice, and the IPv6 world where NAT never happened.",
    lessons: [
      {
        id: "n04l1",
        title: "Reading the IPv4 header",
        est: "~10 min",
        blocks: [
          {
            p: "Twenty bytes run the internet. Most IPv4 header fields you can ignore forever; five you will meet constantly. **TTL** — decremented by every router, packet discarded at zero; exists to kill routing loops, exploited by traceroute. **Protocol** — what's inside: 6 = TCP, 17 = UDP, 1 = ICMP; this is how the receiving stack demultiplexes. **Total Length**, **Source**, **Destination** — self-explanatory but remember source is *claimed*, not proven.",
          },
          {
            p: "Then the fragmentation trio: **Identification**, **flags** (the one that matters: **DF**, Don't Fragment), **Fragment Offset**. A router facing a packet bigger than the next link's MTU may split it into fragments the destination reassembles — unless DF is set, in which case it drops the packet and sends back an ICMP 'Fragmentation Needed' message.",
          },
          {
            diagram: {
              kind: "packet",
              title: "IPv4 header — 20 bytes",
              caption:
                "Five working fields plus the fragmentation trio; the dimmed ones you can mostly ignore forever.",
              segs: [
                { label: "Ver·IHL", sub: "0x45" },
                { label: "TOS", tone: "dim" },
                { label: "Length" },
                { label: "ID·Flags·Off", sub: "DF bit", tone: "acc" },
                { label: "TTL", sub: "dies at 0", tone: "acc" },
                { label: "Proto", sub: "6·17·1", tone: "acc" },
                { label: "Csum", tone: "dim" },
                { label: "Src IP", sub: "claimed!", tone: "l3" },
                { label: "Dst IP", tone: "l3" },
              ],
            },
          },
          {
            p: "Modern practice: **fragmentation is treated as pathological**. Fragments hurt performance, break stateful firewalls and NAT, and are a classic attack vector — lose one fragment and the whole packet is lost after a reassembly timeout. So everyone sets DF and instead performs **Path MTU Discovery**: send full-size packets with DF, listen for 'Fragmentation Needed' errors, shrink accordingly. Which works beautifully — until a firewall blocks the ICMP errors and creates a **PMTUD black hole**: small packets pass, big ones vanish. This is the mechanism behind the N01 tunnel-MTU advice: clamping to 1420 *avoids ever needing* the fragile discovery dance.",
          },
        ],
      },
      {
        id: "n04l2",
        title: "ICMP: how the network talks back",
        est: "~10 min",
        blocks: [
          {
            p: "IP delivers silently or fails silently — **ICMP** is the side channel where the network reports its problems. It rides inside IP (protocol 1) and its messages are (type, code) pairs. The working set: **Echo Request/Reply** (ping), **Destination Unreachable** (with codes: network, host, *port* unreachable — the last one sent by end hosts when nothing listens on a UDP port, and famously how traceroute knows it's done), **Time Exceeded** (TTL hit zero), and **Fragmentation Needed** (the PMTUD signal).",
          },
          {
            p: "**Ping** is ICMP echo: measures reachability and round-trip time. **Traceroute** is the elegant hack: send probes with TTL=1, 2, 3, …; each router that kills a probe returns Time Exceeded *from its own address*, drawing the path hop by hop. Latency jumping at hop N tells you roughly where the slowness lives (with caveats you'll learn in N16: routers deprioritize generating ICMP, so a slow *hop* with fast *later hops* is noise, not signal).",
          },
          {
            diagram: {
              kind: "seq",
              title: "traceroute, mechanically",
              caption:
                "Traceroute weaponizes loop prevention: every router that discards a probe reveals its address in the ICMP error.",
              actors: [
                { id: "h", label: "Host", tone: "acc" },
                { id: "r1", label: "R1", tone: "l3" },
                { id: "r2", label: "R2", tone: "l3" },
                { id: "d", label: "Dest", tone: "ok" },
              ],
              steps: [
                { from: "h", to: "r1", label: "probe TTL=1" },
                {
                  from: "r1",
                  to: "h",
                  label: "Time Exceeded",
                  sub: "from R1 — hop 1",
                  tone: "bad",
                },
                { from: "h", to: "r2", label: "probe TTL=2" },
                {
                  from: "r2",
                  to: "h",
                  label: "Time Exceeded",
                  sub: "from R2 — hop 2",
                  tone: "bad",
                },
                { note: "TTL=3, 4, … each probe dies one router deeper" },
                { from: "h", to: "d", label: "probe TTL=3" },
                {
                  from: "d",
                  to: "h",
                  label: "reply",
                  sub: "destination answers — path complete",
                  tone: "ok",
                },
              ],
            },
          },
          {
            p: "Security folklore says 'block all ICMP.' Reality: blocking Echo is a cosmetic choice; blocking **Fragmentation Needed** breaks PMTUD and creates mystery outages; blocking Time Exceeded blinds traceroute. The professional stance is *filter ICMP thoughtfully* — rate-limit, allow the error types the internet's plumbing depends on.",
          },
        ],
      },
      {
        id: "n04l3",
        title: "IPv6 addressing: a bigger, cleaner world",
        est: "~12 min",
        blocks: [
          {
            p: "IPv4 has ~4.3 billion addresses; IPv6 has 2¹²⁸ — enough to never think about scarcity again, which quietly deletes NAT (N11) from the architecture. An address is eight 16-bit hex groups: `2001:0db8:0000:0000:0000:0000:0000:0001`. Two compressions: drop leading zeros in each group, and collapse **one** run of all-zero groups to `::` → `2001:db8::1`.",
          },
          {
            ul: [
              "**Global unicast (GUA)** — `2000::/3`, the public internet. Your ISP typically delegates a /56 or /64 *per network*; a /64 is the standard subnet size (yes: one subnet gets 2⁶⁴ addresses; the waste is deliberate, it makes SLAAC possible).",
              "**Link-local** — `fe80::/10`, auto-generated on every interface, valid only on its segment. IPv6's plumbing (routing protocols, neighbor discovery, your default gateway!) runs over link-local. An interface always has one, even with no network config at all.",
              "**Unique local (ULA)** — `fc00::/7`, the RFC 1918 analog for private internal addressing.",
              "**Multicast** — `ff00::/8`. There is **no broadcast in IPv6**; every 'everyone' job moved to targeted multicast groups.",
            ],
          },
          {
            p: "A machine routinely holds *many* IPv6 addresses at once — link-local, a stable global one, plus rotating **privacy addresses** (temporary, random) used for outbound connections so your hardware-derived address doesn't become a tracking cookie. Code that assumes 'one interface, one address' is already wrong.",
          },
        ],
      },
      {
        id: "n04l4",
        title: "IPv6 plumbing: NDP, SLAAC & dual-stack",
        est: "~12 min",
        blocks: [
          {
            p: "ARP is gone; **Neighbor Discovery (NDP)** replaces it using ICMPv6 (yes — *ICMPv6 is load-bearing*; firewall it away and IPv6 simply stops). **Neighbor Solicitation/Advertisement** = ARP's who-has/is-at, but sent to a solicited-node multicast group instead of broadcast, so only ~the right host is disturbed. **Router Solicitation/Advertisement** = routers announcing 'here is the prefix, here is your gateway (my link-local address), here are your options.'",
          },
          {
            p: "**SLAAC** (stateless autoconfiguration) falls out: host hears a Router Advertisement carrying prefix `2001:db8:1::/64`, appends a self-generated 64-bit suffix, duplicate-checks via NDP, done — an address with **no DHCP server at all** (the stateful IPv4 way of getting one is the next module, N15). DHCPv6 still exists (enterprises like the audit trail, and RAs can delegate DNS options to it — N15 closes with the contrast), but the default posture of IPv6 is 'the network describes itself.'",
          },
          {
            p: "**Dual-stack** is the deployment reality: hosts run IPv4 and IPv6 simultaneously, and applications pick per-connection. **Happy Eyeballs** is the picking algorithm: try IPv6, give it a ~250 ms head start, race IPv4, use whichever connects — so broken IPv6 degrades to 'slightly slower first connection' instead of an outage. For your VPN client this doubles everything: two address families to route (`::/0` alongside `0.0.0.0/0` — T03's AllowedIPs), two DNS record types, and the classic leak where the tunnel captures IPv4 while native IPv6 walks around it. Handle both or leak.",
          },
          {
            note: "The '::/0 too' rule is one of the most common real-world VPN bugs: full-tunnel IPv4, forgotten IPv6, and every AAAA-resolving site bypasses the tunnel. Your kill-switch tests (S01) must include IPv6 traffic.",
            label: "the v6 leak",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "n04e1",
        type: "order",
        title: "Traceroute, mechanically",
        kind: "SEQUENCE LAB",
        prompt: "Order the mechanism that lets traceroute draw the path to a destination.",
        items: [
          "Send a probe with TTL = 1",
          "First router decrements TTL to 0, drops the probe",
          "That router sends back ICMP Time Exceeded from its own address — hop 1 revealed",
          "Repeat with TTL = 2, 3, … each probe dying one router deeper",
          "A probe finally reaches the destination, which answers directly — path complete",
        ],
        why: "Traceroute weaponizes the loop-prevention field. Every hop you see is a router confessing its address while executing packet discard.",
      },
      {
        id: "n04e_hex",
        type: "hex",
        title: "Decode an IPv4 header byte by byte",
        kind: "DECODE LAB",
        prompt:
          "Twenty bytes — one complete **IPv4 header**, no options, lifted from a real-shaped UDP datagram (total length 60: this header plus 40 bytes of UDP). Every answer is literally in the highlighted bytes; convert hex to decimal in your head.",
        why: "Fields like TTL, DF, and protocol stop being trivia the moment you can find them at fixed offsets in raw bytes — that's the skill behind reading tcpdump -x output and writing packet filters.",
        bytes: "45 00 00 3C 1C 46 40 00 40 11 4C 81 C0 A8 01 32 08 08 08 08",
        questions: [
          {
            q: "Byte 0 is 0x45. What two facts does it pack?",
            opts: [
              "Version 4, IHL 5 → a 20-byte header with no options",
              "Version 4, TTL 5 — this packet is nearly dead",
              "The header is 0x45 = 69 bytes long",
            ],
            a: 0,
            span: [0, 1],
            why: "High nibble = version (4), low nibble = header length in 32-bit words (5 × 4 = 20 bytes). 0x45 opens almost every IPv4 packet on the internet — options are rare.",
          },
          {
            q: "Bytes 6–7 read 0x4000. What do the flags say?",
            opts: [
              "Don't Fragment is set, offset 0 — routers must drop this rather than fragment it (and send ICMP Fragmentation Needed back)",
              "More Fragments is set — this is the first piece of a fragmented packet",
              "Fragment offset 16384 — this is a middle fragment",
            ],
            a: 0,
            span: [6, 8],
            why: "The top three bits are flags: 0x4000 = binary 010… = DF set, MF clear, offset 0. DF is what makes PMTUD work — and what black-holes big packets when ICMP is filtered.",
          },
          {
            q: "Byte 8 is 0x40. How many hops does this packet have left?",
            opts: ["40", "64 — 0x40 = 4 × 16 = 64", "128"],
            a: 1,
            span: [8, 9],
            why: "TTL 64 is the Linux/macOS default, so this packet hasn't been routed yet — an unrouted Windows box would show 0x80 (128). Received TTLs let you estimate hop counts.",
          },
          {
            q: "Byte 9 is 0x11. What's riding inside this packet?",
            opts: ["TCP (protocol 6)", "UDP — 0x11 = 17", "ICMP (protocol 1)"],
            a: 1,
            span: [9, 10],
            why: "The protocol field picks the L4 handler: 1 = ICMP, 6 = TCP, 17 = UDP. 0x11 hex is 17 decimal — hex-to-decimal on this byte is a daily reflex.",
          },
          {
            q: "Bytes 12–15: C0 A8 01 32. Who sent this packet?",
            opts: ["192.168.1.50", "192.168.0.50", "172.16.1.50"],
            a: 0,
            span: [12, 16],
            why: "One byte per octet: C0 = 192, A8 = 168, 01 = 1, 32 = 50. RFC 1918 space — a host on a home or office LAN.",
          },
          {
            q: "Bytes 16–19: 08 08 08 08. Where is it going?",
            opts: ["80.80.80.80", "8.8.8.8 — Google's public DNS", "0.8.0.8"],
            a: 1,
            span: [16, 20],
            why: "0x08 = 8, four times over. A private host sending UDP to 8.8.8.8 is almost certainly a DNS query — protocol 17 in byte 9 agrees.",
          },
        ],
      },
    ],
    quiz: {
      id: "n04q",
      questions: [
        {
          q: "Big packets vanish on a path while small ones (and ping) work fine. The classic diagnosis?",
          opts: [
            "The destination is rate-limiting",
            "A PMTUD black hole: something blocks ICMP Fragmentation Needed, so DF-flagged full-size packets are silently dropped",
            "TTL is too low",
          ],
          a: 1,
          why: "The signature of over-zealous ICMP filtering. Tunnels dodge it by clamping MTU up front instead of relying on discovery.",
        },
        {
          q: "Your IPv6 default gateway shows as fe80::1. Is that broken?",
          opts: [
            "Yes — gateways need global addresses",
            "No — IPv6 routing plumbing deliberately runs over link-local addresses",
            "Only if SLAAC is disabled",
          ],
          a: 1,
          why: "Router Advertisements come from the router's link-local address, and that's what goes in your route table. Surprising, and completely normal.",
        },
        {
          q: "What replaced ARP's broadcast in IPv6?",
          opts: [
            "Nothing — IPv6 still broadcasts",
            "Neighbor Discovery over ICMPv6, using solicited-node multicast",
            "DHCPv6",
          ],
          a: 1,
          why: "No broadcast exists in IPv6 at all. This is also why 'block all ICMP' is fatal to IPv6 — NDP *is* ICMPv6.",
        },
        {
          q: "A standard IPv6 LAN subnet is a /64 — 18 quintillion addresses for one office. Why so 'wasteful'?",
          opts: [
            "A design error kept for compatibility",
            "The fixed 64-bit host portion is what lets SLAAC self-generate addresses without any server",
            "To make scanning easier",
          ],
          a: 1,
          why: "Scarcity thinking doesn't transfer. The /64 convention buys serverless autoconfiguration — and incidentally makes address-scanning attacks impractical.",
        },
      ],
    },
  },
  {
    id: "n05",
    code: "N07",
    title: "Subnetting Mastery",
    layers: ["L3"],
    est: "~50 min",
    tag: "Binary fluency, VLSM, aggregation, and the special ranges — subnet math as a reflex, not a ritual.",
    lessons: [
      {
        id: "n05l1",
        title: "The magic number method",
        est: "~10 min",
        blocks: [
          {
            p: "You did /24-ish math in N01. Professionals need any prefix, fast, in their head. The trick: only one octet is ever 'interesting' — the one the prefix boundary cuts through. /26 cuts the 4th octet, /20 cuts the 3rd, /12 cuts the 2nd. Every octet left of the cut is frozen; everything right of it is host space.",
          },
          {
            p: "The **magic number** is 256 minus the mask value in the interesting octet — equivalently, the block size networks repeat at. /26 → mask 192 in that octet → magic 64 → subnets start at 0, 64, 128, 192. Your address's network is *the largest multiple of the magic number ≤ its interesting octet*. Broadcast is the next block start minus one.",
          },
          {
            code: {
              lang: "text",
              title: "worked: 172.19.200.77/20",
              body: "/20 = 16 net bits + 4 more into octet 3  →  interesting octet: 3rd\nmask octet value: 240   →   magic number: 256 − 240 = 16\n3rd-octet blocks: 0,16,32,…,192,208,…   200 falls in the 192 block\nnetwork   = 172.19.192.0\nbroadcast = 172.19.207.255      (next block 208, minus one)\nhosts     = 2^(32−20) − 2 = 4094",
            },
          },
          {
            p: "Powers of two to burn in: /30=4, /29=8, /28=16, /27=32, /26=64, /25=128 addresses (subtract 2 for usable). The infinite drill below is where this becomes reflex — a working engineer answers these in under fifteen seconds.",
          },
        ],
      },
      {
        id: "n05l2",
        title: "VLSM: carving address space like an adult",
        est: "~12 min",
        blocks: [
          {
            p: "Real networks don't use one subnet size. **Variable-Length Subnet Masking** means slicing your allocation into different-sized pieces per need: a /26 for the 50-person office, /29s for server pods, /30s (or /31s) for router-to-router links. The discipline: **allocate largest first**, keep each block aligned to its own size (a /26 must start on a multiple of 64), and leave growth headroom.",
          },
          {
            diagram: {
              kind: "packet",
              title: "carving 10.50.0.0/24",
              caption:
                "Needs of 100, 50, 20 hosts plus two links, allocated largest first — every block starts on a multiple of its own size, and the tail stays free for growth.",
              segs: [
                { label: "eng /25", sub: ".0–.127 · 126 hosts", tone: "l3" },
                { label: "sales /26", sub: ".128–.191 · 62", tone: "l3" },
                { label: "servers /27", sub: ".192–.223 · 30", tone: "l3" },
                { label: "link A /30", sub: ".224–.227", tone: "acc" },
                { label: "link B /30", sub: ".228–.231", tone: "acc" },
                { label: "free", sub: ".232–.255", tone: "dim" },
              ],
            },
          },
          {
            p: "The mirror skill is **aggregation** (supernetting): advertising many contiguous subnets as one shorter prefix. 10.50.0.0/24 through 10.50.3.0/24 summarize as 10.50.0.0/22 — one route instead of four. Aggregation is why the internet's routing table holds ~a million routes instead of billions (N10), and why address plans should be *hierarchical*: regions get big blocks, sites get aligned slices, and summaries fall out naturally.",
          },
          {
            note: "Alignment is the part everyone fumbles: a /22 summary only exists if the four /24s share the same /22 block — 10.50.0–3 do; 10.50.3–6 do not. Same rule as VLSM: every prefix lives on a multiple of its own size.",
            label: "alignment",
          },
        ],
      },
      {
        id: "n05l3",
        title: "Addresses with reserved meanings",
        est: "~10 min",
        blocks: [
          {
            p: "Some ranges never route on the public internet and you must recognize them on sight. **RFC 1918 private**: `10.0.0.0/8`, `172.16.0.0/12` (that's 172.16–172.31 — the /12 trips people), `192.168.0.0/16`. **Loopback**: `127.0.0.0/8`, this machine talking to itself. **Link-local**: `169.254.0.0/16` — the 'DHCP failed (N15)' self-assigned range; seeing it on a client is a diagnosis, not an address. **CGNAT**: `100.64.0.0/10`, carrier-grade NAT space (Tailscale famously squats it for tunnel IPs). **Multicast**: `224.0.0.0/4`. **Documentation**: `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` — for examples, like these lessons use.",
          },
          {
            p: "Two prefix lengths with special idioms: **/32** is a single host — used in route tables to pin one destination (the N01 loop-prevention trick) and in firewall rules to mean 'exactly this machine.' **/31** is the point-to-point special case (RFC 3021): two addresses, no network/broadcast reserved, both usable — standard for router-to-router links, and the reason 'hosts = 2ⁿ − 2' has an asterisk.",
          },
          {
            p: "For your client, range recognition is *routing policy*: split-tunnel configs like 'send RFC 1918 to the corporate tunnel, everything else direct' are three AllowedIPs lines — if you can recite the three blocks cold. The drill below now generates the awkward prefixes (/20s, /12-range questions) that separate ritual from reflex.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "n05e1",
        type: "cidr",
        title: "CIDR trainer — professional tier",
        kind: "LIVE DRILL",
        prompt:
          "Same drill as N01, and it never stops being useful: network, broadcast, usable hosts. Target: under 15 seconds using the magic-number method. New problems forever.",
      },
      {
        id: "n05e2",
        type: "match",
        title: "Special ranges on sight",
        kind: "MATCH LAB",
        prompt:
          "Match each address to what seeing it tells you. Recognition speed here is a genuine professional signal.",
        pairs: [
          { t: "169.254.7.20", d: "DHCP failed — the host self-assigned a link-local address" },
          { t: "172.20.1.9", d: "RFC 1918 private space (inside the 172.16.0.0/12 block)" },
          {
            t: "100.90.14.2",
            d: "CGNAT range 100.64.0.0/10 — carrier NAT, or a tunnel overlay borrowing it",
          },
          {
            t: "203.0.113.50",
            d: "Documentation range — this address is from an example, not a real network",
          },
          {
            t: "10.1.2.3/31",
            d: "Point-to-point link addressing — both addresses usable, no broadcast",
          },
        ],
        why: "172.20.x fooling people into 'public' and 169.254 going unrecognized are two of the most common junior-engineer stumbles.",
      },
      {
        id: "n05e_vlsm",
        type: "vlsm",
        title: "Carve a block: VLSM design",
        kind: "DESIGN LAB",
        prompt:
          "You're handed a parent block and a list of departments with host counts. For each department, pick the **smallest prefix that fits** — the lesson's carving example, generated fresh forever.",
        why: "Real address plans allocate largest-first: sort by size and every subnet lands on its natural alignment boundary automatically. Allocate small pieces first and you fragment the block until the big subnet no longer fits anywhere.",
      },
    ],
    quiz: {
      id: "n05q",
      questions: [
        {
          q: "Which of these is NOT private RFC 1918 space?",
          opts: ["172.31.255.1", "192.168.0.200", "172.32.0.1"],
          a: 2,
          why: "172.16.0.0/12 spans 172.16–172.31 only. 172.32.x.x is public — the /12 boundary is the whole trick of the question.",
        },
        {
          q: "Four networks: 10.8.4.0/24, 10.8.5.0/24, 10.8.6.0/24, 10.8.7.0/24. The correct single summary?",
          opts: ["10.8.4.0/22", "10.8.0.0/22", "10.8.4.0/23"],
          a: 0,
          why: "A /22 holds four /24s and must start on a multiple of 4 in the third octet: 4,5,6,7 share the 10.8.4.0/22 block. Aligned and exact.",
        },
        {
          q: "How many usable host addresses in 192.168.10.64/27?",
          opts: ["32", "30", "62"],
          a: 1,
          why: "/27 → 2^5 = 32 addresses, minus network and broadcast = 30. And 64 is a valid /27 start (multiple of 32).",
        },
      ],
    },
  },
];
