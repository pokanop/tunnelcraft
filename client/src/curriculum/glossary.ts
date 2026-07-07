/* Curated glossary over the whole curriculum. `mod` is the module id where
   the term is taught, so the UI can deep-link to it. */
export interface GlossaryEntry {
  /** The term. */
  t: string;
  /** One- or two-sentence plain-language definition (may use `code` and **bold** inline markup). */
  d: string;
  /** Module id (e.g. "n15", "m04") where the term is primarily taught. */
  mod: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    t: "0-RTT",
    d: "Zero round-trip resumption — sending application data in the very first flight using keys from a previous session. It cuts latency but is **replayable**, so it is reserved for idempotent requests.",
    mod: "n11",
  },
  {
    t: "4-way handshake",
    d: "The 802.11 exchange that derives fresh session keys (the **PTK**) from the pairwise master key and proves both sides hold it — in WPA2-Personal, the capture attackers feed to offline password cracking.",
    mod: "n03",
  },
  {
    t: "464XLAT",
    d: "The IPv6-only survival kit for IPv4-only apps: a **CLAT** on the device fakes an IPv4 interface and translates to IPv6, and the operator's NAT64 translates back. Standard on modern cellular networks.",
    mod: "n14w",
  },
  {
    t: "802.1Q",
    d: "The VLAN tagging standard: a 4-byte tag inserted into the Ethernet header carrying the VLAN ID, so a single trunk link can carry many VLANs between switches.",
    mod: "n02",
  },
  {
    t: "802.1X",
    d: "The port-based access-control framework behind WPA-Enterprise: a **supplicant** (client) authenticates through an **authenticator** (AP or switch) to an authentication server before getting network access.",
    mod: "n06w",
  },
  { t: "A record", d: "The DNS record mapping a name to an IPv4 address.", mod: "n10" },
  { t: "AAAA record", d: "The DNS record mapping a name to an IPv6 address.", mod: "n10" },
  {
    t: "Acquire/Release",
    d: "The publication pair: a `Release` store makes all prior writes visible to any thread whose `Acquire` load observes that store — the happens-before edge behind “set the flag last, check the flag first”.",
    mod: "r07",
  },
  {
    t: "AEAD",
    d: "Authenticated Encryption with Associated Data — one primitive that encrypts and integrity-protects in a single pass, and binds unencrypted headers into the authentication tag. Modern protocols (TLS 1.3, WireGuard, QUIC) use nothing weaker.",
    mod: "m08",
  },
  {
    t: "AllowedIPs",
    d: "WireGuard's per-peer list of IP ranges, acting as both routing table (which peer gets this outbound packet) and firewall (is this decrypted inbound source legitimate).",
    mod: "m09",
  },
  {
    t: "ALPN",
    d: "Application-Layer Protocol Negotiation — the TLS extension where client and server agree what runs inside the connection (`h2`, `http/1.1`, …) during the handshake instead of spending a round trip after it.",
    mod: "n11",
  },
  {
    t: "Always-on VPN",
    d: "Android's setting that starts the VPN at boot and, with lockdown enabled, blocks any traffic not passing through it — the OS-enforced kill switch.",
    mod: "p03",
  },
  {
    t: "Anti-entropy",
    d: "The gossip technique where two nodes periodically compare and reconcile their state, healing whatever differs — how a decentralized peer table converges on one picture with no master copy.",
    mod: "t05",
  },
  {
    t: "Anti-replay window",
    d: "The receiver's sliding window over data-packet counters: anything older than the window or already seen is dropped, so captured packets cannot be replayed.",
    mod: "m08",
  },
  {
    t: "Anycast",
    d: "Advertising the same IP prefix from many locations and letting routing deliver each client to the nearest — how root DNS servers, CDNs, and DDoS scrubbing centers scale.",
    mod: "n08",
  },
  {
    t: "anyhow",
    d: "The application-side error crate: one flexible `anyhow::Error` that wraps anything and carries context, for binaries that report errors rather than match on them.",
    mod: "r05",
  },
  {
    t: "ARP",
    d: "Address Resolution Protocol — the L2 broadcast asking “who has this IP?” so a host learns the MAC address to frame a packet to. It is unauthenticated, which is exactly what ARP spoofing exploits.",
    mod: "n02",
  },
  {
    t: "AS_PATH",
    d: "The BGP attribute listing every autonomous system a route announcement has traversed — used to detect loops and, shorter-is-better, as a selection tiebreaker.",
    mod: "n08",
  },
  {
    t: "async/await",
    d: "Rust's syntax for asynchronous code: an `async fn` returns a lazy Future, and `.await` yields to the runtime at suspension points instead of blocking the thread — one thread can juggle thousands of sockets.",
    mod: "m05",
  },
  {
    t: "Atomic",
    d: "Types like `AtomicU64` whose operations are indivisible and race-free by definition — the escape hatch for sharing mutable state without locks, always paired with a memory ordering.",
    mod: "r07",
  },
  {
    t: "Authoritative server",
    d: "A DNS server that holds the actual records for a zone and answers for it definitively — the end of every resolution chain.",
    mod: "n10",
  },
  {
    t: "Autonomous system",
    d: "A network under one administrative routing policy — an ISP, a cloud, a large enterprise — identified by an AS number and speaking BGP to its neighbors.",
    mod: "n08",
  },
  {
    t: "Bandwidth-delay product",
    d: "Bandwidth × round-trip time — the number of bytes a path holds “in flight”. Windows must be at least this large to keep the pipe full, which is why long fat pipes need window scaling.",
    mod: "n07",
  },
  {
    t: "BBR",
    d: "Bottleneck Bandwidth and RTT — congestion control that models the path's bandwidth and minimum RTT instead of reacting to loss, keeping queues short where loss-based algorithms like CUBIC fill buffers.",
    mod: "n07",
  },
  {
    t: "Beacon",
    d: "The frame an AP broadcasts several times a second advertising its SSID, rates, and capabilities — how clients discover networks passively; a **probe request/response** is the active version of the same discovery.",
    mod: "n03",
  },
  {
    t: "BGP",
    d: "Border Gateway Protocol — the path-vector protocol gluing the internet's autonomous systems together. Route selection encodes business relationships as much as topology, which is why leaks and hijacks are policy failures.",
    mod: "n08",
  },
  {
    t: "Borrow checker",
    d: "The compiler pass that enforces ownership and borrowing rules at compile time, rejecting use-after-free, dangling references, and aliased mutation before the program ever runs.",
    mod: "m04",
  },
  {
    t: "Borrowing",
    d: "Taking a reference to a value without taking ownership: any number of shared `&T` references, or exactly one exclusive `&mut T` — never both at once.",
    mod: "m04",
  },
  {
    t: "Broadcast domain",
    d: "The set of devices that receive each other's L2 broadcasts, such as ARP requests. Only a router or a VLAN boundary ends it.",
    mod: "n02",
  },
  {
    t: "Bufferbloat",
    d: "Latency caused by oversized buffers in routers and modems: loss-based TCP fills them before anything drops, so every packet waits in a long queue. It is why one big upload wrecks your video call.",
    mod: "n07",
  },
  {
    t: "Builder pattern",
    d: "The idiomatic construction pattern for objects with many optional fields: `Config::builder().peer(k).endpoint(e).build()?` — validation concentrates in `build()`, avoiding Option-soup constructor arguments.",
    mod: "r05",
  },
  {
    t: "Cache poisoning",
    d: "Tricking a resolver into caching a forged answer so every later client receives the attacker's IP — the attack class DNSSEC and randomized query IDs exist to stop.",
    mod: "n10",
  },
  {
    t: "Cancellation safety",
    d: "Whether a future can be dropped mid-await without losing data or corrupting state — the property `select!` silently demands, since every losing branch gets cancelled.",
    mod: "m05",
  },
  {
    t: "Captive portal",
    d: "The hotel-Wi-Fi pattern that hijacks traffic to a login page until you authenticate — a headache for VPN clients, which must let the portal check through before locking the tunnel down.",
    mod: "n03",
  },
  {
    t: "Cargo features",
    d: "Compile-time flags that switch optional code and dependencies on or off. They must be **additive** — enabling a feature may only add capability, because Cargo unions features across the dependency graph.",
    mod: "r04",
  },
  {
    t: "Cargo workspace",
    d: "One repository holding multiple crates that share a lockfile and target directory — how real projects split a core library, an FFI layer, and binaries while resolving dependencies once.",
    mod: "r04",
  },
  {
    t: "catch_unwind",
    d: 'The guard every FFI entry point needs: it catches a Rust panic before it crosses the `extern "C"` boundary — where unwinding is undefined behavior or an abort — and converts it to an error code.',
    mod: "r07",
  },
  {
    t: "cbindgen",
    d: 'The tool that generates a C header from your Rust `extern "C"` API, so the Swift, Kotlin, or C side compiles against real signatures instead of hand-copied ones.',
    mod: "r07",
  },
  {
    t: "Certificate Authority",
    d: "An organization browsers and OSes trust to vouch for identity: it signs server certificates, and trust chains from a preinstalled root down to the leaf a server presents.",
    mod: "n11",
  },
  {
    t: "Certificate pinning",
    d: "Accepting only specific keys or certificates for a host instead of anything a trusted CA signed — tighter than the CA model, but it bricks connectivity when rotation is not planned.",
    mod: "n11",
  },
  {
    t: "CGNAT",
    d: "Carrier-Grade NAT — the ISP NATs you again (usually into `100.64.0.0/10`), so you share a public IP with strangers: inbound is dead on arrival, mappings are ruthlessly recycled, and IP reputation is shared. Default on cellular.",
    mod: "n14w",
  },
  {
    t: "ChaCha20-Poly1305",
    d: "The AEAD pairing the ChaCha20 stream cipher with the Poly1305 authenticator — fast in pure software on every CPU, no AES hardware required. WireGuard's data-plane cipher.",
    mod: "m08",
  },
  {
    t: "Channel (mpsc)",
    d: "Message-passing pipes between tasks: senders hand values to a receiver, transferring ownership. Bounded channels double as backpressure, slowing producers when consumers lag.",
    mod: "m05",
  },
  {
    t: "CIDR",
    d: "Classless Inter-Domain Routing — writing networks as prefix/length (`10.0.0.0/8`), where the length says how many leading bits are network. The notation behind subnetting, route tables, and AllowedIPs alike.",
    mod: "n05",
  },
  {
    t: "CLAT",
    d: "Customer-side translator in 464XLAT — presents a fake IPv4 interface on the device and statelessly translates v4 packets to v6 before the carrier's NAT64 takes over.",
    mod: "n19",
  },
  {
    t: "Clippy",
    d: "Rust's official lint suite — hundreds of checks for correctness hazards and unidiomatic code. Treat it as a style mentor and enforce it in CI.",
    mod: "r04",
  },
  {
    t: "CLOSE_WAIT",
    d: "The state where the kernel has ACKed the peer's FIN and is waiting for **your application** to `close()` the socket. Unlike TIME_WAIT it never clears itself — CLOSE_WAIT piling up is always an application-side leak.",
    mod: "n07",
  },
  {
    t: "CNAME record",
    d: "Canonical name — a DNS alias saying “this name is really that name”; resolution restarts at the target. It cannot coexist with other record types at the same name.",
    mod: "n10",
  },
  {
    t: "Community node",
    d: "An ordinary mesh member — usually on a stable public address — that volunteers as an always-reachable rendezvous and relay point, letting strangers bootstrap without a dedicated discovery server. Anyone can run one; also called a public shared node.",
    mod: "t05",
  },
  {
    t: "Compare-and-swap (CAS)",
    d: "The atomic primitive under every lock and lock-free structure — `compare_exchange`: 'if the value is still what I expect, replace it; otherwise tell me what it was.' Rust's spelling takes two memory orderings, one for success and one for failure.",
    mod: "r07",
  },
  {
    t: "Congestion window",
    d: "The sender-side cap (`cwnd`) TCP puts on data in flight to avoid overloading the network — grown as ACKs arrive, slashed on loss. The effective send rate is bounded by min(cwnd, rwnd).",
    mod: "n07",
  },
  {
    t: "CONNECT-IP",
    d: "RFC 9484 — the MASQUE method extending HTTP CONNECT to whole IP packets carried in QUIC DATAGRAM frames: a full VPN data plane inside what looks like HTTPS.",
    mod: "m12",
  },
  {
    t: "CONNECT-UDP",
    d: "RFC 9298 — the MASQUE method extending HTTP CONNECT to proxy individual UDP flows over HTTP/3, the UDP sibling of CONNECT-IP.",
    mod: "m12",
  },
  {
    t: "Connection draining",
    d: "A load balancer letting a deregistering backend finish its in-flight requests while refusing to send it new ones — the mechanism behind zero-downtime deploys. Also called deregistration delay.",
    mod: "n16",
  },
  {
    t: "Control plane",
    d: "The part of a network that decides identity, membership, and routes, as opposed to the **data plane** that forwards packets. Its topology — coordinated versus decentralized — is a design axis independent of how traffic actually flows.",
    mod: "t05",
  },
  {
    t: "Cookie (WireGuard)",
    d: "WireGuard's DoS armor: under load, a responder replies with a cookie the initiator must echo, proving IP ownership before the responder spends CPU on expensive handshake crypto.",
    mod: "m08",
  },
  {
    t: "Cooperative scheduling",
    d: "Async tasks yield only at `.await`; a task that computes or blocks without awaiting starves every other task on that worker. Tokio's task budget forces perpetually-ready tasks to yield eventually.",
    mod: "r06",
  },
  {
    t: "Coordinated control plane",
    d: "A mesh whose identity, ACLs, and peer list come from a central coordinator (the Tailscale model). Buys crisp, instant revocation, but the coordinator is a single point of control failure and trust — even though it never carries packets.",
    mod: "t05",
  },
  {
    t: "Cryptokey routing",
    d: "WireGuard's core idea: the mapping between public keys and IP ranges *is* the routing and identity layer — a packet from a peer is valid only if its source IP falls in that peer's AllowedIPs.",
    mod: "m09",
  },
  {
    t: "CSMA/CA",
    d: "Carrier Sense Multiple Access with Collision Avoidance — Wi-Fi's medium-access rule: listen before transmitting, back off a random amount, and require an ACK per frame, because collisions cannot be detected over radio.",
    mod: "n03",
  },
  {
    t: "Daemon",
    d: "The long-lived privileged service that owns the tunnel, sockets, and routes, while the GUI is a thin client talking to it over local IPC — the split that survives UI crashes, logout, and upgrades.",
    mod: "m11",
  },
  {
    t: "Data race",
    d: "Two threads accessing the same memory without synchronization, at least one writing — instant undefined behavior in Rust. Atomics and locks exist to make cross-thread access ordered.",
    mod: "r07",
  },
  {
    t: "DDoS",
    d: "Distributed Denial of Service — drowning a target with traffic from many sources: volumetric floods, protocol/state exhaustion, or expensive application-layer requests. Defended with anycast dispersion and scrubbing.",
    mod: "n13",
  },
  {
    t: "Deauthentication attack",
    d: "Spoofing an unauthenticated 802.11 management frame 'from' the AP to kick a victim off Wi-Fi — repeated for denial of service, or once to force a reconnect onto an evil twin or re-capture the 4-way handshake. **PMF** (mandatory in WPA3) closes it.",
    mod: "n03",
  },
  {
    t: "Decentralized control plane",
    d: "A mesh with no coordinator: membership is a shared secret, any peer bootstraps a newcomer, and peer/route information gossips node-to-node. Survives infrastructure loss and censorship, but converges eventually and revokes slowly.",
    mod: "t05",
  },
  {
    t: "Default deny",
    d: "The stance where nothing passes unless explicitly allowed — the foundation of serious firewall policy. Its opposite, default allow plus blocklists, always misses something.",
    mod: "n13",
  },
  {
    t: "Default gateway",
    d: "The router a host sends traffic to when the destination is not on the local subnet — the first hop out of your L2 network.",
    mod: "n02",
  },
  {
    t: "DERP",
    d: "Designated Encrypted Relay for Packets — Tailscale's relay fleet: it forwards still-encrypted WireGuard packets addressed by recipient public key, so relays remain useful while staying untrusted.",
    mod: "m10",
  },
  {
    t: "Device posture",
    d: "The device-health facts — OS version, disk encryption, endpoint protection running — a zero-trust system checks before and during access; connection stops being a one-time gate and becomes a continuously re-evaluated verdict.",
    mod: "m12",
  },
  {
    t: "DHCP",
    d: "Dynamic Host Configuration Protocol — how a host joining a network leases an IP address plus gateway, mask, DNS, and other options, via a broadcast exchange on UDP 67/68.",
    mod: "n15",
  },
  {
    t: "DHCP relay",
    d: "A router function that forwards local DHCP broadcasts as unicast to a central server, stamping the origin subnet into `giaddr` so the server picks the right scope — one server, many VLANs.",
    mod: "n15",
  },
  {
    t: "dig",
    d: "The DNS query tool of record: ask any server for any record type, see the full response with TTLs and flags, and walk delegation with `+trace`.",
    mod: "n12",
  },
  {
    t: "DMZ",
    d: "Demilitarized zone — the network segment where internet-facing servers live, filtered from both the internet *and* the internal LAN, so a compromised public server can't pivot inward. The classic blast-radius segmentation pattern.",
    mod: "n13",
  },
  {
    t: "DNS leak",
    d: "DNS queries escaping the VPN tunnel to a local or ISP resolver, revealing every domain you visit even while the traffic itself stays encrypted.",
    mod: "m03",
  },
  {
    t: "DNS64",
    d: "The resolver trick on IPv6-only networks: when a name has only an A record, synthesize an AAAA inside the NAT64 prefix so v6-only clients can reach v4-only servers. IPv4 literals sail past it — that is what 464XLAT fixes.",
    mod: "n14w",
  },
  {
    t: "DNSSEC",
    d: "DNS Security Extensions — signatures over DNS records forming a chain of trust from the root down, letting resolvers verify answers were not forged. It authenticates data; it does not encrypt queries.",
    mod: "n10",
  },
  {
    t: "DoH",
    d: "DNS over HTTPS — DNS queries carried inside ordinary HTTPS, hiding them from on-path observers and making them hard to block selectively. Siblings: DoT (TLS on port 853) and DoQ (QUIC).",
    mod: "n10",
  },
  {
    t: "DORA",
    d: "Discover, Offer, Request, ACK — DHCP's four-packet lease dance: the client broadcasts a Discover, servers Offer, the client Requests one offer, and that server ACKs.",
    mod: "n15",
  },
  {
    t: "DTLS",
    d: "Datagram TLS — TLS reworked for unreliable transports: explicit sequence numbers and epochs, handshake retransmission timers, and a replay window. It secures WebRTC and several VPN data planes.",
    mod: "n11",
  },
  {
    t: "Dual-stack",
    d: "Running IPv4 and IPv6 side by side on the same hosts and network, letting each connection pick its family — the mainstream transition strategy.",
    mod: "n04",
  },
  {
    t: "EAP",
    d: "Extensible Authentication Protocol — the pluggable envelope 802.1X uses to carry the actual authentication method (PEAP, EAP-TLS, …) between the client and the RADIUS server.",
    mod: "n06w",
  },
  {
    t: "EAP-TLS",
    d: "The EAP method that authenticates with client certificates instead of passwords — nothing phishable or crackable on the air. The enterprise gold standard, usually paired with MDM-deployed certificates.",
    mod: "n06w",
  },
  {
    t: "ECH",
    d: "Encrypted Client Hello — the TLS extension that encrypts the ClientHello (including SNI) to a key published in DNS, closing the handshake's last plaintext leak.",
    mod: "n11",
  },
  {
    t: "ECMP",
    d: "Equal-Cost Multipath — when several routes tie on cost, traffic is spread across them by hashing the 5-tuple so each flow sticks to one path and avoids reordering.",
    mod: "n08",
  },
  {
    t: "Encapsulation",
    d: "Wrapping each layer's data inside the layer below's header as a packet descends the stack — an HTTP payload rides inside TCP, inside IP, inside an Ethernet frame — and peeling the layers off in reverse on arrival.",
    mod: "m01",
  },
  {
    t: "Endpoint-independent mapping",
    d: "NAT behavior where one internal socket gets the same public ip:port no matter the destination — the friendly kind that makes UDP hole punching possible.",
    mod: "m03",
  },
  {
    t: "Entitlement",
    d: "The Apple-granted capability flag baked into code signing (e.g. `packet-tunnel-provider`); without it, the OS refuses to even load your extension.",
    mod: "p01",
  },
  {
    t: "epoll",
    d: "Linux's readiness-based I/O notification API: it tells you which sockets a syscall would now succeed on, and you do the I/O yourself. The counterpoint is **completion** models (Windows IOCP, io_uring), where the kernel does the I/O and tells you when it's done — Rust async grew up readiness-shaped.",
    mod: "r06",
  },
  {
    t: "Ethernet frame",
    d: "The L2 unit on wired networks: destination and source MAC addresses, an EtherType saying what the payload is, the payload itself, and a trailing FCS checksum.",
    mod: "n02",
  },
  {
    t: "Evil twin",
    d: "A rogue access point broadcasting a trusted network's SSID to lure clients into associating, putting the attacker on-path. A VPN is the classic defense on untrusted Wi-Fi.",
    mod: "n03",
  },
  {
    t: "Executor",
    d: "The loop that owns tasks and drives them by calling `poll`, parking when nothing is ready and waking on `Waker` notifications — tokio's scheduler is one.",
    mod: "r06",
  },
  {
    t: 'extern "C"',
    d: "The declaration that a function uses the C calling convention — how Rust exports functions to other languages and declares the foreign ones it calls.",
    mod: "r07",
  },
  {
    t: "Fail-closed",
    d: "The safety posture where a failure blocks traffic rather than letting it escape unencrypted — what a **kill switch** implements. The opposite, fail-open, is what naive route-based VPNs do when the tunnel process dies.",
    mod: "m11",
  },
  {
    t: "Fast retransmit",
    d: "TCP resending a segment after **three duplicate ACKs** instead of waiting for the retransmission timeout — the receiver's repeated 'I'm still missing X' is treated as proof of loss, recovering in a round-trip instead of a timeout.",
    mod: "n07",
  },
  {
    t: "FFI",
    d: "Foreign Function Interface — calling across the C ABI in either direction. The rules: `#[repr(C)]` layouts, no unwinding across the boundary, and explicit ownership contracts — who allocates must free.",
    mod: "r07",
  },
  {
    t: "FIN",
    d: "The TCP flag that closes **one direction** of a connection. A clean teardown is FIN → ACK in each direction (four packets, often coalesced to three); the side that sends the first FIN inherits TIME_WAIT.",
    mod: "n07",
  },
  {
    t: "Forward proxy",
    d: "A server that makes requests on clients' behalf: the client asks the proxy, the proxy talks to the destination — the corporate egress point where policy, logging, and authentication live.",
    mod: "p04",
  },
  {
    t: "Forward secrecy",
    d: "The property that stealing a long-term private key later does not decrypt recorded past traffic, because each session used ephemeral keys that were discarded.",
    mod: "m08",
  },
  {
    t: "Framing",
    d: "Turning a raw byte stream into discrete messages — length prefixes, delimiters, or fixed sizes. TCP guarantees bytes, not message boundaries, so every protocol over it needs framing.",
    mod: "m06",
  },
  {
    t: "From/Into",
    d: "The standard conversion traits: implement `From<A> for B` and you get `Into` for free, plus `?`'s automatic error conversion — the glue of idiomatic APIs.",
    mod: "r05",
  },
  {
    t: "Full tunnel",
    d: "VPN mode where the default route points into the tunnel and everything rides it — maximal privacy and control, at the price of latency and hauling all the traffic.",
    mod: "m11",
  },
  {
    t: "Future",
    d: "Rust's unit of async work: a state machine with one method, `poll`, returning `Ready(value)` or `Pending`. Futures are **lazy** — nothing happens until something polls them.",
    mod: "r06",
  },
  {
    t: "fwmark",
    d: "A Linux firewall mark stamped on packets (by nftables/iptables or a socket option) that policy-routing rules can match to choose a routing table — how WireGuard's own encrypted packets escape the tunnel's default route on Linux.",
    mod: "p03",
  },
  {
    t: "Gossip protocol",
    d: "An epidemic dissemination scheme where each node periodically exchanges state with a few random peers; a fact reaches everyone in about O(log N) rounds with smooth bandwidth, tolerating churn without a flood tree or coordinator.",
    mod: "t05",
  },
  {
    t: "GSO/GRO",
    d: "Generic Segmentation/Receive Offload — the kernel hands userspace one giant (up to 64 KB) 'packet' plus a header describing how to split it, so a VPN encrypts per batch instead of per MTU-sized packet. The single biggest userspace-VPN throughput win of recent years.",
    mod: "p03",
  },
  {
    t: "GTP",
    d: "GPRS Tunneling Protocol — the encapsulation mobile cores use to carry your IP traffic from the radio network to the packet gateway. Your phone's internet is itself a tunnel.",
    mod: "n14w",
  },
  {
    t: "Handshake",
    d: "Any protocol's opening ritual establishing shared state before data flows. Which one depends on context: TCP's **three-way handshake** (SYN exchange), TLS's certificate-and-keys handshake, Wi-Fi's **4-way handshake** (session keys), or WireGuard's 1-RTT Noise handshake.",
    mod: "n07",
  },
  {
    t: "Happens-before",
    d: "The visibility edge in the memory model: a `Release` store paired with an `Acquire` load guarantees the acquiring thread sees every write the releasing thread made beforehand. Without such an edge, threads have no agreed ordering of events.",
    mod: "r07",
  },
  {
    t: "Happy Eyeballs",
    d: "The client algorithm that races IPv6 and IPv4 connection attempts (slightly staggered) and uses whichever answers first, so broken IPv6 never leaves the user staring at a spinner.",
    mod: "n04",
  },
  {
    t: "Head-of-line blocking",
    d: "One lost or slow item stalling everything queued behind it — requests behind a response in HTTP/1.1, every stream behind one lost TCP segment in HTTP/2. QUIC's independent streams are the cure.",
    mod: "n11",
  },
  {
    t: "Hidden node",
    d: "Two Wi-Fi clients that both hear the access point but not each other, so their transmissions collide at the AP; RTS/CTS handshakes exist to work around it.",
    mod: "n03",
  },
  {
    t: "HKDF",
    d: "HMAC-based Key Derivation Function — the standard way to stretch a shared secret into multiple independent keys; each handshake step feeds it to ratchet the session's key material forward.",
    mod: "m08",
  },
  {
    t: "Hole punching",
    d: "Two NATed peers exchange reflexive addresses over a signaling channel, then transmit to each other **simultaneously**: each outbound packet opens its own NAT, so the peer's packets pass. Works for most NAT combinations — not symmetric ones.",
    mod: "m10",
  },
  {
    t: "HTTP CONNECT",
    d: "The proxy method that says “open a raw TCP pipe to host:port and get out of the way” — how HTTPS traverses an HTTP proxy, and the ancestor of MASQUE's tunnel-over-HTTP idea.",
    mod: "p04",
  },
  {
    t: "HTTP/3",
    d: "The HTTP version that runs over QUIC instead of TCP+TLS: streams are delivered independently, so one lost packet no longer stalls every request on the connection.",
    mod: "n11",
  },
  {
    t: "ICE",
    d: "Interactive Connectivity Establishment — the standard candidate dance: gather local, reflexive, and relay addresses, exchange them, probe every pairing, and settle on the best path that works.",
    mod: "m10",
  },
  {
    t: "ICMP",
    d: "Internet Control Message Protocol — IP's control channel for errors and diagnostics: echo request/reply (ping), destination unreachable, time exceeded, fragmentation needed.",
    mod: "n04",
  },
  {
    t: "IKE",
    d: "Internet Key Exchange — IPsec's control channel: it authenticates the two gateways, negotiates crypto parameters, and establishes the security associations that ESP then uses.",
    mod: "n16",
  },
  {
    t: "Interface metric",
    d: "Windows' tiebreaker among equal routes on different interfaces — lowest metric wins. VPN clients set an aggressive metric so the tunnel outranks the physical NIC without deleting its routes.",
    mod: "p02",
  },
  {
    t: "Interior mutability",
    d: "Mutating data through a shared `&T` — the pattern behind `Cell`, `RefCell`, `Mutex`, and atomics, all built on **UnsafeCell**, the one primitive the compiler blesses for it. The escape hatch from 'shared XOR mutable' that moves the check to runtime (or to the hardware).",
    mod: "r07",
  },
  {
    t: "IPsec",
    d: "The IP-layer VPN suite behind most site-to-site tunnels: IKE negotiates keys, then ESP encrypts and authenticates the packets, classically in tunnel mode.",
    mod: "n16",
  },
  {
    t: "Jitter",
    d: "Variation in latency — how much packet arrival times wobble around the average. Real-time traffic (calls, games) suffers more from jitter than from steady latency; a jitter buffer trades added delay for smoothness.",
    mod: "n02",
  },
  {
    t: "Keepalive",
    d: "A small periodic packet whose only job is to keep state alive somewhere else: refreshing a NAT or firewall's idle timeout on your mapping, or (TCP keepalive) detecting a dead peer. WireGuard's version is **persistent keepalive**.",
    mod: "m03",
  },
  {
    t: "Kill switch",
    d: "The fail-closed guarantee: if the tunnel drops, traffic is blocked rather than allowed to escape unencrypted — built with firewall rules (WFP on Windows, lockdown on Android), never just route tricks.",
    mod: "m11",
  },
  {
    t: "Lease",
    d: "A DHCP address grant with an expiry: the client renews unicast with its server at **T1** (50% of lease time), rebinds by broadcast at **T2** (87.5%), and loses the address if time runs out.",
    mod: "n15",
  },
  {
    t: "Lifetime",
    d: "The compiler's name for how long a reference is valid; annotations like `'a` relate borrows to the data they came from, so a reference can never outlive its source.",
    mod: "m04",
  },
  {
    t: "Link-local address",
    d: "An address valid only on the local link and never routed — 169.254.0.0/16 in IPv4, `fe80::/10` in IPv6, where every interface always has one.",
    mod: "n04",
  },
  {
    t: "Link-state",
    d: "The routing-protocol family (OSPF, IS-IS) where every router floods its local topology so all routers hold the same complete map and independently compute shortest paths.",
    mod: "n08",
  },
  {
    t: "Longest prefix match",
    d: "How routers choose among overlapping routes: the most specific prefix wins. It is also how VPN clients steal the default route with `0.0.0.0/1` plus `128.0.0.0/1`.",
    mod: "n08",
  },
  {
    t: "Lost wakeup",
    d: "The async failure mode where readiness arrived but nobody called the current waker: the task sleeps forever with no error. Its benign sibling is the **spurious wakeup** — polled with no progress available, legal and merely wasteful. That asymmetry shapes every executor contract.",
    mod: "r06",
  },
  {
    t: "MAC address",
    d: "Media Access Control address — the 48-bit hardware identifier of a network interface, used for delivery within one L2 network. It never survives a router hop.",
    mod: "n02",
  },
  {
    t: "MAC randomization",
    d: "Modern devices present a different random MAC address per SSID (sometimes per connection) so the real hardware address can't be passively tracked across networks — also the reason DHCP reservations and captive-portal exemptions mysteriously stop matching.",
    mod: "n06w",
  },
  {
    t: "MASQUE",
    d: "Multiplexed Application Substrate over QUIC Encryption — the IETF stack for proxying and VPN over HTTP/3: tunneled traffic rides QUIC on port 443 and looks like ordinary web browsing.",
    mod: "m12",
  },
  {
    t: "MCS index",
    d: "Modulation and Coding Scheme index — the number encoding which modulation and error-coding rate a Wi-Fi link currently uses; rate adaptation walks it up and down as conditions change.",
    mod: "n04w",
  },
  {
    t: "MDM",
    d: "Mobile Device Management — fleet software that pushes configuration to managed devices: Wi-Fi profiles, client certificates, and on mobile platforms the VPN configuration and always-on policy itself.",
    mod: "n06w",
  },
  {
    t: "Memory ordering",
    d: "The parameter on every atomic operation saying what else it synchronizes: `Relaxed` (atomicity only), `Acquire`/`Release` (publish and observe), `SeqCst` (one total order all threads agree on).",
    mod: "r07",
  },
  {
    t: "MIMO",
    d: "Multiple Input, Multiple Output — using several antennas to transmit multiple spatial streams over the same channel at once, multiplying throughput.",
    mod: "n04w",
  },
  {
    t: "mio",
    d: "The low-level crate wrapping epoll, kqueue, and IOCP behind one readiness API — tokio's IO driver is built on it.",
    mod: "r06",
  },
  {
    t: "Miri",
    d: "The interpreter that runs your tests while checking for undefined behavior — aliasing violations (Stacked/Tree Borrows), invalid values, leaks. The closest thing to a UB linter; put it in CI for any unsafe code.",
    mod: "r07",
  },
  {
    t: "Move semantics",
    d: "Assignment and argument passing transfer ownership by default; the source becomes unusable rather than silently copied — the compile error that teaches you where your data actually flows.",
    mod: "m04",
  },
  {
    t: "MPTCP",
    d: "Multipath TCP — one TCP connection striped across several paths (Wi-Fi plus cellular) via subflows that can come and go, enabling seamless handover.",
    mod: "n14w",
  },
  {
    t: "MSRV",
    d: "Minimum Supported Rust Version — the oldest compiler a crate promises to build on; a compatibility contract worth declaring and testing in CI.",
    mod: "r04",
  },
  {
    t: "MSS",
    d: "Maximum Segment Size — the largest TCP payload a host will send, negotiated in the SYN handshake and often rewritten (MSS clamping) when a tunnel shrinks the path MTU.",
    mod: "n07",
  },
  {
    t: "MSS clamping",
    d: "A gateway rewriting TCP's Maximum Segment Size during the handshake so segments fit a tunnel's reduced MTU — the pragmatic fix when Path MTU Discovery is being eaten.",
    mod: "n16",
  },
  {
    t: "mTLS",
    d: "Mutual TLS — both sides present certificates, so the server authenticates the client too; the workhorse of service-to-service and zero-trust authentication.",
    mod: "n11",
  },
  {
    t: "mtr",
    d: "traceroute and ping fused: continuous per-hop loss and latency statistics. Reading rule: loss that persists from a hop onward is real; loss at one hop only is usually that router deprioritizing probe replies.",
    mod: "n12",
  },
  {
    t: "MTU",
    d: "Maximum Transmission Unit — the largest payload a link carries in one frame (classically 1500 bytes on Ethernet). Tunnels shrink the effective MTU by adding headers, which is why VPNs obsess over it.",
    mod: "n02",
  },
  {
    t: "NACL",
    d: "Network Access Control List — the stateless subnet-level filter evaluated in both directions; because it keeps no connection state, you must explicitly allow the ephemeral return ports.",
    mod: "n16",
  },
  {
    t: "NAT",
    d: "Network Address Translation — a router rewriting private source addresses/ports to a public one and keeping a mapping table so replies can be translated back. It let IPv4 outlive its address space, at the cost of breaking inbound connectivity.",
    mod: "m03",
  },
  {
    t: "NAT gateway",
    d: "The managed cloud NAT that lets private-subnet instances initiate outbound internet connections while staying unreachable from outside.",
    mod: "n16",
  },
  {
    t: "NAT-T",
    d: "NAT Traversal for IPsec — detecting a NAT on the path and re-wrapping ESP in UDP port 4500 so translation boxes have ports to rewrite.",
    mod: "n16",
  },
  {
    t: "NAT64",
    d: "The translator that lets IPv6-only networks reach the IPv4 internet by mapping IPv4 addresses into an IPv6 prefix — paired with DNS64, which points clients at it.",
    mod: "n14w",
  },
  {
    t: "NDP",
    d: "Neighbor Discovery Protocol — IPv6's ARP replacement: Router Advertisements, address resolution, duplicate detection, and prefix discovery on the local link.",
    mod: "n04",
  },
  {
    t: "Network Extension",
    d: "Apple's framework family for hooking system networking — packet tunnels, app proxies, content filters, DNS proxies — and the only sanctioned way to build a VPN on iOS and macOS.",
    mod: "p01",
  },
  {
    t: "Network namespace",
    d: "Linux's isolated network stack — its own interfaces, routes, and firewall per namespace. Your laboratory: build multi-router topologies with veth pairs on one machine and watch your tunnel traverse them.",
    mod: "m13",
  },
  {
    t: "Newtype",
    d: "Wrapping a primitive in a single-field struct (`struct Port(u16)`) so the type system distinguishes it from every other `u16` — zero runtime cost, whole classes of mix-up bugs gone.",
    mod: "r05",
  },
  {
    t: "nmap",
    d: "The network scanner for mapping hosts and ports; its three verdicts encode firewall behavior — **open** (something answered), **closed** (an RST came back), **filtered** (silence: a firewall dropped it).",
    mod: "n12",
  },
  {
    t: "Noise floor",
    d: "The ambient RF energy on a channel from everything that isn't your signal. What matters is **SNR** — signal minus noise floor — which is why 'full bars' (strong signal) can still mean slow Wi-Fi when the floor is high.",
    mod: "n04w",
  },
  {
    t: "Noise Protocol Framework",
    d: "A catalog of formally analyzed handshake patterns composed from DH, HKDF, and an AEAD. WireGuard uses the **Noise_IK** pattern: one round trip, forward secrecy, and the initiator's identity hidden.",
    mod: "m08",
  },
  {
    t: "NRPT",
    d: "Name Resolution Policy Table — Windows' per-domain DNS routing policy: how a VPN forces corp domains to its resolver without hijacking all system DNS.",
    mod: "p02",
  },
  {
    t: "OFDMA",
    d: "Orthogonal Frequency-Division Multiple Access — Wi-Fi 6 splitting one channel into resource units so the AP serves many small-packet clients in a single transmission, cutting airtime contention.",
    mod: "n04w",
  },
  {
    t: "On-demand VPN",
    d: "Apple's `NEOnDemandRules` — OS-evaluated rules (which SSID, which domains, …) that start or stop the tunnel automatically; the OS, not your app, is the trigger.",
    mod: "p01",
  },
  {
    t: "On-path attack",
    d: "An attacker positioned between you and your destination — rogue AP, ARP spoofing, malicious hop — reading or altering traffic (a.k.a. MITM). End-to-end encryption makes the position mostly worthless.",
    mod: "n13",
  },
  {
    t: "Opaque handle pattern",
    d: "Exposing a Rust object across FFI as an untyped pointer the foreign side can hold but never inspect, with create/use/destroy functions — layout stays private, the ownership contract stays explicit.",
    mod: "r07",
  },
  {
    t: "Option",
    d: "The enum that replaces null: a value is `Some(T)` or `None`, and the compiler forces you to handle both — absent-value bugs become compile errors.",
    mod: "m04",
  },
  {
    t: "Option 121",
    d: "The DHCP option carrying classless static routes that the client installs into its route table. Because installed routes can outrank a VPN's, it is the lever the TunnelVision attack pulls.",
    mod: "n15",
  },
  {
    t: "OSI model",
    d: "Open Systems Interconnection model — the seven-layer reference stack used to name where a protocol or a failure lives. In practice engineers mostly reason about **L2** (link), **L3** (network), **L4** (transport), and **L7** (application).",
    mod: "m01",
  },
  {
    t: "OSPF",
    d: "Open Shortest Path First — the dominant interior link-state protocol: routers flood link-state advertisements, build an identical topology map, and run shortest-path-first; areas keep large networks scalable.",
    mod: "n08",
  },
  {
    t: "Overlay network",
    d: "A virtual network built on top of an existing one by carrying packets inside packets; a VPN tunnel is an overlay riding the public internet.",
    mod: "m01",
  },
  {
    t: "Overlay routing",
    d: "Computing paths inside the VPN's own peer graph — which peer relays to which — to reach a node no direct link can. Distinct from the underlay internet routing (N10) each hop still rides; here the edge metric is live latency.",
    mod: "t05",
  },
  {
    t: "Ownership",
    d: "Rust's core rule: every value has exactly one owner, and when the owner goes out of scope the value is dropped. Memory and resource cleanup become deterministic without a garbage collector.",
    mod: "m04",
  },
  {
    t: "PAC file",
    d: "Proxy Auto-Configuration — a JavaScript function `FindProxyForURL(url, host)` the OS or browser evaluates per request to choose direct versus which proxy: split-tunnel logic expressed in 1996-era JS.",
    mod: "p04",
  },
  {
    t: "Packet tunnel provider",
    d: "Your `NEPacketTunnelProvider` subclass — the extension the OS launches to run a VPN: read outbound packets from the virtual interface and send them encrypted; decrypt inbound and write them back. On iOS it lives under a roughly 50 MB memory ceiling.",
    mod: "p01",
  },
  {
    t: "Panic",
    d: "Rust's response to a bug — unrecoverable; it unwinds or aborts. The discipline: panics are for broken invariants, `Result` is for expected failure. The network failing is weather, not a bug.",
    mod: "r05",
  },
  {
    t: "Path MTU Discovery",
    d: "Finding the smallest MTU on a path by sending packets with DF set and listening for ICMP “Fragmentation Needed” errors. When firewalls eat that ICMP you get the **PMTUD black hole**: small packets pass, big ones vanish.",
    mod: "n04",
  },
  {
    t: "PEAP",
    d: "Protected EAP — the ubiquitous enterprise Wi-Fi login: a TLS tunnel to the RADIUS server with a legacy username/password exchange (MSCHAPv2) inside. It inherits every password weakness, and skipped certificate validation turns it into a credential-stealing evil-twin target.",
    mod: "n06w",
  },
  {
    t: "Peer relay",
    d: "Forwarding two peers' traffic through an ordinary reachable member when they cannot establish a direct path — the mesh falls back to a peer before a dedicated relay (DERP/TURN, T04). The relay sees only ciphertext, so a stranger's node is safe to use.",
    mod: "t05",
  },
  {
    t: "Peer table",
    d: "Each node's local, soft-state copy of the network — peers, their keys, current endpoints, and owned CIDRs — kept fresh by gossip and expiry, and read by the data plane to route and authenticate.",
    mod: "t05",
  },
  {
    t: "Persistent keepalive",
    d: "A small encrypted packet a WireGuard peer emits every N seconds purely to keep its NAT mapping alive, so a peer behind NAT stays reachable for inbound traffic.",
    mod: "m09",
  },
  {
    t: "Pin",
    d: "The pointer wrapper that promises its target will never move again — required because async state machines can hold pointers into themselves. `Box::pin` or `tokio::pin!` gets you a pinned future.",
    mod: "r06",
  },
  {
    t: "PMF",
    d: "Protected Management Frames — cryptographic protection for 802.11 management traffic so attackers cannot forge deauthentication frames to kick clients offline; mandatory in WPA3.",
    mod: "n03",
  },
  {
    t: "PKI",
    d: "Public Key Infrastructure — the hierarchy of certificate authorities, issued certificates, and trust stores that TLS uses to prove server (and sometimes client) identity.",
    mod: "n11",
  },
  {
    t: "Policy routing",
    d: "Linux's `ip rule` layer: rules select among multiple routing tables by source, fwmark, or UID — the machinery beneath Android's per-app VPN and clean routing-loop avoidance.",
    mod: "p03",
  },
  {
    t: "PLAT",
    d: "Provider-side translator in 464XLAT — the carrier's stateful NAT64 that strips the IPv6 prefix and emits native IPv4 packets toward the internet.",
    mod: "n19",
  },
  {
    t: "Poll",
    d: "The contract at async Rust's heart: the executor calls `poll`; the future either completes with `Ready` or returns `Pending` after arranging — via the Waker — to be woken when progress is possible.",
    mod: "r06",
  },
  {
    t: "Port forwarding",
    d: "A manual NAT rule mapping a public port to a specific private address:port, so unsolicited inbound traffic can reach a host behind NAT. What home routers offer — and what CGNAT (no public IP of your own) makes impossible.",
    mod: "m03",
  },
  {
    t: "Property-based testing",
    d: "Testing with generated inputs against invariants (“any framed message round-trips”) instead of hand-picked examples; the framework shrinks failures to a minimal counterexample.",
    mod: "r04",
  },
  {
    t: "PREF64",
    d: "Prefix64 — the Router Advertisement option (RFC 8781) that announces the NAT64 prefix directly, so clients can synthesize addresses without DNS64 heuristics.",
    mod: "n19",
  },
  {
    t: "QUIC",
    d: "The UDP-based transport under HTTP/3: TLS 1.3 baked in, multiple independent streams, connection IDs that survive network changes, and one-round-trip (or 0-RTT) setup.",
    mod: "n11",
  },
  {
    t: "RADIUS",
    d: "Remote Authentication Dial-In User Service — the AAA server enterprise access points forward credentials to; it returns accept/reject plus attributes such as per-user VLAN assignment.",
    mod: "n06w",
  },
  {
    t: "Receive window",
    d: "TCP flow control: the receiver advertises how many more bytes it can buffer (`rwnd`), and the sender may never have more than that in flight.",
    mod: "n07",
  },
  {
    t: "Recursive resolver",
    d: "The DNS server that does the legwork for clients: walks the hierarchy from root to authoritative, caches aggressively, and returns the final answer.",
    mod: "n10",
  },
  {
    t: "Rekey",
    d: "Replacing session keys with freshly derived ones on a schedule — WireGuard runs a new handshake roughly every two minutes — so any single compromised session key decrypts only a small window of traffic. The continuous, operational face of **forward secrecy**.",
    mod: "m08",
  },
  {
    t: "Rendezvous node",
    d: "A well-known reachable node used to introduce two peers that do not yet know each other's endpoints — the decentralized analogue of a signaling coordinator. In practice, a community / public shared node.",
    mod: "t05",
  },
  {
    t: "repr(C)",
    d: "The attribute forcing C's field order and padding on a struct. Rust's default layout is deliberately unspecified, so any type crossing FFI needs this.",
    mod: "r07",
  },
  {
    t: "Result",
    d: "The enum for fallible operations: `Ok(T)` or `Err(E)`, propagated ergonomically with `?`. Rust has no exceptions — errors are ordinary values visible in the signature.",
    mod: "r05",
  },
  {
    t: "RFC 1918",
    d: "The private IPv4 ranges — `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` — never routed on the public internet and therefore usable by anyone behind NAT.",
    mod: "n05",
  },
  {
    t: "Ring buffer",
    d: "A fixed-size circular queue where producer and consumer chase each other's positions — the shared-memory structure (wintun on Windows, GSO batching on Linux) that turns per-packet kernel↔userspace syscalls into amortized batch operations.",
    mod: "p02",
  },
  {
    t: "Roaming (WireGuard)",
    d: "WireGuard updates a peer's endpoint to the source address of the latest authenticated packet, so hopping from Wi-Fi to cellular just works — no renegotiation, the session simply continues.",
    mod: "m09",
  },
  {
    t: "Rogue DHCP server",
    d: "An unauthorized DHCP server answering Discovers faster than the real one, handing out a malicious gateway or resolver. DHCP has no authentication; **DHCP snooping** on switches is the standard defense.",
    mod: "n15",
  },
  {
    t: "RPKI",
    d: "Resource Public Key Infrastructure — signed records binding IP prefixes to the AS numbers allowed to originate them, letting routers drop obviously hijacked BGP announcements.",
    mod: "n08",
  },
  {
    t: "RSSI",
    d: "Received Signal Strength Indicator — how loud the radio signal arrives, in dBm (around −45 is great, −80 is poor). The first number to check when Wi-Fi “feels slow”.",
    mod: "n04w",
  },
  {
    t: "RST",
    d: "TCP's rude exit — no handshake, just 'this conversation does not exist.' Sent when connecting to a closed port (`Connection refused`), when a peer reboots mid-connection, or by a censoring middlebox. RST vs silence on connect is a key diagnostic fork: refused means a host answered; timeout means a firewall ate the packet.",
    mod: "n07",
  },
  {
    t: "SAE",
    d: "Simultaneous Authentication of Equals — WPA3's password-authenticated key exchange; unlike WPA2's handshake, captured traffic cannot be brute-forced offline against the password.",
    mod: "n03",
  },
  {
    t: "Scoped routing",
    d: "Darwin's twist on routing: routes and sockets can be bound to a specific interface *past* the default table. It's how macOS/iOS keep captive-portal probes and system chatter on the physical interface while your tunnel's utun holds the default route.",
    mod: "p01",
  },
  {
    t: "SDN",
    d: "Software-Defined Networking — control plane separated from forwarding: networks (especially cloud VPCs) are declared via API and realized by a programmable fabric.",
    mod: "n16",
  },
  {
    t: "Security group",
    d: "The cloud's stateful per-resource firewall: allow-list only, default deny, and rules can name another security group as the source — identity-based filtering instead of address-based.",
    mod: "n16",
  },
  {
    t: "select!",
    d: "The tokio macro that awaits several futures at once and continues with whichever finishes first, dropping (cancelling) the losers — the idiom behind timeouts and shutdown signals.",
    mod: "m05",
  },
  {
    t: "Send",
    d: "The marker auto trait for types safe to move to another thread. `Rc<T>` is famously `!Send`; tokio's multi-threaded runtime requires spawned futures to be `Send`.",
    mod: "r07",
  },
  {
    t: "Server-reflexive address",
    d: "Your ip:port as seen from outside your NAT — what a STUN server reports back, and the candidate you hand a peer for hole punching.",
    mod: "m10",
  },
  {
    t: "Site-to-site VPN",
    d: "A gateway-to-gateway tunnel joining two networks (office to VPC, VPC to VPC), typically IPsec; route-based versions run BGP over the tunnel so routing updates itself.",
    mod: "n16",
  },
  {
    t: "SLAAC",
    d: "Stateless Address Autoconfiguration — IPv6 hosts build their own addresses from a router-advertised prefix plus a self-chosen suffix, with no DHCP server involved.",
    mod: "n04",
  },
  {
    t: "Slow start",
    d: "TCP's opening gambit: the congestion window starts tiny and doubles every round trip until loss or a threshold, probing quickly for the path's capacity.",
    mod: "n07",
  },
  {
    t: "SNI",
    d: "Server Name Indication — the ClientHello field naming which host you want, sent in cleartext so one IP can serve many certificates. It is the last plaintext signal censors key on; ECH encrypts it.",
    mod: "n11",
  },
  {
    t: "SIIT",
    d: "Stateless IP/ICMP Translation (RFC 7915) — a one-to-one algorithmic mapping between address families with no flow table; the building block of CLAT and stateless NAT64.",
    mod: "n19",
  },
  {
    t: "SNAT",
    d: "Source NAT — rewriting the source address (and usually port) of outbound packets so private hosts can reach the internet; what a cloud NAT gateway sells as a managed service.",
    mod: "n16",
  },
  {
    t: "SNR",
    d: "Signal-to-Noise Ratio — the gap between received signal and the noise floor, in dB. It, not raw signal strength, determines how aggressive a modulation the link can sustain.",
    mod: "n04w",
  },
  {
    t: "Socket",
    d: "The OS handle an application uses to send and receive network data, identified by protocol plus local and remote IP:port.",
    mod: "m02",
  },
  {
    t: "SOCKS5",
    d: "Socket Secure version 5 — the protocol-agnostic proxy: hand it a destination and it relays raw TCP (and UDP via UDP ASSOCIATE). The classic local endpoint exposed by `ssh -D` and Tor.",
    mod: "p04",
  },
  {
    t: "Soft state",
    d: "Network state that must be periodically refreshed or it expires. Refreshing peer records on a keepalive cadence lets a peer table self-clean as nodes join and vanish, with no explicit teardown required.",
    mod: "t05",
  },
  {
    t: "Soundness",
    d: "The property that no safe-Rust caller can trigger undefined behavior through your API, no matter what they do. An unsafe block a safe wrapper can misuse makes the whole API unsound.",
    mod: "r07",
  },
  {
    t: "Split DNS",
    d: "Routing DNS queries by domain: internal names go to the tunnel's resolver while everything else uses the normal one — essential for split-tunnel VPNs that must resolve corp-only hostnames.",
    mod: "m03",
  },
  {
    t: "Split tunnel",
    d: "Sending only selected traffic — by route, by app, or by domain — through the VPN while the rest takes the normal path. Better performance; every exclusion is a potential leak to review.",
    mod: "m11",
  },
  {
    t: "SSID",
    d: "Service Set Identifier — the human-readable Wi-Fi network name that access points advertise in beacons and clients probe for; many access points (BSSIDs) can share one SSID.",
    mod: "n03",
  },
  {
    t: "Stacked Borrows",
    d: "The operational model Miri uses for Rust's aliasing rules: raw-pointer code must behave as if the reference discipline were still enforced — or it is UB even when it happens to work.",
    mod: "r07",
  },
  {
    t: "Stateful firewall",
    d: "A firewall that tracks connections and automatically allows return traffic for flows it saw initiated — unlike stateless filters, which judge every packet in isolation.",
    mod: "n13",
  },
  {
    t: "Stateless firewall",
    d: "A packet filter that judges every packet in isolation with no connection memory — the opposite of a **stateful firewall**, and what a cloud NACL is. Its tell: you must explicitly allow ephemeral-port return traffic that a stateful filter admits automatically.",
    mod: "n13",
  },
  {
    t: "Stub resolver",
    d: "The tiny DNS client inside every OS: it asks a recursive resolver and waits — no hierarchy-walking of its own. Which resolver it asks is precisely what VPN DNS settings fight over.",
    mod: "n10",
  },
  {
    t: "STUN",
    d: "Session Traversal Utilities for NAT — a protocol where a server reports which public ip:port your packet arrived from (in XOR-MAPPED-ADDRESS), revealing the reflexive address you need for hole punching.",
    mod: "m10",
  },
  {
    t: "Subnet",
    d: "A contiguous slice of address space sharing one prefix — one network neighborhood. Hosts in the same subnet talk directly; everything else goes via the gateway.",
    mod: "n05",
  },
  {
    t: "Switch",
    d: "An L2 device that learns which MAC addresses live behind which ports by watching source addresses, then forwards frames only where needed — flooding only when it has not learned the destination yet.",
    mod: "n02",
  },
  {
    t: "Symmetric NAT",
    d: "NAT behavior that allocates a different public mapping for every destination, so a peer cannot predict your ip:port from a STUN answer — the classic hole-punching killer that forces traffic through relays.",
    mod: "m03",
  },
  {
    t: "Sync",
    d: "The marker auto trait for types safely shared by reference across threads (`T: Sync` means `&T: Send`). `RefCell<T>` is `!Sync`; `Mutex` exists to make shared mutation `Sync`.",
    mod: "r07",
  },
  {
    t: "System extension",
    d: "The modern macOS packaging for extensions: runs in userspace under entitlements instead of as a kernel extension, so a crash takes down the extension, not the kernel.",
    mod: "p01",
  },
  {
    t: "TAP device",
    d: "The L2 sibling of TUN: it delivers whole Ethernet frames, letting userspace bridge or emulate a LAN. Heavier than IP-only VPNs need, which is why modern tunnels prefer TUN.",
    mod: "m07",
  },
  {
    t: "Task",
    d: "The executor's unit of scheduling: a spawned top-level future plus bookkeeping. Cheap enough to run hundreds of thousands where OS threads top out at thousands.",
    mod: "r06",
  },
  {
    t: "TCP",
    d: "Transmission Control Protocol — the connection-oriented L4 protocol that delivers a reliable, ordered byte stream using acknowledgments, retransmission, and flow/congestion control.",
    mod: "m02",
  },
  {
    t: "TCP teardown",
    d: "How a TCP connection ends cleanly — also called the **four-way close** or graceful close: each direction closes independently with its own FIN → ACK exchange. The first closer passes through FIN_WAIT into TIME_WAIT; the passive side sits in CLOSE_WAIT until the app closes, then LAST_ACK. RST is the abrupt alternative.",
    mod: "n07",
  },
  {
    t: "TCP termination",
    d: "Two meanings, worth disambiguating. (1) Ending a connection — see **TCP teardown** (graceful FIN exchange) and **RST** (abrupt). (2) What a proxy or load balancer does: it *terminates* the client's TCP connection and opens its own to the backend, which is why backends see the balancer's IP unless X-Forwarded-For or PROXY protocol restores the original source.",
    mod: "n07",
  },
  {
    t: "TCP-over-TCP meltdown",
    d: "The pathology of tunneling one TCP stream inside another: both layers retransmit and back off independently, compounding delays until throughput collapses. It is why serious VPN protocols carry traffic over UDP.",
    mod: "m02",
  },
  {
    t: "tcpdump",
    d: "The command-line packet capture tool: BPF filters select traffic, and captures save to pcap for Wireshark. Where you run it — the vantage point — determines what you can see.",
    mod: "n12",
  },
  {
    t: "thiserror",
    d: "The derive crate libraries use to define structured error enums with `Display` and `From` implementations generated, so callers can match on exactly what went wrong.",
    mod: "r05",
  },
  {
    t: "Three-way handshake",
    d: "SYN, SYN-ACK, ACK — TCP's opening exchange where each side picks an initial sequence number and acknowledges the other's, establishing connection state on both ends.",
    mod: "n07",
  },
  {
    t: "Throughput",
    d: "The data rate you actually get, as opposed to **bandwidth** — the link's rated capacity. Overhead, loss, retransmissions, and congestion eat the difference, which is why a '1 Gbps' link never moves a gigabit of your file per second.",
    mod: "n02",
  },
  {
    t: "TIME_WAIT",
    d: "The state the side that actively closes a TCP connection lingers in so stray delayed segments cannot corrupt a new connection reusing the same port pair.",
    mod: "n07",
  },
  {
    t: "TLS",
    d: "Transport Layer Security — the protocol that upgrades a byte stream with authenticated encryption: a handshake verifies the server's certificate chain and agrees keys, then records encrypt the data. TLS 1.3 made forward secrecy mandatory.",
    mod: "n11",
  },
  {
    t: "TLS termination",
    d: "Decrypting TLS at an edge proxy or L7 load balancer instead of on the backend: the balancer holds the certificate, terminates the client's TLS session, and forwards plaintext (or re-encrypted) traffic inward. It's what lets a balancer read HTTP paths and headers to route — and why the backend no longer sees the client directly.",
    mod: "n16",
  },
  {
    t: "Tokio",
    d: "The dominant async runtime for Rust: a work-stealing multi-threaded executor, an epoll/kqueue-backed IO driver, timers, and async versions of sockets, channels, and sync primitives.",
    mod: "m05",
  },
  {
    t: "tokio-console",
    d: "The runtime debugger for tokio: a live per-task view of polls, wakes, and busy time — how you find the task that blocks the executor or never wakes.",
    mod: "r04",
  },
  {
    t: "Traceroute",
    d: "The tool that maps a path by sending probes with TTL 1, 2, 3, … and collecting the ICMP Time Exceeded replies each hop returns.",
    mod: "n04",
  },
  {
    t: "tracing",
    d: "The structured, async-aware instrumentation crate: **spans** carry context that follows a task across await points, where classic line-based logs interleave into noise.",
    mod: "r04",
  },
  {
    t: "Trait",
    d: "Rust's interface mechanism: a set of methods (and guarantees) a type implements. Traits power generics, operator overloading, and marker contracts like `Send`.",
    mod: "m04",
  },
  {
    t: "Transparent proxy",
    d: "A proxy the network inserts without any client configuration — traffic is silently redirected to it. Nothing to configure or inspect on the client, which is exactly why enterprises and captive portals use it.",
    mod: "p04",
  },
  {
    t: "TTL",
    d: "Time To Live — the IP hop counter each router decrements; at zero the packet dies and an ICMP Time Exceeded goes back. It kills looping packets, and traceroute is built entirely on it.",
    mod: "n04",
  },
  {
    t: "TUN device",
    d: "A virtual network interface that hands raw L3 (IP) packets to a userspace program instead of hardware: read the fd, get a packet; write the fd, inject one. The foundation of nearly every VPN client.",
    mod: "m07",
  },
  {
    t: "TunnelVision",
    d: "The 2024 attack where a rogue DHCP server uses option 121 routes to steer a victim's traffic around their VPN — no crypto broken, just the route table outranked.",
    mod: "n15",
  },
  {
    t: "TURN",
    d: "Traversal Using Relays around NAT — the fallback when hole punching fails: both peers send through a relay server that forwards between them. Bandwidth costs money, but it always works.",
    mod: "m10",
  },
  {
    t: "Typestate",
    d: "Encoding a state machine in the type system — `Conn<Handshaking>` versus `Conn<Established>` — so calling a method in the wrong state is a compile error rather than a runtime check.",
    mod: "r05",
  },
  {
    t: "UDP",
    d: "User Datagram Protocol — the minimal L4 protocol: ports and a checksum over raw datagrams, with no ordering, reliability, or connection state. Its dumbness is exactly why VPNs and QUIC build on it.",
    mod: "m02",
  },
  {
    t: "Undefined behavior",
    d: "Breaking the language's rules (data race, invalid value, aliasing violation, out-of-bounds) so the compiler's assumptions become false — after which the program may do anything, including appear to work.",
    mod: "r07",
  },
  {
    t: "Underlay network",
    d: "The real physical network that carries an overlay's encapsulated traffic; to the underlay, tunnel packets are just ordinary payload.",
    mod: "m01",
  },
  {
    t: "uniffi",
    d: "Mozilla's binding generator for Rust: describe the API once and get Swift and Kotlin bindings — the standard way a shared Rust core reaches its iOS and Android shells.",
    mod: "m11",
  },
  {
    t: "Unpin",
    d: "The auto trait marking types safe to move even when pinned — most types are. Only self-referential futures and friends are `!Unpin`, and they are why `Pin` exists at all.",
    mod: "r06",
  },
  {
    t: "unsafe",
    d: "The keyword that unlocks exactly five powers — dereference raw pointers, call unsafe functions, implement unsafe traits, touch `static mut`, access union fields — and relaxes nothing else. It marks where you, not the compiler, uphold the invariants.",
    mod: "r07",
  },
  {
    t: "UnsafeCell",
    d: "The one primitive that legally permits mutation through a shared reference — the foundation under `Cell`, `RefCell`, `Mutex`, and every atomic. Bypassing sharedness any other way is UB.",
    mod: "r07",
  },
  {
    t: "Userspace network stack",
    d: "A TCP/IP implementation inside your own process: when the OS hands you raw packets or flows, your tunnel must do what the kernel normally does — parse, track connections, and reassemble.",
    mod: "m07",
  },
  {
    t: "utun",
    d: "The built-in macOS/iOS TUN device: Network Extension backs your provider's virtual interface with one, and command-line WireGuard creates them directly.",
    mod: "p01",
  },
  {
    t: "VLAN",
    d: "Virtual LAN — partitioning one physical switch into multiple isolated L2 networks, each its own broadcast domain, so segmentation does not require separate hardware.",
    mod: "n02",
  },
  {
    t: "VLSM",
    d: "Variable-Length Subnet Masking — carving one block into subnets of different sizes to match each network's real host count; the design rule is to allocate the largest requirements first.",
    mod: "n05",
  },
  {
    t: "VPC",
    d: "Virtual Private Cloud — your software-defined network inside a cloud provider: a CIDR block carved into subnets, with route tables, gateways, and firewall policy all as API objects. The CIDR plan is the one nearly irreversible decision.",
    mod: "n16",
  },
  {
    t: "VpnService",
    d: "Android's VPN API: your service builds the TUN interface with `Builder` (addresses, routes, DNS, per-app rules) and receives a `ParcelFileDescriptor` to read and write packets — no root, user consent required.",
    mod: "p03",
  },
  {
    t: "Waker",
    d: "The callback handle a future stashes with its event source before returning `Pending`; when the event fires, `wake()` tells the executor to poll that task again. A lost wake is a task that sleeps forever.",
    mod: "r06",
  },
  {
    t: "WFP",
    d: "Windows Filtering Platform — the kernel filtering engine beneath Windows firewalls: filters with conditions and weights installed at defined layers. It is where a proper Windows kill switch is built.",
    mod: "p02",
  },
  {
    t: "WinDivert",
    d: "The user-mode packet interception library for Windows: capture, modify, and reinject traffic matching a filter without writing a driver — more work than routing tricks, far more control.",
    mod: "p02",
  },
  {
    t: "wintun",
    d: "The modern Windows TUN driver, from the WireGuard project: a signed driver exposing shared-memory **ring buffers**, so packet I/O avoids per-packet syscalls entirely.",
    mod: "p02",
  },
  {
    t: "WireGuard",
    d: "The modern VPN protocol: a few thousand lines, one fixed cipher suite (X25519, ChaCha20-Poly1305, BLAKE2s), a 1-RTT Noise_IK handshake, and configuration that is just public keys and allowed IPs.",
    mod: "m09",
  },
  {
    t: "Work-stealing",
    d: "Tokio's scheduling strategy: each worker thread has its own task queue, and idle workers steal from busy ones — plus a LIFO slot that runs a just-woken task immediately while its data is hot in cache.",
    mod: "r06",
  },
  {
    t: "WPA3",
    d: "Wi-Fi Protected Access 3 — the current Wi-Fi security generation: SAE replaces WPA2's offline-crackable PSK handshake, and protected management frames become mandatory.",
    mod: "n03",
  },
  {
    t: "WPAD",
    d: "Web Proxy Auto-Discovery — how a client finds its proxy configuration automatically, via DHCP option 252 or by fetching `http://wpad.<domain>/wpad.dat`. Convenient, and a classic attack surface: whoever answers that probe decides where your traffic goes.",
    mod: "p04",
  },
  {
    t: "X25519",
    d: "Elliptic-curve Diffie–Hellman over Curve25519 — the key agreement where two parties combine private and public keys to derive the same shared secret over an open channel. WireGuard's only asymmetric operation.",
    mod: "m08",
  },
  {
    t: "Zero trust",
    d: "The security model that drops the trusted-internal-network assumption: every access is authenticated, authorized, and encrypted per request, with device posture continuously re-evaluated. Network position grants nothing.",
    mod: "n13",
  },
];
