import type { Module } from "./types";

/* Networking fundamentals — cloud module: VPCs, cloud firewalls, load balancers,
   site-to-site IPsec, and SD-WAN. Everything the track taught, re-rendered as API calls. */

export const NET_CLOUD: Module[] = [
  {
    id: "n16",
    code: "N18",
    title: "Cloud Networking: The Datacenter as an API",
    layers: ["L3", "L4", "L7"],
    est: "~85 min",
    tag: "VPCs and route tables, security groups vs NACLs, L4/L7 load balancers, site-to-site IPsec into the cloud, and SD-WAN — the same fundamentals, declared in JSON instead of racked in a closet.",
    lessons: [
      {
        id: "n16l1",
        title: "The VPC: a network you declare",
        est: "~18 min",
        blocks: [
          {
            p: "A **VPC** (Virtual Private Cloud — Azure says *VNet*) is a private L3 network conjured by an API call: you name a CIDR block, and the provider's SDN fabric makes it real. There are no switches to configure and no cables to trace — but every concept from this track is still load-bearing. You choose an RFC 1918 range (N05), carve it with VLSM (N07), and packets are steered by longest-prefix-match route tables (N01). The cloud didn't replace networking fundamentals; it turned them into *design decisions you commit to on day one*.",
          },
          {
            p: "**CIDR planning is the irreversible decision.** A VPC's primary range is hard to change after workloads land in it, and the classic failure is choosing 10.0.0.0/16 for every VPC and every office — then discovering that VPN and peering connections between overlapping ranges are unrouteable (N01: two 'longest prefixes' that collide can't share a table). Professionals keep a global address plan: one spreadsheet-worth of non-overlapping blocks covering offices, VPCs, and the VPN ranges between them, with room to grow.",
          },
          {
            p: "Inside the VPC you cut **subnets** — in AWS each lives in one availability zone; GCP subnets span a region. What makes a subnet 'public' is nothing intrinsic: it's *its route table*. A subnet whose table has `0.0.0.0/0 → internet gateway` is public; one whose default route points at a **NAT gateway** is private — its instances can reach out (N11's SNAT, sold as a managed service, billed by the gigabyte), but nothing unsolicited can reach in. Every subnet also gets an implicit router: the VPC's own CIDR is always routable locally, no configuration needed.",
          },
          {
            diagram: {
              kind: "topo",
              title: "one VPC, the classic two-tier layout",
              nodes: [
                { id: "inet", label: "Internet", tone: "dim", x: 0, y: 0, shape: "cloud" },
                { id: "igw", label: "IGW", tone: "l3", x: 1, y: 0 },
                {
                  id: "pub",
                  label: "public a+b",
                  sub: "10.20.0-1.0/24 · LB, NAT",
                  tone: "ok",
                  x: 2,
                  y: 0,
                },
                {
                  id: "priv",
                  label: "private a+b",
                  sub: "10.20.10-11.0/24 · apps",
                  tone: "l7",
                  x: 2,
                  y: 1,
                },
                {
                  id: "data",
                  label: "data-a",
                  sub: "10.20.20.0/24 · DBs",
                  tone: "dim",
                  x: 1,
                  y: 1,
                },
              ],
              links: [
                { from: "pub", to: "igw", label: "0.0.0.0/0", tone: "ok" },
                { from: "igw", to: "inet", tone: "dim" },
                { from: "priv", to: "pub", label: "0.0.0.0/0 → NAT gw", tone: "acc" },
                { from: "data", to: "priv", label: "local only", tone: "dim", dashed: true },
              ],
              caption:
                "'Public' is a route-table property, not a label — and every table implicitly carries 10.20.0.0/16 → local. data-a has no default route at all: no internet, period.",
            },
          },
          {
            p: "Connecting VPCs to each other: **peering** joins two VPCs' route tables directly, but it's non-transitive — A↔B and B↔C does *not* give A↔C, so ten VPCs fully meshed means 45 peerings. At that point you deploy a **transit gateway** (Azure: Virtual WAN hub): a regional hub router every VPC and VPN attaches to, hub-and-spoke instead of mesh. It's the same topology decision enterprise WANs have always made, and it's where your site-to-site tunnels (lesson 4) will terminate.",
          },
          {
            tbl: {
              head: ["Concept", "AWS", "Azure", "GCP"],
              rows: [
                ["The network", "VPC", "VNet", "VPC (global!)"],
                ["Subnet scope", "One AZ", "Region", "Region"],
                ["Stateful firewall", "Security group", "NSG", "VPC firewall rules"],
                ["Outbound-only NAT", "NAT gateway", "NAT Gateway", "Cloud NAT"],
                ["Hub router", "Transit Gateway", "Virtual WAN", "Network Connectivity Center"],
                ["Private circuit", "Direct Connect", "ExpressRoute", "Cloud Interconnect"],
              ],
            },
          },
          {
            note: "The vocabulary differs per provider; the *concepts* are this course's. Ace the ideas here and any provider's console is a weekend of vocabulary, not a new discipline.",
            label: "portable knowledge",
          },
        ],
      },
      {
        id: "n16l2",
        title: "Security groups & NACLs: N17's firewall, rented",
        est: "~15 min",
        blocks: [
          {
            p: "A **security group** is the stateful firewall from N17, attached to an instance's virtual NIC instead of a perimeter. Same conntrack logic (N08): allow an inbound flow and the replies leave automatically; allow outbound and the responses return — you never write the reverse rule. Security groups are **allow-list only, default deny** (N17's doctrine, enforced by the API: there is no 'deny' rule to write), and evaluation is 'union of all attached groups' — any group's allow admits the flow.",
          },
          {
            p: "The move that makes cloud segmentation elegant: rules can reference **another security group as the source** instead of a CIDR. `db-sg: allow 5432 from app-sg` means 'whatever instances currently wear the app-sg tag may reach the database' — membership updates as instances launch and die, no IP bookkeeping. Read what that really is: **identity-based filtering instead of address-based** — N17's zero-trust inversion, expressed as a firewall rule. Autoscaling made IP-based rules unmaintainable; the provider's answer was to make identity the primitive.",
          },
          {
            p: "**NACLs** (network ACLs) are the *stateless* filter from N17, applied at the subnet boundary: numbered rules, first match wins, and — because stateless — you must explicitly allow return traffic, including the full **ephemeral port range** (N08: 1024–65535) for replies. Forgetting that is the classic NACL wound: outbound HTTPS works, responses die at the subnet edge, and the symptom is a silent timeout (N16's 'something ate the packet'). Standard doctrine: leave NACLs at their permissive defaults and do the real filtering in security groups; reach for NACLs only for coarse subnet-level bans, since a stateless deny is the only explicit deny AWS gives you.",
          },
          {
            ul: [
              "Security group: **stateful**, instance-level, allow-only, evaluates all rules — your everyday tool.",
              "NACL: **stateless**, subnet-level, numbered allow/deny, first match wins — the blunt instrument.",
              "Both are 'distributed firewalls': enforced in the hypervisor/SDN layer at every host, not at one choke point — N17's segmentation without the single point of failure.",
              "Debugging order (N16's method): reachability fails in a VPC → check security groups, then NACLs, then the route table, then whether the thing is listening at all (`ss -tlnp` still works in the cloud).",
            ],
          },
        ],
      },
      {
        id: "n16l3",
        title: "Load balancers: L4 vs L7, and the health check that runs production",
        est: "~15 min",
        blocks: [
          {
            p: "A load balancer answers 'one name, many servers.' The layer it works at decides everything. An **L4 (network) load balancer** touches only the TCP/UDP 5-tuple: it forwards or NATs flows to backends, hashing the tuple so a connection sticks to one backend. It's protocol-blind, brutally fast, and preserves end-to-end TLS — the balancer never sees plaintext. An **L7 (application) load balancer** *terminates* the connection: it completes the TLS handshake (N13) with the client, reads the HTTP request, and originates a second connection to a backend. Two TCP connections, two congestion controllers, and the balancer sees everything — which is the price of its powers: routing by path or host header, per-request retries, WebSocket handling, HTTP/2 and HTTP/3 (N13) on the front regardless of what backends speak.",
          },
          {
            p: "Termination creates the identity problem you already know from N11: backends see the balancer's address as the source, exactly like hosts behind NAT. The restorations: **X-Forwarded-For** headers at L7, or **PROXY protocol** at L4 — a small preamble carrying the original 5-tuple. Forgetting to configure (or to *trust-filter*) these is how access logs fill with the balancer's IP and how naive rate-limiters throttle the balancer instead of the abuser.",
          },
          {
            p: "**Health checks** are the half that actually runs production: the balancer probes each backend (TCP connect, or better, an HTTP path that exercises real dependencies) and ejects failures from rotation. The two calibration sins — checks too *shallow* (port accepts, app is wedged: traffic flows into a black hole) and checks too *aggressive* (one slow dependency fails the check on every backend at once, and the balancer amputates the whole fleet during a partial brownout). Pair them with **connection draining**: a deregistering backend stops receiving *new* flows but finishes in-flight ones — the mechanism behind zero-downtime deploys.",
          },
          {
            p: "Above a single region sits **global load balancing**: DNS-based steering (N12's low-TTL answers pointing users at the nearest healthy region) or **anycast** (N10 — one IP announced from thirty sites, BGP delivering each user to the closest). The full modern path is a stack of everything this track taught: anycast edge → TLS-terminating L7 balancer → regional L4 tier → your instance's security group. You can now read every hop of that sentence.",
          },
        ],
      },
      {
        id: "n16l4",
        title: "Hybrid: site-to-site IPsec into the cloud",
        est: "~20 min",
        blocks: [
          {
            p: "The office network and the VPC need to be one routable space — that's a **site-to-site VPN**: a tunnel between your router and the cloud's managed VPN endpoint, carrying traffic for *networks*, not for one user's laptop. The incumbent protocol is **IPsec**, and it's worth knowing both because every cloud's managed offering speaks it and because it's the ancestor your WireGuard knowledge (T02/T03) lets you read critically.",
          },
          {
            p: "IPsec is a two-phase negotiation. **IKE** (Internet Key Exchange, UDP 500) authenticates the peers — pre-shared key or certificates — and derives keys, a Diffie-Hellman handshake serving the same role as Noise's (T02), specified a generation earlier with vastly more knobs. Phase 2 establishes **ESP** (Encapsulating Security Payload), which carries the actual encrypted packets in **tunnel mode**: the original IP packet, whole, becomes the AEAD-protected payload of a new packet between tunnel endpoints — the same encapsulation shape as WireGuard (T01's insight that a tunnel is just packets-in-packets). One practical wrinkle you already understand from N11: ESP is IP protocol 50, *not* TCP or UDP — it has no ports, so NAT can't track it. The fix is **NAT-T**: detect NAT during IKE and wrap ESP in UDP 4500. If port 4500 is in your drill deck (N16), this is why.",
          },
          {
            p: "**Policy-based vs route-based** is the design fork. Policy-based tunnels encrypt 'traffic matching this ACL' — brittle, and each new subnet pair means touching the ACL. **Route-based** tunnels present as a virtual interface (a VTI — conceptually a TUN device, T01) that you point *routes* at; what's encrypted is whatever routing sends into it. Route-based wins because it composes with everything routing can do — including running **BGP over the tunnel** (N10): your router and the cloud exchange prefixes dynamically, new subnets propagate without ticket-driven route edits, and when a tunnel dies BGP withdraws its routes and traffic shifts to the survivor. That's why cloud VPN endpoints come as *pairs*: two tunnels, two provider-side devices, BGP arbitrating — failover as a routing event (N10's lesson that resilience is a routing property), not an alert for a human.",
          },
          {
            diagram: {
              kind: "topo",
              title: "site-to-site: two tunnels, BGP arbitrating",
              nodes: [
                { id: "hq", label: "HQ router", sub: "10.9.0.0/16", tone: "l3", x: 0, y: 1 },
                { id: "inet", label: "Internet", tone: "dim", x: 1, y: 1, shape: "cloud" },
                { id: "gwa", label: "VPN gw A", sub: "cloud endpoint", tone: "acc", x: 2, y: 0 },
                { id: "gwb", label: "VPN gw B", sub: "cloud endpoint", tone: "acc", x: 2, y: 2 },
                { id: "vpc", label: "VPC / TGW", sub: "10.20.0.0/16", tone: "ok", x: 3, y: 1 },
              ],
              links: [
                { from: "hq", to: "inet", label: "ESP in UDP 4500", tone: "l4" },
                { from: "inet", to: "gwa", label: "tunnel 1 · BGP", tone: "acc" },
                { from: "inet", to: "gwb", label: "tunnel 2 · BGP", tone: "acc", dashed: true },
                { from: "gwa", to: "vpc", tone: "ok" },
                { from: "gwb", to: "vpc", tone: "ok" },
              ],
              caption:
                "Route-based VTIs with BGP over both tunnels: when one dies, its routes are withdrawn and traffic shifts to the survivor — failover as a routing event.",
            },
          },
          {
            code: {
              lang: "sh",
              title: "route-based IPsec, the Linux view (strongSwan + VTI)",
              body: "# after IKE establishes, a VTI interface carries the tunnel\nip link add vti0 type vti key 42 remote 203.0.113.9 local 198.51.100.4\nip addr add 169.254.10.2/30 dev vti0        # BGP peering lives on this /30\nip link set vti0 up mtu 1436                # IPsec overhead: budget ~64-73 bytes (N01's tax, bigger)\n\n# routes decide what's encrypted — no crypto ACLs\nip route add 10.20.0.0/16 dev vti0          # or let BGP install this\n\n# the N16 verification reflex:\ntcpdump -ni eth0 'udp port 4500 or esp'     # outer: only ESP/NAT-T should show\nping -M do -s 1408 10.20.10.5               # find the real path MTU before users do",
            },
          },
          {
            p: "The MTU line is not decoration: IKE/ESP/NAT-T overhead means cloud VPNs commonly run interior MTUs around 1400–1460, and the failure mode is N01's classic — small packets work, big transfers hang, PMTUD black-holes behind a firewall that eats ICMP (N05). Clouds mitigate with **MSS clamping** on the tunnel; you should know to look for it. And when the VPN's ~1.25 Gbps-per-tunnel ceilings or internet-path jitter aren't acceptable, the upgrade is a **dedicated circuit** — Direct Connect / ExpressRoute / Interconnect: a private physical link into the provider's edge, BGP again, no IPsec unless you layer it (the circuit is private, not encrypted — N17 says know the difference). Tunnels over the internet for speed of setup and as backup; circuits for committed bandwidth — most real enterprises run both, BGP preferring the circuit.",
          },
        ],
      },
      {
        id: "n16l5",
        title: "SD-WAN: tunnels with a control plane",
        est: "~15 min",
        blocks: [
          {
            p: "Classic WANs backhauled every branch office over MPLS circuits to headquarters — expensive, slow to provision, and absurd once the traffic's destination became the cloud (why haul Office 365 traffic to HQ just to send it back out?). **SD-WAN** is the redesign: each branch gets a cheap commodity mix of links — business broadband, fiber DIA, LTE/5G — and an edge appliance builds encrypted tunnels (IPsec or DTLS — the same overlay move as this course's entire tunnel track) over *all of them at once*, to other sites and to cloud on-ramps.",
          },
          {
            p: "The 'SD' is the separation you've now seen twice (N02's switching, N10's routing): **control plane split from data plane**. A central controller holds policy and pushes it to every edge; the edges forward. Policy is **application-aware**: the edge classifies flows (DPI, SNI, DNS — the identification toolkit from N12/N13) and steers per-application, per-link-quality — VoIP takes the lowest-jitter path, bulk backup takes the cheapest, and each tunnel is continuously probed for loss/latency/jitter (mtr's metrics from N16, automated) so a degrading link is abandoned mid-flow. Read that with S02 eyes: it's per-flow policy dispatch — the architecture of the client you're building, scaled to a branch office.",
          },
          {
            p: "Where it converges: SD-WAN vendors terminate tunnels in cloud PoPs, put zero-trust access (N17), secure web gateways, and firewalling *in* those PoPs, and the bundle gets the name **SASE** — Secure Access Service Edge. Strip the acronyms and the components are all yours already: encrypted overlays (T02), identity-keyed access with posture (N17/S02), policy routing (N10/S02), NAT traversal (T04), telemetry (S03). The 2026 job listing says 'cloud networking / SD-WAN engineer'; the skills are this course.",
          },
          {
            note: "One honest caveat: overlays inherit their underlay. SD-WAN can pick the best of three paths, but if all three share one flooded upstream, no policy saves you — N09's congestion physics doesn't negotiate. Measure the underlay before trusting the overlay's promises. The same discipline applies to your own tunnel: WireGuard over a lossy link is a fast tunnel over a bad road.",
            label: "underlay realism",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "n16e1",
        type: "order",
        title: "Office to private instance, in order",
        kind: "SEQUENCE LAB",
        prompt:
          "A request leaves a workstation at HQ (10.9.1.20) for a private app server in the VPC (10.20.10.5) over the site-to-site VPN. Put the hops and decisions in order.",
        items: [
          "HQ router's route table matches 10.20.0.0/16 → the VTI tunnel interface",
          "Original packet is ESP-encrypted whole and wrapped in UDP 4500 (NAT-T) toward the cloud endpoint",
          "Cloud VPN endpoint decrypts; inner packet enters the transit gateway/VPC fabric",
          "VPC route table matches the destination subnet; packet is delivered toward the instance",
          "Instance's security group checks inbound rules — allow from the app tier's source",
          "Reply returns automatically: the security group is stateful, no return rule needed",
        ],
        why: "Encapsulation (T01), routing (N01/N10), NAT-T (N11), and stateful filtering (N17) — one packet crossing everything this module inherits.",
      },
      {
        id: "n16e2",
        type: "match",
        title: "Cloud symptom → first suspect",
        kind: "MATCH LAB",
        prompt:
          "Each symptom names its layer and its cloud control. Match it to the professional's first check.",
        pairs: [
          {
            t: "Instance in a private subnet can't reach the internet at all",
            d: "Route table — is there a 0.0.0.0/0 via a NAT gateway, and is the NAT gateway in a *public* subnet?",
          },
          {
            t: "Outbound HTTPS works, but only from subnets without the new NACL",
            d: "Stateless NACL missing the ephemeral-port return rules — replies are dying at the subnet edge",
          },
          {
            t: "Backends see every request coming from one internal IP",
            d: "L7 termination — read X-Forwarded-For (or enable PROXY protocol at L4)",
          },
          {
            t: "Site-to-site VPN passes pings but large transfers hang",
            d: "MTU/PMTUD — IPsec overhead plus eaten ICMP; check MSS clamping (N01's tax collected)",
          },
          {
            t: "Load balancer ejected every backend simultaneously during a partial outage",
            d: "Health check too aggressive/deep — one shared dependency failed the whole fleet's checks",
          },
          {
            t: "Two VPCs peered to a shared VPC still can't reach each other",
            d: "Peering is non-transitive — you need a direct peering or a transit gateway",
          },
        ],
        why: "Cloud debugging is N16's method with new nouns: route table, then filter, then health check — each symptom already points at its layer.",
      },
    ],
    quiz: {
      id: "n16q",
      questions: [
        {
          q: "What actually makes a cloud subnet 'public'?",
          opts: [
            "Its name and the provider's console labeling",
            "Its route table has a default route to an internet gateway (and its hosts have public addresses)",
            "It uses public IP ranges instead of RFC 1918",
          ],
          a: 1,
          why: "Public is a routing property, not a label. Same subnet, swap the default route to a NAT gateway, and it's private — N01's route table deciding everything, as usual.",
        },
        {
          q: "Security group vs NACL — the load-bearing difference?",
          opts: [
            "Security groups are stateful instance-level allow-lists; NACLs are stateless subnet-level rule chains where you must allow return traffic yourself",
            "NACLs are newer and replace security groups",
            "Security groups work at L7; NACLs at L3",
          ],
          a: 0,
          why: "Stateful vs stateless is N17's firewall fork, rented. The NACL's forgotten ephemeral-port return rule is the canonical cloud silent-timeout.",
        },
        {
          q: "Why does 'allow 5432 from app-sg' beat 'allow 5432 from 10.20.10.0/24'?",
          opts: [
            "Security group references evaluate faster",
            "It filters by membership/identity — instances joining or leaving the app tier are covered automatically, with no IP bookkeeping",
            "CIDR rules don't work across availability zones",
          ],
          a: 1,
          why: "Autoscaling killed address-based rules. Referencing the group is identity-based filtering — N17's zero-trust move, expressed as a firewall primitive.",
        },
        {
          q: "Why do cloud site-to-site VPNs run IPsec inside UDP 4500 (NAT-T)?",
          opts: [
            "UDP 4500 is faster than raw ESP",
            "ESP is IP protocol 50 — no ports — so NAT devices can't track or translate it; wrapping it in UDP restores the 5-tuple NAT needs",
            "IKE requires all traffic on one port",
          ],
          a: 1,
          why: "N11's rule: NAT tracks 5-tuples. A protocol without ports is invisible to it — so IPsec grew a UDP disguise. WireGuard skipped the problem by being UDP-native from birth.",
        },
        {
          q: "Why did route-based VPN (VTI + BGP) win over policy-based crypto ACLs?",
          opts: [
            "It encrypts with stronger ciphers",
            "The tunnel becomes an interface that routing — including BGP — controls: new prefixes propagate and failover happens as route withdrawal, no ACL edits",
            "Policy-based tunnels can't use certificates",
          ],
          a: 1,
          why: "Make the tunnel look like a link and the entire routing toolkit (N10) applies for free. Resilience becomes a routing event — the cloud's dual-tunnel design assumes exactly this.",
        },
        {
          q: "An SD-WAN edge sends VoIP over fiber and shifts it to LTE mid-call when jitter spikes. What's the mechanism?",
          opts: [
            "The carrier reroutes MPLS automatically",
            "Encrypted tunnels over every link, continuous per-tunnel loss/latency/jitter probing, and controller-pushed per-application policy choosing the path",
            "TCP retransmission repairs the audio",
          ],
          a: 1,
          why: "Overlay tunnels + measurement + per-flow policy dispatch — control plane split from data plane. It's your VPN client's architecture, deployed as a branch router.",
        },
      ],
    },
  },
];
