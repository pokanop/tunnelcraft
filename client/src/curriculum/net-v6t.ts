import type { Module } from "./types";

/* Networking fundamentals — IPv6 transition module: NAT64, DNS64, 464XLAT,
   and the v6-only survival kit for a tunnel client. N14 introduced the cast;
   this module is the machinery — because v6-only cellular is exactly where
   VPN clients break in the field, and Apple tests for it. */

export const NET_V6T: Module[] = [
  {
    id: "n19",
    code: "N19",
    title: "IPv6 Transition: NAT64, DNS64 & 464XLAT",
    layers: ["L3", "L7"],
    est: "~80 min",
    tag: "The machinery that lets an IPv6-only network fake the IPv4 internet — prefix embedding, synthesized DNS, the CLAT/PLAT relay — and the v6-only gauntlet every serious tunnel client must survive, because Apple tests for it and carriers deploy it.",
    lessons: [
      {
        id: "n19l1",
        title: "One internet, two protocols: the transition zoo",
        est: "~12 min",
        blocks: [
          {
            p: "N05 ended on an honest note: IPv6 adoption is a decades-long coexistence, not a cutover. The engineering question is *how* two incompatible internets share one world, and every answer falls into three families. **Dual-stack** — run both, pick per connection (Happy Eyeballs, N05/N12) — is the gold standard, but it has a fatal dependency: every host still needs an IPv4 address, and *IPv4 addresses running out is the entire problem*. So the industry built workarounds in two opposite directions.",
          },
          {
            ul: [
              "**Tunneling** — carry one protocol inside the other. **6in4/6rd** carried v6 islands over v4 oceans (the early days); **DS-Lite** inverts it for the modern ISP: the access network is v6-only, and customer v4 traffic rides a v4-in-v6 tunnel to a carrier box (the AFTR) that CGNATs it. IPv4 packets survive end to end — they just commute inside IPv6.",
              "**Stateless mapping** — **MAP-E/MAP-T** shard a public IPv4 address *algorithmically*: each customer's CPE is delegated a slice of ports, encoded in its IPv6 prefix, so the carrier box needs no per-flow state at all. Elegant, and quietly common in wireline broadband.",
              "**Translation** — abolish IPv4 on the network entirely and *rewrite* packets between families at the edge. This is **NAT64** and friends — and it's what mobile chose.",
            ],
          },
          {
            p: "Why did cellular pick the most radical option? Operations and economics. A single-stack network is one addressing plan, one routing table, one thing to monitor — across tens of millions of subscribers that halving matters. Translation state is needed only for flows to *legacy* destinations, and that share shrinks every year as the big content sources (which dominate mobile traffic) publish AAAA records — a v6-only phone reaches YouTube natively, no translator involved. The translation apparatus is a ramp designed to become less load-bearing over time. Meanwhile your phone's interface may carry **no real IPv4 address at all** — which is the situation the rest of this module equips you for.",
          },
          {
            note: "DS-Lite and NAT64 are duals: DS-Lite keeps IPv4 real and tunnels it; NAT64 deletes IPv4 and fakes it back on demand. Wireline mostly tunnels, mobile mostly translates — and your tunnel client will meet both, so diagnose by evidence (the tells in this module), not by assumption.",
            label: "tunnel it or fake it",
          },
        ],
      },
      {
        id: "n19l2",
        title: "NAT64: rewriting one internet into another",
        est: "~14 min",
        blocks: [
          {
            p: "The core trick is an *addressing embed* (RFC 6052): every IPv4 address gets a synthetic IPv6 alias by placing its 32 bits inside a reserved 96-bit prefix. The **well-known prefix** is `64:ff9b::/96` — so `203.0.113.7` (hex `cb.00.71.07`) becomes `64:ff9b::cb00:7107`. A v6-only client sends to that alias; the **NAT64 gateway** owns the prefix, extracts the low 32 bits, and re-emits a genuine IPv4 packet. Carriers may instead use a **network-specific prefix** from their own space (and `64:ff9b:1::/48` is reserved for local deployments), which is why *discovering* the prefix is a real problem — next lesson.",
          },
          {
            p: "Translation comes in two temperaments. **Stateful NAT64** (RFC 6146) is N11's NAPT with a family change: many v6 clients share a pool of public v4 addresses, per-flow bindings map `(v6 source, port)` to `(v4 address, port)`, and — exactly like CGNAT (N14) — only client-initiated flows work, and idle bindings get reaped on aggressive timers. **Stateless translation** (SIIT, RFC 7915) is a pure algorithm: one-to-one address mapping, no table, no timeout — it can't share addresses, but it never forgets a flow, and it's the building block 464XLAT uses on the phone.",
          },
          {
            p: "Rewriting headers between families is not cosmetic surgery. The translator must rebuild the IP header (v6 is 20 bytes larger — remember that number, it comes back as MTU), map **ICMPv6 ↔ ICMP** faithfully — mistranslate Packet Too Big and you've silently broken PMTUD (N01's black-hole lesson, now with an accomplice) — and fix transport checksums that cover pseudo-headers from the wrong family. And anything that *embeds addresses above L3* breaks unaided: FTP and SIP carry literals in their payloads, IPsec AH authenticates the very header being rewritten. A modern UDP-based tunnel like WireGuard sails through — to the translator it's just a UDP flow — which is quiet good news for T03.",
          },
          {
            note: "Diagnostic tell: `64:ff9b::` anywhere in a capture or a socket's peer address means you are watching translation happen — the destination 'IPv6 host' is an IPv4 server wearing a costume. Decode the low 32 bits and you have the real address. On a carrier's custom prefix the costume is better, but the /96-with-v4-in-the-tail shape is the same.",
            label: "reading the costume",
          },
        ],
      },
      {
        id: "n19l3",
        title: "DNS64 and the art of the well-meant lie",
        est: "~13 min",
        blocks: [
          {
            p: "NAT64 has a bootstrap problem: clients only send to the magic prefix if something *gives them* prefix-embedded addresses. That something is **DNS64** (RFC 6147), a resolver behavior: when a client asks for AAAA and the name has real IPv6 addresses, answer honestly; when the name is v4-only, take its A record, embed it in the NAT64 prefix, and return the synthesized AAAA as if it were real. The client believes it's talking to a v6 host; the resolver and gateway conspire to keep the illusion airtight. N12 taught you DNS as a distributed database — DNS64 is that database *editorializing*.",
          },
          {
            diagram: {
              kind: "seq",
              title: "DNS64 synthesizes an answer",
              actors: [
                { id: "c", label: "v6-only client", tone: "l7" },
                { id: "r", label: "DNS64 resolver", tone: "acc" },
                { id: "a", label: "Authoritative", tone: "dim" },
              ],
              steps: [
                { from: "c", to: "r", label: "AAAA? legacy.example", tone: "l7" },
                { from: "r", to: "a", label: "AAAA?", tone: "dim" },
                { from: "a", to: "r", label: "no AAAA", sub: "v4-only name", tone: "dim" },
                { from: "r", to: "a", label: "A?", tone: "dim" },
                { from: "a", to: "r", label: "A 203.0.113.7", tone: "l3" },
                { note: "embed the A record in the NAT64 prefix", tone: "acc" },
                {
                  from: "r",
                  to: "c",
                  label: "AAAA 64:ff9b::cb00:7107",
                  sub: "synthesized — signed by nobody",
                  tone: "acc",
                },
              ],
              caption:
                "An honest 'no AAAA' becomes a helpful lie that steers the client into the NAT64 — which is why DNSSEC validators and pinned resolvers fall through the illusion.",
            },
          },
          {
            p: "Lies have failure modes, and DNS64's are exactly where sophisticated clients live. **DNSSEC**: a synthesized AAAA is signed by nobody, so a validating stub that sets DO+CD and checks signatures itself (N12) gets the honest answer — no AAAA exists — and the connection never happens. Security working as designed, connectivity broken as designed. **Resolver bypass**: DNS64 lives in the *carrier's* resolver, so an app pinned to its own DoH/DoT resolver — or a VPN pushing in-tunnel DNS — gets real, unsynthesized answers, and its v4-only destinations become unreachable without a CLAT. And the classic from N14: an **IPv4 literal** never touches DNS at all, so nothing gets the chance to lie helpfully.",
          },
          {
            p: "Which raises the question DNS64 can't answer: how does a *client* learn the NAT64 prefix, so it can do its own synthesis? Two standard tricks. **RFC 7050**: query AAAA for `ipv4only.arpa` — a name guaranteed to have only A records (192.0.0.170/171). Any AAAA that comes back *must* be synthesized, and subtracting the known v4 bits exposes the prefix. It's a canary domain: its only job is to get lied to, observably. **PREF64** (RFC 8781): the router simply announces the prefix in Router Advertisements (N05's RA machinery, one more option field) — no DNS heuristics, works even when the network skips DNS64 entirely, and Apple and Android platforms consume it eagerly.",
          },
          {
            note: "Keep the division of labor straight: NAT64 is data plane (rewrites packets), DNS64 is control plane (steers clients into the rewriter by synthesizing answers). Networks can run NAT64 *without* DNS64 (PREF64 + client-side synthesis or a CLAT does the steering). That combination is increasingly common — and it's what a device-local resolver setup effectively becomes.",
            label: "data plane vs control plane",
          },
        ],
      },
      {
        id: "n19l4",
        title: "464XLAT: two lies that make a truth",
        est: "~13 min",
        blocks: [
          {
            p: "DNS64 saves hostname users; nothing so far saves the app that opens an AF_INET socket to a literal. **464XLAT** (RFC 6877) closes that last gap with a relay of two translators. On the phone, the **CLAT** (customer-side) presents a fake IPv4 interface — addressed from `192.0.0.0/29`, reserved for exactly this — and *statelessly* (RFC 7915) translates each v4 packet into v6: source becomes a dedicated v6 address of the phone's, destination becomes the prefix-embedded alias. In the carrier core, the **PLAT** (provider-side) is just stateful NAT64: strip the prefix, allocate a shared public v4:port, emit a native v4 packet. Read the name right to left: v4 (app) over 6 (network) to 4 (internet) — 464, by translation (XLAT).",
          },
          {
            diagram: {
              kind: "flow",
              title: "464XLAT: the two-translator relay",
              nodes: [
                { label: "v4 app", sub: "192.0.0.x", tone: "l7" },
                { label: "CLAT", sub: "on-phone · stateless", tone: "acc" },
                { label: "v6-only core", sub: "native IPv6", tone: "l3" },
                { label: "PLAT", sub: "stateful NAT64", tone: "acc" },
                { label: "v4 server", sub: "203.0.113.7", tone: "l7" },
              ],
              arrows: ["v4", "v6 · dst=prefix+v4", "v6", "v4"],
              caption:
                "4-over-6-to-4: stateless where the mapping is one-to-one (CLAT), stateful only where subscribers share addresses (PLAT).",
            },
          },
          {
            p: "The state lives exactly where it must and nowhere else. The CLAT can be stateless because its mapping is one-to-one — this phone's private v4 to this phone's dedicated v6 — no ports shared, nothing to remember, and with a *checksum-neutral* choice of v6 address (pick the interface bits so the v6 addresses sum to the same checksum contribution as the v4 ones) the translator doesn't even have to touch transport checksums. The PLAT holds the per-flow bindings, because that's where thousands of subscribers converge onto a few public addresses — N11's port-sharing arithmetic, one place in the network instead of millions.",
          },
          {
            p: "Platform reality check. **Android** has shipped a CLAT since 4.3: when the network signals NAT64 (PREF64, or the `ipv4only.arpa` probe), a `clat` interface appears and v4-only apps just work — invisible seatbelt. **Apple** took the opposite bet for a decade: no CLAT; instead `getaddrinfo` and the high-level stacks (Network.framework, NSURLSession) *synthesize* v6 addresses for v4 literals using the discovered prefix, and App Review mandates apps be v6-clean. Modern iOS does bring up a CLAT on cellular when the carrier advertises for it — but the NAT64 Wi-Fi you'll test on (next lesson) has none, and your client must not need one. And the 20 bytes from last lesson land here: translated flows lose header room, so CLAT interfaces advertise reduced MTUs — one more reason mobile tunnel MTU math (N01, P01's 1280 floor) starts pessimistic.",
          },
          {
            note: "Naming decoder, once and forever: NAT64 translates *from* v6 *to* v4 (client side first); the CLAT performs NAT46 (v4 in, v6 out); SIIT is the stateless algorithm either can be built on. If you can narrate a packet through CLAT → v6 core → PLAT and back without notes, you own this module.",
            label: "who translates what",
          },
        ],
      },
      {
        id: "n19l5",
        title: "The v6-only gauntlet: your tunnel client under NAT64",
        est: "~15 min",
        blocks: [
          {
            p: "Why does *your* product get the worst of this? Because a VPN client is precision-built to step around every safety net. It opens **raw UDP sockets** (no high-level API, no address synthesis). Its configs are full of **IP literals** (endpoints, DNS servers, allowed IPs). It **replaces DNS** (bye, DNS64). And it **installs routes** that interact with the OS's dual-stack preference logic. Apple has required apps to work on IPv6-only networks since June 2016 — App Review actually exercises this — and v6-only cellular is where the 'works on Wi-Fi, dies on LTE' tickets come from. Here is the failure catalog, with fixes.",
          },
          {
            ul: [
              "**The v4-literal endpoint.** On v6-only with no CLAT, `sendto(203.0.113.7:51820)` on a raw socket has no path — no DNS involved, nothing synthesizes. Fixes, in order of virtue: publish endpoints as **hostnames with both A and AAAA** (DNS64 handles the rest); if literals must be supported, resolve them through `getaddrinfo`/Network.framework so the platform can synthesize; or do it yourself — discover the prefix via `ipv4only.arpa`/PREF64 and embed the address, which is exactly what the WireGuard Apple client does.",
              "**Socket family assumptions.** Wi-Fi hands you dual-stack; cellular may hand you v6-only; a Wi-Fi → LTE transition (N14) can flip your *outer* family mid-session. WireGuard's cryptokey routing survives the identity change (T03) — but only if your socket layer can actually rebind across families. No hardcoded AF_INET anywhere in the outer path.",
              "**The bootstrap window.** Once the tunnel is up you're fine — see the note below. But everything *before* tunnel-up rides the naked v6-only network: resolving the endpoint, API/config fetches, captive-portal checks (P01). Audit every pre-tunnel connection for v6-cleanliness; this is where the subtle field failures hide.",
              "**The server side.** Publish AAAA and accept v6 — a v6-only client connecting *natively* skips the translator entirely, dodging its binding timeouts. When clients do arrive via NAT64, the PLAT's stateful bindings reap on idle exactly like CGNAT — N14's persistent-keepalive math applies to translators too.",
            ],
          },
          {
            p: "Now the reason this lesson exists: **you can test all of it at your desk**. A Mac with a wired uplink can host Apple's approved rig — System Settings → Sharing → hold **Option** while enabling Internet Sharing, and a **Create NAT64 Network** checkbox appears. The Mac stands up a v6-only Wi-Fi with NAT64+DNS64, the same class of network App Review uses. Join it from a test device and run the catalog above: literal endpoints, hostname endpoints, pre-tunnel fetches, mid-session path flips. Know the rig's limits, though — it has no CLAT, no CGNAT, no GTP latency, and carrier prefixes and timeouts differ — so the final exam is still a real v6-only SIM (many carriers are v6-only by default now; an APN setting often forces it).",
          },
          {
            note: "The calming truth to hold onto: *inside* the tunnel, IPv4 is real. Your v4 inner packets are encrypted payload riding one outer v6 UDP flow — the v6-only network never sees them, and no translator touches them. WireGuard is indifferent to outer family (T03): v4-in-v6 is a Tuesday. The entire NAT64 fight is about the outer connection and the bootstrap — win those, and the tunnel makes the whole problem disappear. That's the product pitch, incidentally: on hostile exotic networks, a good VPN *restores* normalcy.",
            label: "the tunnel is the cure",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "n19e1",
        type: "match",
        title: "Transition-mechanism vocabulary lock-in",
        kind: "MATCH LAB",
        prompt:
          "Match each piece of the v6-only apparatus to its role. These are the proper nouns in every IPv6-only bug report and every App Review rejection.",
        pairs: [
          {
            t: "64:ff9b::/96",
            d: "The well-known NAT64 prefix — an IPv4 address hides in the low 32 bits (RFC 6052)",
          },
          {
            t: "DNS64",
            d: "Resolver that synthesizes AAAA records from A records so v6-only clients get steered into the NAT64",
          },
          {
            t: "ipv4only.arpa",
            d: "Canary name with only A records — any AAAA answer must be synthetic, exposing the NAT64 prefix (RFC 7050)",
          },
          {
            t: "PREF64",
            d: "Router Advertisement option announcing the NAT64 prefix directly — no DNS heuristics needed (RFC 8781)",
          },
          {
            t: "CLAT",
            d: "On-device stateless v4→v6 translator presenting a fake IPv4 interface (192.0.0.0/29) to legacy apps",
          },
          {
            t: "PLAT",
            d: "Carrier-side stateful NAT64 where thousands of subscribers share public v4 addresses via per-flow bindings",
          },
        ],
        why: "Prefix, steering, discovery (both ways), and the two halves of 464XLAT — six terms that turn 'LTE is broken' tickets into five-minute diagnoses.",
      },
      {
        id: "n19e2",
        type: "order",
        title: "Life of an IPv4 packet on a v6-only network",
        kind: "SEQUENCE LAB",
        prompt:
          "An IPv4-only app on a v6-only Android phone connects to a v4-only server. Order the 464XLAT journey — and notice where state lives and where it doesn't.",
        items: [
          "The app opens an AF_INET socket; the packet lands on the phone's CLAT interface, addressed from 192.0.0.0/29",
          "The CLAT statelessly translates v4→v6: source becomes the phone's dedicated CLAT v6 address, destination embeds the server's v4 address in the NAT64 prefix",
          "The IPv6 packet crosses the carrier's v6-only RAN and core like any native flow (GTP underneath, N14)",
          "The PLAT strips the prefix, allocates a shared public IPv4:port binding, and emits a native v4 packet",
          "The server replies to the public binding; the PLAT looks up its state and translates back toward the CLAT's v6 address",
          "The CLAT translates v6→v4 algorithmically; the app receives an ordinary IPv4 packet, never suspecting two translations",
        ],
        why: "Stateless at the edge (one-to-one, nothing to remember), stateful in the core (where ports are shared) — and each stage has a diagnostic tell: 192.0.0.x on-device, the NAT64 prefix in transit, a CGNAT-style binding at the PLAT.",
      },
    ],
    quiz: {
      id: "n19q",
      questions: [
        {
          q: "How can a client discover the NAT64 prefix on a network it just joined?",
          opts: [
            "It can't — the prefix is carrier-internal and never exposed",
            "Query AAAA for ipv4only.arpa (only synthetic answers are possible) or read the PREF64 option in Router Advertisements",
            "Perform a traceroute and look for 64:ff9b:: hops",
          ],
          a: 1,
          why: "RFC 7050's canary domain exists to be lied to observably — subtract the known v4 bits and the prefix remains. RFC 8781's PREF64 skips the heuristics and announces it in the RA. Your client may need this to synthesize addresses for v4-literal endpoints.",
        },
        {
          q: "A DNSSEC-validating stub resolver on a v6-only NAT64/DNS64 network tries to reach a v4-only site. What happens?",
          opts: [
            "The synthesized AAAA validates because the carrier signs it",
            "Validation rejects or never sees the synthesized AAAA — the honest, signed answer has no IPv6 address, so the connection fails",
            "DNSSEC is disabled automatically on mobile networks",
          ],
          a: 1,
          why: "DNS64's synthesized record is signed by nobody. A stub that validates for itself gets the truthful answer — no AAAA — and truth here means no connectivity. Security and translation working exactly as designed, against each other.",
        },
        {
          q: "In 464XLAT, why can the CLAT be stateless while the PLAT must be stateful?",
          opts: [
            "The CLAT's mapping is one-to-one (this phone's v4 to this phone's v6) with nothing shared, while the PLAT multiplexes thousands of subscribers onto few public v4 addresses via per-flow port bindings",
            "The phone lacks the memory for connection state",
            "Stateful translation is impossible on battery-powered devices",
          ],
          a: 0,
          why: "State exists where sharing happens. One-to-one translation is a pure algorithm (RFC 7915) — no table, no timeouts. The many-to-few squeeze lives once, at the PLAT, which is just stateful NAT64 (RFC 6146) — N11's port arithmetic in one box instead of millions.",
        },
        {
          q: "Your WireGuard client works on v6-only cellular when the endpoint is a hostname but fails when it's an IPv4 literal. Why?",
          opts: [
            "Hostname resolution is faster than literal parsing",
            "A hostname passes through DNS, where DNS64 synthesizes a reachable v6 address; a literal on a raw UDP socket never touches DNS or the platform's synthesis, so nothing maps it into the NAT64",
            "Carriers block traffic to IPv4 literals for security",
          ],
          a: 1,
          why: "The whole illusion is built at name-resolution time. Fixes in order of virtue: A+AAAA hostnames; resolving literals via getaddrinfo/Network.framework so the OS synthesizes; or doing RFC 7050/PREF64 discovery and embedding the address yourself, as the WireGuard Apple client does.",
        },
        {
          q: "What does macOS's 'Create NAT64 Network' Internet Sharing option give you, and what doesn't it?",
          opts: [
            "A perfect replica of a carrier network, making device testing unnecessary",
            "A v6-only Wi-Fi with NAT64+DNS64 — the class of network App Review tests on — but with no CLAT, CGNAT, or carrier timing, so a real v6-only SIM is still the final exam",
            "An IPv4-only network for regression-testing legacy code paths",
          ],
          a: 1,
          why: "Hold Option while enabling Internet Sharing and the checkbox appears. It's the right rig for the failure catalog — literals, bootstrap fetches, family flips — but it approximates a carrier, not replicates one.",
        },
        {
          q: "Once your tunnel is up on a v6-only network, IPv4 traffic inside it works even with no CLAT anywhere. Why?",
          opts: [
            "The tunnel negotiates a CLAT with the carrier",
            "Inner v4 packets are encrypted payload inside one outer v6 UDP flow — the v6-only network never sees them and no translator is needed",
            "WireGuard automatically converts inner packets to IPv6",
          ],
          a: 1,
          why: "The network only ever handles the outer flow, which is native v6. Win the outer connection and the bootstrap, and the tunnel dissolves the entire translation problem — v4-in-v6 is a Tuesday (T03).",
        },
      ],
    },
  },
];
