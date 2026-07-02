import type { Module } from "./types";

/* Networking fundamentals — DHCP: the protocol every module name-drops
   (Wi-Fi join sequence, 169.254 diagnosis, SLAAC contrast, WPAD, the ports
   drill) and none of them teach. This one teaches it. */

export const NET_DHCP: Module[] = [
  {
    id: "n15",
    code: "N15",
    title: "DHCP: How Hosts Get Addresses",
    layers: ["L3", "L7"],
    est: "~60 min",
    tag: "DORA, leases and renewal timers, the options that configure everything, relays across subnets, and DHCP as an attack surface your VPN must survive.",
    lessons: [
      {
        id: "n15l1",
        title: "DORA: the bootstrap conversation",
        est: "~12 min",
        blocks: [
          {
            p: "A freshly connected host faces a bootstrapping paradox: it needs an IP address to talk, and it must talk to get one. **DHCP** solves it with broadcast (N02's ff:ff:ff:ff:ff:ff — this is the 'DHCP discovery' that lesson promised) over UDP: client port **68**, server port **67** — the pair from the ports drill, finally explained. The client sends from source IP `0.0.0.0`, because it truthfully has nothing else to say.",
          },
          {
            p: "The exchange is four messages — **DORA**: client broadcasts **DISCOVER** ('any DHCP servers out there?'); every server that hears it broadcasts back an **OFFER** (an address plus config); the client picks one and broadcasts **REQUEST** naming the chosen server and address; that server confirms with **ACK** — or refuses with **NAK**, sending the client back to square one.",
          },
          {
            diagram: {
              kind: "seq",
              title: "DORA with two servers",
              caption:
                "Four broadcasts bootstrap an address from nothing; the broadcast REQUEST doubles as the losing server's notice to reclaim its offer.",
              actors: [
                { id: "c", label: "Client", sub: "0.0.0.0 :68", tone: "acc" },
                { id: "s1", label: "Server 1", sub: ":67", tone: "ok" },
                { id: "s2", label: "Server 2", tone: "dim" },
              ],
              steps: [
                {
                  from: "c",
                  to: "s2",
                  label: "DISCOVER",
                  sub: "broadcast — any servers?",
                  dashed: true,
                },
                { from: "s1", to: "c", label: "OFFER .50", tone: "ok", dashed: true },
                { from: "s2", to: "c", label: "OFFER .99", tone: "dim", dashed: true },
                {
                  from: "c",
                  to: "s2",
                  label: "REQUEST server 1",
                  sub: "broadcast — loser reclaims .99",
                  dashed: true,
                },
                {
                  from: "s1",
                  to: "c",
                  label: "ACK",
                  sub: "mask · gateway · DNS · lease",
                  tone: "ok",
                },
                { note: "ARP-probe the address for duplicates, then use it" },
              ],
            },
          },
          {
            p: "Two details separate understanding from trivia. First: the REQUEST is *broadcast, not unicast* — deliberately, so every server that made an offer hears which one won and the losers reclaim their offered addresses. Second: the client matches replies to its own transaction via **xid** (a random transaction ID) and **chaddr** (its MAC — which is how DHCP *reservations* pin an address to a device, and why N06's MAC randomization breaks them).",
          },
          {
            p: "After the ACK, one last ritual before using the address: the client probes it with ARP (N02) to make sure nobody's squatting — a **duplicate address check**, the IPv4 cousin of NDP's duplicate detection from N05. Then, and only then, the join sequence you memorized in N03 — scan → auth → associate → key handshake → *DHCP* → gateway ARP — has its fifth step filled in.",
          },
          {
            code: {
              lang: "sh",
              title: "watch DORA happen",
              body: "sudo tcpdump -i eth0 -n port 67 or port 68 &\nsudo dhclient -r eth0 && sudo dhclient -v eth0\n# 0.0.0.0.68 > 255.255.255.255.67: BOOTP/DHCP, Request (Discover)\n# 192.168.1.1.67 > 255.255.255.255.68: BOOTP/DHCP, Reply (Offer)\n# 0.0.0.0.68 > 255.255.255.255.67: BOOTP/DHCP, Request\n# 192.168.1.1.67 > 255.255.255.255.68: BOOTP/DHCP, Reply (ACK)",
            },
          },
        ],
      },
      {
        id: "n15l2",
        title: "Leases: renting, renewing, expiring",
        est: "~10 min",
        blocks: [
          {
            p: "A DHCP address is a **lease**, not a grant — rented for a duration the server chooses (minutes on guest Wi-Fi, days on office LANs). The same leased-not-owned doctrine you met with NAT mappings in N11 applies one layer down: stop paying rent and the address goes back in the pool.",
          },
          {
            p: "Renewal runs on two timers. At **T1** (50% of the lease), the client *unicasts* a REQUEST to the server that granted the lease — quiet, polite, usually answered with a fresh ACK and the clock resets; users never notice. If the server has died, at **T2** (87.5%) the client escalates to *broadcasting* its REQUEST — any server that knows this scope may answer. If the lease fully expires with no answer, the client must stop using the address, and the OS self-assigns from `169.254.0.0/16` — the exact link-local range N07 taught you to read as a diagnosis. Now you know the machinery behind the symptom: seeing 169.254.x.x means DORA ran and *nobody answered*.",
          },
          {
            p: "Reconnecting hosts skip the full dance: a laptop waking from sleep sends an **INIT-REBOOT** REQUEST for its previous address — one ACK and it's back, or a NAK if it moved networks (same SSID, different site) and must DORA from scratch. And when an admin wants a device at a fixed address, the professional tool is a **reservation** (server maps MAC → address, client still does DHCP, config stays central) rather than static configuration on the device — which works until the device meets another network using the same subnet, or the pool forgets it.",
          },
          {
            note: "Lease length is a real design lever: short leases (guest café: 15 min) recycle a small pool across churning strangers; long leases (office: 8 days) keep printers stable and cut renewal chatter. When a pool is exhausted, new clients get no OFFER at all — and present as 169.254 mysteries.",
            label: "lease-time tuning",
          },
        ],
      },
      {
        id: "n15l3",
        title: "Options: the network describes itself",
        est: "~10 min",
        blocks: [
          {
            p: "The address is almost the least of what DHCP delivers. The payload's real cargo is **options** — numbered TLV fields that hand the client its entire L3 worldview. The ACK doesn't just say 'you are 192.168.1.50'; it says 'here is your mask, your gateway, your DNS, how long you may stay.'",
          },
          {
            tbl: {
              head: ["Option", "Name", "What it configures"],
              rows: [
                ["1", "Subnet mask", "The prefix — the local/remote decision from N01"],
                ["3", "Router", "Default gateway: what you'll ARP for (N02) to leave the subnet"],
                [
                  "6",
                  "DNS servers",
                  "The resolver — the same DHCP-provided resolver N11's leak scenarios revolve around",
                ],
                ["51", "Lease time", "The rent (plus T1/T2 in options 58/59)"],
                [
                  "53",
                  "Message type",
                  "Which DORA step this packet is — DISCOVER, OFFER, REQUEST, ACK, NAK",
                ],
                [
                  "121",
                  "Classless static routes",
                  "Extra routes pushed into the client's table — remember this one",
                ],
                [
                  "252",
                  "WPAD",
                  "Proxy auto-config URL — the discovery channel P04 flags as an attack surface",
                ],
              ],
            },
          },
          {
            p: "Option **121** deserves a stare. It lets the DHCP server install *arbitrary routes* on the client — legitimate for reaching an extra subnet via a second router, but pause on the trust model: a server you met via unauthenticated broadcast is editing your routing table, where longest-prefix-match (N01) decides where every packet goes. Hold that thought until lesson five.",
          },
          {
            p: "This is also the cleanest place to see the IPv4/IPv6 philosophical split from N05: IPv4 says 'the *server* describes the network' (stateful, one authority, an audit trail); SLAAC says 'the *network* describes itself' (routers advertise, hosts self-assemble). Same job — address, gateway, DNS — two theories of who's in charge.",
          },
        ],
      },
      {
        id: "n15l4",
        title: "Relays: one server, many subnets",
        est: "~10 min",
        blocks: [
          {
            p: "DORA runs on broadcast, and N02 taught you broadcasts die at the router. Taken literally, that means one DHCP server *per subnet* — absurd for a campus with hundreds of VLANs (N06's design). The fix is the **DHCP relay** (Cisco's `ip helper-address`): the router on each subnet listens for the client's broadcasts and *forwards them as unicast* to the real server, wherever it lives.",
          },
          {
            p: "The load-bearing field is **giaddr** (gateway address): the relay stamps the packet with the address of the interface the broadcast arrived on. That single field does two jobs — it's the return address for the server's replies (which come back unicast to the relay, who converts them back for the client), and it's the **scope selector**: the server looks at giaddr, sees `10.20.30.1`, and knows to offer an address from the `10.20.30.0/24` pool. One server, a thousand subnets, each getting answers appropriate to where the question came from.",
          },
          {
            diagram: {
              kind: "topo",
              title: "DHCP relay across the routed core",
              caption:
                "The relay converts the client's broadcast to routable unicast; giaddr tells the server which pool to answer from — and where to send the reply.",
              nodes: [
                { id: "c", label: "Client", sub: "no address yet", tone: "acc", x: 0, y: 0 },
                {
                  id: "r",
                  label: "Relay",
                  sub: "giaddr 10.20.30.1",
                  tone: "l3",
                  x: 1,
                  y: 0,
                },
                { id: "core", label: "routed core", tone: "dim", x: 2, y: 0, shape: "cloud" },
                { id: "s", label: "DHCP server", sub: "one, central", tone: "ok", x: 3, y: 0 },
              ],
              links: [
                { from: "c", to: "r", label: "broadcast", dashed: true },
                { from: "r", to: "core", label: "unicast" },
                { from: "core", to: "s", label: "giaddr → scope" },
              ],
            },
          },
          {
            p: "This is the missing mechanism behind N06's enterprise picture: 802.1X drops you on a VLAN, and 'each VLAN maps to its own subnet with its own DHCP scope' — now you know *how* one central server serves them all, and why a wrong helper-address or a giaddr mismatch produces a whole VLAN of 169.254 clients while every other VLAN hums along. Per-VLAN DHCP failure is a relay-configuration diagnosis, not a server-down diagnosis.",
          },
          {
            note: "Relays are why 'DHCP is broadcast-only' is a half-truth worth unlearning: past the first hop, DHCP is ordinary unicast UDP between relay and server, routable like anything else. The broadcast crutch exists only on the client's own segment, where it has no address yet.",
            label: "the half-truth",
          },
        ],
      },
      {
        id: "n15l5",
        title: "DHCP as attack surface (and your VPN's problem)",
        est: "~12 min",
        blocks: [
          {
            p: "Like ARP (N02), DHCP has **no authentication** — it predates the hostile internet, and any device on the segment may answer a DISCOVER. A **rogue DHCP server** that replies faster than the real one hands the victim its choice of gateway and DNS: instant on-path position, the L3 sibling of ARP spoofing and a cousin of the WPAD hijack from P04. The blunt sibling attack is **starvation**: DISCOVER with thousands of spoofed MACs until the legitimate pool is empty, then rogue answers are the only answers.",
          },
          {
            diagram: {
              kind: "seq",
              title: "rogue DHCP: first answer wins",
              caption:
                "No authentication means the fastest OFFER hands the attacker gateway, DNS, and — via option 121 — the victim's route table.",
              actors: [
                { id: "v", label: "Victim", tone: "acc" },
                { id: "rg", label: "Rogue", sub: "answers fastest", tone: "bad" },
                { id: "real", label: "Real server", tone: "dim" },
              ],
              steps: [
                {
                  from: "v",
                  to: "real",
                  label: "DISCOVER",
                  sub: "broadcast — anyone may answer",
                  dashed: true,
                },
                {
                  from: "rg",
                  to: "v",
                  label: "OFFER — first!",
                  sub: "attacker's gateway + DNS",
                  tone: "bad",
                },
                {
                  from: "real",
                  to: "v",
                  label: "OFFER",
                  sub: "too late",
                  tone: "dim",
                  dashed: true,
                },
                { from: "v", to: "rg", label: "REQUEST" },
                {
                  from: "rg",
                  to: "v",
                  label: "ACK",
                  sub: "option 121: hostile routes",
                  tone: "bad",
                },
                { note: "victim's traffic now transits the attacker", tone: "bad" },
              ],
            },
          },
          {
            p: "The wired-enterprise defense is **DHCP snooping**: the switch (which sees every frame — N02) marks ports as trusted (toward the real server or relay) or untrusted (everything else) and *drops server-role messages arriving on untrusted ports*. No OFFERs from the intern's desk. The bindings the switch learns this way also feed Dynamic ARP Inspection — the ARP-spoofing countermeasure — which is a tidy dependency: securing L2 trust starts with policing DHCP.",
          },
          {
            p: "Now the part that makes this *your* module as a tunnel engineer. **TunnelVision** (CVE-2024-3661, 2024) weaponizes option 121: a hostile network's DHCP server pushes routes *more specific than your VPN's* — and longest-prefix-match (N01) doesn't care about your feelings: `1.2.3.0/24` via the attacker beats your tunnel's `0.0.0.0/1` split, every time, in plaintext, while the VPN UI still shows connected. **TunnelCrack's LocalNet** variant abuses the same trust from a different angle: the rogue network numbers itself with the subnet containing the victim's target, exploiting the LAN exception ('local traffic skips the tunnel' — P01's excludeLocalNetworks, P04's leak review) that nearly every client ships.",
          },
          {
            p: "The defenses are exactly S01's fail-closed doctrine made concrete: a firewall-based kill switch that permits *only* the tunnel interface and the daemon's own outer UDP wins regardless of what garbage lands in the route table (routes decide where packets go; the filter decides whether they go — P02's WFP kill switch explicitly carves out DHCP for this reason); network namespaces sidestep option 121 entirely because the DHCP-touched table isn't the one the tunnel uses; and LAN exceptions on untrusted networks deserve the suspicion P04 gives them. 'We encrypt everything' is a routing claim; hostile DHCP is a routing attacker.",
          },
        ],
      },
      {
        id: "n15l6",
        title: "DHCPv6: the v6 rematch",
        est: "~8 min",
        blocks: [
          {
            p: "IPv6 defaults to SLAAC (N05), but **DHCPv6** exists for networks that want IPv4-style central control. The Router Advertisement is the dispatcher, via two flags: **M** (Managed — 'get your address from DHCPv6, stateful mode') and **O** (Other — 'self-assemble your address via SLAAC, but fetch DNS and options from DHCPv6, stateless mode'). Ports move to **546/547** (client/server), multicast replaces broadcast (`ff02::1:2`, all-relays-and-servers — no broadcast exists in v6), and clients are identified by **DUID** instead of raw MAC.",
          },
          {
            p: "The perpetual gotcha: **DHCPv6 never assigns a default gateway.** The gateway *always* comes from the RA's link-local source address (N05's fe80:: surprise), even in fully stateful deployments. An engineer who ports IPv4 instincts — 'DHCP gives me the router' — will hunt a phantom DHCPv6 bug when the actual failure is a missing or filtered RA. Address from one protocol, gateway from another: that's normal v6.",
          },
          {
            p: "One genuinely new power: **prefix delegation** (DHCPv6-PD), where your ISP's server hands your home router an entire prefix — the /56 from N05 — which the router then slices into /64s and *advertises onward* to your LANs. The scarcity-era model of 'one address per customer' inverted into 'here's a block, subnet it yourself'; NAT (N11) deleted from the home-network architecture by delegation rather than decree.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "n15e1",
        type: "order",
        title: "First address on a cold boot",
        kind: "SEQUENCE LAB",
        prompt:
          "A laptop joins a wired LAN with two DHCP servers. Order what happens on the wire, from silence to a usable address.",
        items: [
          "Client broadcasts DISCOVER from 0.0.0.0, source port 68 to 67",
          "Both servers broadcast OFFERs, each proposing an address",
          "Client broadcasts REQUEST naming its chosen server and address",
          "Losing server hears the REQUEST and reclaims its offered address",
          "Chosen server unicasts/broadcasts ACK with mask, gateway, DNS, lease time",
          "Client ARP-probes the address for duplicates, then starts using it",
        ],
        why: "DORA plus the two steps people forget: the broadcast REQUEST exists so losers can clean up, and the ARP probe is the duplicate check before the address is trusted.",
      },
      {
        id: "n15e2",
        type: "match",
        title: "DHCP mechanics on sight",
        kind: "MATCH LAB",
        prompt:
          "Match each artifact to what it tells you. These are the working vocabulary of every DHCP conversation and half its outages.",
        pairs: [
          {
            t: "T1 (50% of lease)",
            d: "Quiet unicast renewal to the granting server — the renewal nobody notices",
          },
          {
            t: "T2 (87.5% of lease)",
            d: "Renewal escalates to broadcast — any server for this scope may answer",
          },
          {
            t: "giaddr",
            d: "Relay's stamp: return address for replies and the server's scope selector",
          },
          {
            t: "Option 121",
            d: "Server-pushed static routes — TunnelVision's lever against VPN routing",
          },
          {
            t: "169.254.x.x on a client",
            d: "DORA ran and nobody answered — self-assigned link-local fallback",
          },
          {
            t: "NAK",
            d: "Server refusal — often a host requesting its old address on a new network",
          },
        ],
        why: "T1 vs T2, giaddr, and reading 169.254 as 'no server answered' cover most real DHCP tickets; option 121 is the one your threat model can't skip.",
      },
    ],
    quiz: {
      id: "n15q",
      questions: [
        {
          q: "The client's REQUEST in DORA is broadcast even though it already knows the chosen server's address. Why?",
          opts: [
            "The client has no IP address yet, so unicast is impossible anyway",
            "So every offering server hears the outcome — losers reclaim their offered addresses",
            "Broadcast is faster than unicast on switched networks",
          ],
          a: 1,
          why: "It's a declination notice as much as a request. (The client also still lacks a bound address, but the *design reason* is informing the losing servers.)",
        },
        {
          q: "One VLAN's clients all sit at 169.254.x.x while every other VLAN gets addresses fine. Most likely culprit?",
          opts: [
            "The DHCP server is down",
            "The relay (helper-address/giaddr) for that VLAN is missing or misconfigured",
            "The lease time is too short",
          ],
          a: 1,
          why: "A dead server takes out every scope. One subnet failing in isolation points at the machinery that carries that subnet's broadcasts to the server: the relay.",
        },
        {
          q: "A full-tunnel VPN is up, yet traffic to certain sites leaves in plaintext on café Wi-Fi. TunnelVision achieved this how?",
          opts: [
            "By cracking the tunnel's AEAD encryption",
            "Via DHCP option 121: pushed routes more specific than the VPN's, and longest-prefix-match prefers them",
            "By spoofing the VPN server's ACKs",
          ],
          a: 1,
          why: "No crypto is touched — the packets simply never enter the tunnel. Routing decides where packets go; only a fail-closed firewall decides whether they go.",
        },
        {
          q: "A fully stateful DHCPv6 deployment hands out addresses and DNS. Where does the client's default gateway come from?",
          opts: [
            "A DHCPv6 option, like IPv4's option 3",
            "The Router Advertisement — DHCPv6 never assigns a gateway",
            "It's derived from the delegated prefix",
          ],
          a: 1,
          why: "Address from DHCPv6, gateway from the RA's link-local source — always. Porting the IPv4 'DHCP gives me the router' instinct into v6 is the classic phantom-bug hunt.",
        },
      ],
    },
  },
];
