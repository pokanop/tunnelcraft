import type { Module } from "./types";

/* Tunnel Engineering — T05: Decentralized Mesh VPNs.

   T01–T04 taught one control plane by omission: the coordinated model
   (a central coordinator + STUN/DERP, the Tailscale shape). This module
   makes control-plane *topology* an explicit design axis and contrasts the
   fully decentralized model — no coordinator, shared-secret identity,
   gossiped peer tables, link-state routing over the peer graph, and relay
   through ordinary peers when hole punching fails.

   EasyTier (github.com/EasyTier/EasyTier — a ~12k-star Rust/Tokio mesh VPN)
   is used throughout as a read-real-code anchor. It is LGPL-3.0: everything
   below is described from its public docs and architecture and links to the
   source; no substantial code is reproduced. Reference and read freely, but
   do not paste its source into proprietary work without attribution and a
   license review. */

export const TUNNEL_MESH: Module[] = [
  {
    id: "t05",
    code: "T05",
    title: "Decentralized Mesh VPNs",
    tag: "Control planes without a coordinator: identity, gossip, overlay routing, and peer relay",
    layers: ["L3", "L7", "RS"],
    est: "~70 min",
    lessons: [
      {
        id: "t05l1",
        title: "The control plane is a design axis",
        est: "~12 min",
        blocks: [
          {
            p: "Everything in T01–T04 was the **data plane**: TUN packets, AEAD crypto, cryptokey routing, NAT traversal — how bytes move and stay secret. Riding quietly underneath was one **control plane**: a central **coordinator** that authenticates nodes, hands out overlay addresses, publishes the peer list, and brokers connections through STUN/DERP. That is the *Tailscale* shape, and until now the curriculum treated it as the only shape. It is not. *Who holds the map and issues identity* is its own axis, independent of how packets flow.",
          },
          {
            p: "Three points on that axis. **Coordinated** (Tailscale, Nebula's lighthouse, self-hosted headscale): a central service is the source of truth for identity, ACLs, and the roster; nodes phone home. **Decentralized** (EasyTier): no coordinator at all — membership is a shared secret, any reachable node bootstraps you, and peer/route info propagates node-to-node. **Hybrid** is where most real systems actually land: a light central touch for discovery or bootstrap only, with identity and routing distributed. (ZeroTier is often called decentralized but leans hybrid — a peer-to-peer data plane with a small set of rooted controllers for discovery and identity.)",
          },
          {
            diagram: {
              kind: "stack",
              title: "Two control planes",
              gapLabel: "who owns the map?",
              cols: [
                {
                  title: "Coordinated · Tailscale",
                  cells: [
                    { label: "Identity", sub: "coordinator issues", tone: "acc" },
                    { label: "Peer list", sub: "server publishes", tone: "acc" },
                    { label: "Join", sub: "phone home first", tone: "acc" },
                    { label: "Brain dies", sub: "no new joins; tunnels live", tone: "bad" },
                  ],
                },
                {
                  title: "Decentralized · EasyTier",
                  cells: [
                    { label: "Identity", sub: "shared name + secret", tone: "ok" },
                    { label: "Peer list", sub: "gossiped node-to-node", tone: "ok" },
                    { label: "Join", sub: "any peer bootstraps", tone: "ok" },
                    { label: "No brain", sub: "eventual, no roster", tone: "acc2" },
                  ],
                },
              ],
              caption:
                "The axis is control, not carriage — neither authority touches your packets (that is the data plane). Coordinated buys instant revocation; decentralized buys no single point to kill.",
            },
          },
          {
            p: "**Failure properties are the whole reason to care.** A coordinated mesh's coordinator is a single point of *control* failure: kill it and existing peer-to-peer tunnels keep flowing (the data path never needed it), but no new node can join, ACL edits stop propagating, and key rotation stalls. It is also a single point of *trust* and a censorship/subpoena target. A decentralized mesh has no brain to lose — it survives partition, operator disappearance, and blocking far better — but it pays in kind: convergence is *eventual*, not instant; there is no authoritative 'current members' list; and revoking a compromised node is genuinely hard, because there is no account to delete — you must rotate the shared secret everywhere. Inconsistent, split-brain views are the normal case, not an incident.",
          },
          {
            note: "Coordinated is not the same as centralized-datapath. Even Tailscale's coordinator never carries your traffic — relaying is DERP's separate job (T04). Keep the two questions apart: who owns identity and the map (control plane) versus who forwards the bytes (data plane). This module only moves the first one.",
            label: "control ≠ carriage",
          },
          {
            p: "So when does each fit? Coordinated wins where you need crisp, auditable access control and instant revocation — an enterprise fleet gated by SSO. Decentralized wins where there is no trusted operator to run a coordinator, where the network must outlive its own infrastructure (community meshes, censorship resistance, self-hosting with zero servers), or where a phone-home dependency is itself the thing you are trying to avoid. EasyTier chooses decentralized deliberately: a network anyone can join with a name and a secret, where no company holds the roster.",
          },
          {
            note: "Case study, used throughout: EasyTier (github.com/EasyTier/EasyTier) — a ~12k-star production mesh VPN in Rust/Tokio. A superb read-real-code target for this module. It is LGPL-3.0: read and link to it freely; do not paste its source into proprietary curriculum or products without attribution and a license review. Everything here is described from its public docs and architecture, not copied.",
            label: "EasyTier, honestly",
          },
        ],
      },
      {
        id: "t05l2",
        title: "Identity without a server",
        est: "~11 min",
        blocks: [
          {
            p: "In the coordinated world identity is easy: the coordinator authenticates you (SSO, a pre-auth key), assigns your overlay IP, signs your node record, and every peer trusts its word. Delete the coordinator and two questions have no obvious answer: *what makes two nodes members of the same network*, and *how does a brand-new node get in when there is nobody to ask?*",
          },
          {
            p: "**Membership is a network name plus a shared secret.** The name is a namespace; the secret proves you belong. Any node holding the secret is a full member — there are no per-node accounts. That secret does double duty: it is the admission credential *and* the seed for the pre-shared key that authenticates and encrypts the control channel (T02 showed a PSK folding into a Noise handshake; here it also gates who you will even gossip with). It is symmetric trust — every member can speak for the network — which is exactly why it is simple to join and hard to revoke (T05L1).",
          },
          {
            p: "**Bootstrapping from any node.** With no coordinator to phone, a joiner needs just one reachable address to begin — a **seed peer** from config: another member's endpoint, or a public shared node. It connects there, proves it holds the secret, and asks for the peer list. From that single contact it learns everyone else and dials them directly using T03/T04 traversal. The seed is not privileged or authoritative — it is merely the door you happened to walk through; lose it and any other member serves just as well.",
          },
          {
            diagram: {
              kind: "seq",
              title: "Bootstrapping with no coordinator",
              actors: [
                { id: "j", label: "joiner", tone: "acc" },
                { id: "s", label: "shared node", sub: "public rendezvous", tone: "acc2" },
                { id: "b", label: "peer B", tone: "ok" },
              ],
              steps: [
                { from: "j", to: "s", label: "hello + proof", sub: "holds the network secret" },
                { from: "s", to: "j", label: "peer list", sub: "{ B, C, D … }", tone: "ok" },
                {
                  note: "joiner now dials peers directly — the shared node was just the first door",
                },
                { from: "j", to: "b", label: "connect", sub: "hole-punch (T04)", tone: "ok" },
              ],
              caption:
                "One reachable address is enough to enter; the first peer list introduces everyone. Nothing in this exchange is authoritative — any member could have been the door.",
            },
          },
          {
            p: "**Public shared / community nodes** answer 'how do strangers find each other with no company running discovery.' They are ordinary members — usually on a stable public IP — that volunteer as always-reachable rendezvous points. Anyone can run one; a network lists several for redundancy. Compare the coordinated world's *dedicated* coordinator and DERP fleet: same rendezvous *function*, but here it is a role any peer opts into, not privileged infrastructure. EasyTier ships a list of community public shared nodes for exactly this bootstrap step.",
          },
          {
            note: "Identity-by-key carries straight over from T03. A WireGuard peer is named by its public key, which is why roaming is free (T03); a mesh node's permanent identity is likewise its keypair, while its *endpoints* are mutable discovery state the peer table keeps fresh (next lesson). Separate the permanent (key) from the ephemeral (address) and churn stops being frightening.",
            label: "key is identity",
          },
        ],
      },
      {
        id: "t05l3",
        title: "Peer tables converge by gossip",
        est: "~12 min",
        blocks: [
          {
            p: "Every node needs roughly the same picture of the network: who is a member, each peer's key, their current endpoints, and which overlay routes/CIDRs they own. A coordinator would simply push one authoritative table down. Decentralized, each node holds its *own* copy and they must **converge** with no master — precisely the problem N10's link-state IGP solved for routers, now over the peer graph. N10 even foreshadowed it: *flood small facts, let every node compute the same answer locally.*",
          },
          {
            p: "**Flood versus gossip.** *Flooding* (OSPF's LSA flood, N10): the moment you learn something new, send it to every neighbor, who forwards to all of theirs until the whole network has it — fast and complete, but chatty and bursty when membership churns. *Gossip* (epidemic / anti-entropy): each node periodically picks a *few random* peers and exchanges digests, healing whatever differs. Slower per fact — a handful of rounds to saturate — but bandwidth is smooth, churn is absorbed gracefully, and no reliable flood tree is required. Meshes lean gossip because their membership never stops moving.",
          },
          {
            diagram: {
              kind: "flow",
              title: "One fact, three gossip rounds",
              nodes: [
                { label: "round 0", sub: "1 knows", tone: "acc" },
                { label: "round 1", sub: "~3 know", tone: "acc2" },
                { label: "round 2", sub: "~7 know", tone: "acc2" },
                { label: "converged", sub: "all N", tone: "ok" },
              ],
              arrows: ["× fanout", "× fanout", "saturate"],
              caption:
                "Each node infects a few random peers per round: exponential, then saturating — about O(log N) rounds to reach everyone, with no flood tree and no coordinator.",
            },
          },
          {
            p: "**Freshness: version each fact by its origin.** Two peers report different endpoints for peer C — which wins? Every record carries an **origin id plus a monotonic sequence number** (or timestamp): C stamps each of its own advertisements with an increasing counter, and receivers keep the highest and discard anything older, no matter which path it arrived by. Same idea as OSPF LSA sequence numbers and DNS SOA serials (N12): supersede by *version*, not by arrival order. Merges become last-writer-wins **per origin**, which is conflict-free because only C ever originates C's record.",
          },
          {
            p: "**Churn and death.** Nodes vanish without a goodbye — a laptop sleeps, a phone dies. Two tools handle it. **Soft state with expiry:** records are refreshed by periodic re-advertisement (the keepalive cadence from T03) and silently expire if a peer goes quiet, so the table self-cleans. **Explicit departure:** a leaving node can gossip a tombstone ('I'm going') for faster convergence — but you never depend on it, because the ungraceful case has to work anyway. Underneath, this is a concurrent map that the data plane reads on the hot path while the control plane rewrites it every few seconds: R03's actor-owned state, or an `arc-swap` / `dashmap` snapshot, keeps the packet path lock-free.",
          },
          {
            note: "EasyTier propagates peer and route information peer-to-peer and has every node maintain its own live routing table — a concrete production example of soft-state convergence over churning membership. Read its peer-manager / route code as the real-world version of this lesson (github.com/EasyTier/EasyTier, LGPL-3.0 — link and read, do not lift).",
            label: "in the wild",
          },
        ],
      },
      {
        id: "t05l4",
        title: "Routing inside the overlay",
        est: "~13 min",
        blocks: [
          {
            p: "Once the peer table (T05L3) hands every node the same graph — peers as vertices, working connections as edges — you can *route inside the overlay*. This is the gap N10 left open. N10 routed the **underlay** (how packets cross the internet: OSPF/BGP, longest-prefix, AS policy), and T03's cryptokey routing chose *which peer* owns a destination IP — but neither answered *'if I cannot reach peer D directly, which chain of peers should carry my packet, and how do I pick the fastest chain?'* That is overlay routing.",
          },
          {
            p: "**Link-state, again — but the metric is latency.** Reuse N10's link-state idea wholesale: every node floods (here, gossips) its own links, so every node holds the same overlay map and runs shortest-path locally. The one change is the **cost function**. Underlay OSPF costs are bandwidth-derived and mostly static; overlay costs are **live measured latency** — the RTT you already sample from keepalives (T03) — so the graph re-weights as the internet breathes. 'Shortest path' becomes 'lowest-latency path,' and N10's manual traffic engineering becomes automatic: a congested direct link's cost climbs, and the router quietly prefers a relay.",
          },
          {
            diagram: {
              kind: "stack",
              title: "Same algorithm, two layers",
              gapLabel: "same Dijkstra",
              cols: [
                {
                  title: "Underlay · N10",
                  cells: [
                    { label: "Nodes", sub: "routers", tone: "l3" },
                    { label: "Edges", sub: "physical links", tone: "l3" },
                    { label: "Metric", sub: "bandwidth cost · static", tone: "l3" },
                    { label: "Runs on", sub: "dedicated routers", tone: "l3" },
                  ],
                },
                {
                  title: "Overlay · T05",
                  cells: [
                    { label: "Nodes", sub: "peers", tone: "acc" },
                    { label: "Edges", sub: "working peer links", tone: "acc" },
                    { label: "Metric", sub: "measured latency · live", tone: "acc" },
                    { label: "Runs on", sub: "every peer", tone: "acc" },
                  ],
                },
              ],
              caption:
                "Link-state, unchanged: flood your links, everyone holds the same map, run shortest-path locally. Only the cost moves — from static bandwidth to live RTT — so the overlay re-weights itself as conditions shift.",
            },
          },
          {
            p: "Rather than hand-roll Dijkstra, real Rust reaches for **`petgraph`** — a graph data structure plus the classic algorithms. Model peers as nodes and live links as weighted edges, then call `astar` (or `dijkstra`) for the lowest-latency route. Crucially, `astar` returns the path *with its hop list*, which is exactly what you need to pick the next relay or source-route the packet. EasyTier uses `petgraph` for precisely this overlay route table (github.com/EasyTier/EasyTier, LGPL-3.0 — read it, do not lift it).",
          },
          {
            code: {
              lang: "rust",
              title: "a toy link-state router over a peer graph",
              run: true,
              body: 'use petgraph::graph::UnGraph;\nuse petgraph::algo::astar;\nuse petgraph::visit::EdgeRef;\n\nfn main() {\n    // A toy overlay: nodes are peers, edge weights are live latency (ms).\n    let mut mesh = UnGraph::<&str, u32>::new_undirected();\n    let a = mesh.add_node("A");\n    let b = mesh.add_node("B");\n    let c = mesh.add_node("C");\n    let d = mesh.add_node("D");\n\n    mesh.add_edge(a, b, 30);   // A-B   30 ms\n    mesh.add_edge(b, d, 40);   // B-D   40 ms\n    mesh.add_edge(a, c, 50);   // A-C   50 ms\n    mesh.add_edge(c, d, 60);   // C-D   60 ms\n    mesh.add_edge(a, d, 200);  // A-D   direct, but congested\n\n    // Lowest-latency path from us (A) to peer D, across the peer graph.\n    let best = astar(&mesh, a, |n| n == d, |e| *e.weight(), |_| 0);\n\n    let (latency, path) = best.expect("D is reachable");\n    let hops: Vec<&str> = path.iter().map(|&n| mesh[n]).collect();\n    println!("best path {:?} = {} ms", hops, latency);\n    // => best path ["A", "B", "D"] = 70 ms  (beats the 200 ms direct link)\n}',
            },
          },
          {
            p: "Why the hop list matters: `dijkstra` hands back distances only; `astar` hands back the actual path, so you learn *'send to B, who forwards to D.'* A latency-sorted set of candidate paths doubles as your failover order — when the best path's next hop drops out of the peer table (T05L3), the second-best is already in hand. Recompute on every table change; for the hundreds-of-nodes graphs a real mesh has, it is cheap.",
          },
          {
            note: "Keep the two routing layers mentally separate: a packet taking a 3-hop overlay path (A→B→D) still rides ordinary internet routes (N10) on each hop's underlay. You are routing on top of a network that is already routing. Conflating the two is how people talk themselves into overlay 'loops' that do not exist.",
            label: "two routings, stacked",
          },
        ],
      },
      {
        id: "t05l5",
        title: "Relay through peers",
        est: "~10 min",
        blocks: [
          {
            p: "T04 gave you the traversal ladder: host / reflexive / relay candidates, hole punching, and a *dedicated* relay (TURN, or Tailscale's DERP) as the guaranteed last resort. A decentralized mesh slots one more rung in *before* the dedicated relay: when A and B cannot punch a direct hole (symmetric-to-symmetric NAT, or UDP simply blocked — T04), route their traffic **through an ordinary peer C** that can reach both. No special relay server — just a member that happens to have connectivity to each side.",
          },
          {
            diagram: {
              kind: "topo",
              title: "Relay is just a two-hop path",
              nodes: [
                { id: "a", label: "A", sub: "us", x: 0, y: 1, tone: "acc" },
                { id: "c", label: "C", sub: "ordinary peer", x: 1, y: 0, tone: "ok" },
                { id: "d", label: "D", sub: "peer", x: 2, y: 1, tone: "acc" },
              ],
              links: [
                { from: "a", to: "d", label: "hole-punch failed", tone: "bad", dashed: true },
                { from: "a", to: "c", label: "30 ms", tone: "ok" },
                { from: "c", to: "d", label: "40 ms", tone: "ok" },
              ],
              caption:
                "The unreachable direct link is not an edge, so shortest-path (T05L4) returns A→C→D on its own. One hop means direct; two means relay — one mechanism, and the fallback is free.",
            },
          },
          {
            p: "Here is the elegant part: **relay-through-peer is not a special case — it is what overlay routing already computed.** Once a link you cannot establish simply *is not an edge* in the peer graph (T05L4), the lowest-latency path `astar` returns *is* the relay path, automatically. A one-hop result means 'go direct'; a two-hop result means 'relay via the middle node.' You built the fallback in the previous lesson without noticing.",
          },
          {
            p: "Safety carries straight over from T04's DERP insight: the relaying peer is **untrusted infrastructure**. Because the payload is end-to-end encrypted between A and D (T02/T03) *before* C ever sees it, C forwards ciphertext it cannot read — which is exactly what makes routing through a stranger's node acceptable. C spends its own bandwidth on your behalf (a real cost — meshes cap and deprioritize relay traffic), but never your confidentiality.",
          },
          {
            p: "Contrast with DERP one last time. DERP is a fleet of *dedicated*, operator-run relays on port 443, always on, the coordinated model's last-resort path (T04). Peer relay is *any* member, chosen by live latency — and often a better path than a distant dedicated relay: two laptops behind the same corporate NAT can bounce through a reachable colleague's box instead of a relay three countries away. Mature systems keep both — peer relay for the common case, a dedicated public/shared node as the floor when no single peer bridges the gap.",
          },
          {
            note: "EasyTier does exactly this: direct-first, relay-through-peers when direct fails, with latency-ranked selection over its petgraph route table (github.com/EasyTier/EasyTier, LGPL-3.0). Put it beside Tailscale's DERP design (T04) and you can watch the coordinated-vs-decentralized split play out specifically in the relay layer.",
            label: "go deeper",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "t05e1",
        kind: "CODE LAB",
        title: "Lowest-latency path over the peer graph",
        type: "blank",
        prompt:
          "Fill the two blanks so the overlay router returns the fastest path, with its hops.",
        code: 'use petgraph::algo::astar;\nuse petgraph::visit::EdgeRef;\n\n// mesh: peers as nodes, live latency (ms) as edge weights.\n// Find the lowest-latency path from us (a) to peer d.\nlet best = astar(\n    &mesh,\n    a,               // start: us\n    |n| n == d,      // goal reached?\n    |e| *e.§0§(),    // path cost = latency, summed over the hops\n    |_| 0,           // heuristic 0 => plain Dijkstra\n);\n// astar returns Some((total_latency, hop_list)):\nlet (latency, path) = best.§1§("peer D is unreachable");',
        blanks: [
          { opts: ["weight", "cost", "node"], a: 0 },
          { opts: ["expect", "count", "len"], a: 0 },
        ],
        why: "`e.weight()` is the per-link latency the path sums — optimize any other field and you have picked the wrong metric. `astar` returns `Some((total_latency, hop_list))`, so `expect` unwraps it; the hop list is the part plain `dijkstra` will not give you, and it is how you learn *send to B, who forwards to D*.",
      },
      {
        id: "t05e2",
        kind: "SEQUENCE LAB",
        title: "Design the peer-exchange protocol",
        type: "order",
        prompt:
          "You are designing the wire format nodes use to advertise themselves, then the receive path. Order it from first design decision to final merge.",
        items: [
          "List what each node advertises: its stable key (identity), current endpoints, and the overlay CIDRs it owns",
          "Wrap it in a versioned record — a type/version tag up front so the format can evolve without breaking older nodes",
          "Stamp each record with its origin key and a monotonic sequence number, so newer info supersedes older regardless of path",
          "Sign the record with the origin's key, so a relaying peer cannot forge or tamper with it in flight",
          "Gossip the signed record to a few random peers rather than flooding the whole mesh",
          "On receipt: verify the signature, keep the highest sequence per origin, then re-gossip only if it was new",
        ],
        why: "Fields → versioning → freshness → authenticity → gossip → merge. Designing the wire format is deciding what a record contains and how it is superseded (T05L3); the receive path is convergence and trust (T05L2) made concrete. Sign after the sequence number so the signature covers it.",
      },
    ],
    quiz: {
      id: "t05q",
      questions: [
        {
          q: "A coordinated mesh's coordinator goes offline for an hour (control plane only; the data path is peer-to-peer). What happens?",
          opts: [
            "Every tunnel drops immediately — all traffic routes through the coordinator",
            "Existing tunnels keep flowing, but no new node can join and ACL/key changes stall",
            "Nothing at all changes; the coordinator is purely cosmetic",
            "Only relayed connections survive; direct ones fail",
          ],
          a: 1,
          why: "Control plane ≠ data path. Established peer-to-peer tunnels never needed the coordinator, so they persist — but joins, ACL propagation, and revocation freeze, because those are exactly what the coordinator is the single point of. A decentralized mesh has no such brain to lose (and no authoritative roster either).",
        },
        {
          q: "Why is revoking a compromised node harder in a decentralized (shared-secret) mesh than in a coordinated one?",
          opts: [
            "Decentralized meshes cannot encrypt traffic",
            "Membership is proven by a shared network secret, so there is no per-node account to delete — you must rotate the secret everywhere",
            "Nodes have no identity without a coordinator, so they cannot be named",
            "It is actually easier — any peer can evict any other",
          ],
          a: 1,
          why: "Name + secret admission makes every member interchangeable proof of belonging: there is no database row to strike. Instant, auditable revocation is precisely what the coordinated model buys with its central authority.",
        },
        {
          q: "Overlay link-state routing reuses N10's algorithm but changes one thing. What?",
          opts: [
            "It replaces Dijkstra with BGP-style policy",
            "It routes on MAC addresses instead of IPs",
            "The edge cost becomes live measured latency instead of static bandwidth-derived cost, so the graph re-weights as conditions change",
            "It uses raw hop count and ignores any metric",
          ],
          a: 2,
          why: "Same link-state map, same shortest-path — but 'shortest' now means 'lowest current latency.' A congested link's cost rises and the path quietly reroutes: the automatic version of N10's manual traffic engineering.",
        },
        {
          q: "Your client cannot hole-punch a direct path to peer D, yet its overlay router returns the path A→C→D through an ordinary peer C. Why is this both correct and safe?",
          opts: [
            "It is a routing loop and should be discarded",
            "The unreachable direct link simply is not an edge, so shortest-path yields a two-hop relay for free — and C forwards ciphertext it cannot read, so the relay is untrusted-safe",
            "C was vetted and trusted by the coordinator",
            "C only relays handshakes, never real data",
          ],
          a: 1,
          why: "Model only working links as edges and relay-through-peer falls out of the same astar result that picks direct links — a one-hop path is 'direct,' a two-hop path is 'relay via the middle.' And because A and D encrypted end-to-end first (T02/T03), C is just an untrusted bent pipe, exactly like a DERP relay (T04).",
        },
      ],
    },
  },
];
