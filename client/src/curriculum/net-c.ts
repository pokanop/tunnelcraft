import type { Module } from "./types";

/* Networking fundamentals — new modules C: DNS deep dive; TLS, HTTP & QUIC */

export const NET_C: Module[] = [
  {
    id: "n10",
    code: "N12",
    title: "DNS Deep Dive",
    layers: ["L7"],
    est: "~65 min",
    tag: "The hierarchy, the resolution dance, the records that matter, and what securing names really buys.",
    lessons: [
      {
        id: "n10l1",
        title: "A distributed database with delegation",
        est: "~10 min",
        blocks: [
          {
            p: "DNS is a global key-value store that works because **nobody runs it**: authority is *delegated* down a tree. The **root** (13 named servers, hundreds of anycast instances — N10 paying off) knows who runs each TLD; the **.com servers** know which nameservers are authoritative for `example.com`; those **authoritative** servers hold the actual records. Each level only knows the next level down.",
          },
          {
            p: "Delegation is implemented with **NS records**: the parent zone stores 'example.com is served by ns1.hoster.net' — a referral, not an answer. Registrar vs DNS host, a distinction that confuses everyone: the **registrar** is where you rent the name and set which NS records the TLD publishes; the **DNS host** runs those nameservers and answers queries. Same company sometimes, but two different jobs — and 'I changed my DNS but nothing happened' is usually someone editing records at the wrong one.",
          },
          {
            p: "Names read right-to-left as you descend: `www.example.com.` — root (the invisible trailing dot), then com, then example, then www. Everything about resolution follows the tree.",
          },
        ],
      },
      {
        id: "n10l2",
        title: "The resolution dance",
        est: "~10 min",
        blocks: [
          {
            p: "Two roles, endlessly conflated. Your **stub resolver** (in the OS) asks one configured **recursive resolver** (your router, ISP, 1.1.1.1, or your VPN's — N11) a single question and expects a final answer. The *recursive* resolver does the real work **iteratively**: ask root → referral to .com → ask .com → referral to example.com's nameservers → ask those → answer. Then it hands the finished result back to you.",
          },
          {
            p: "The system survives its own popularity through **caching**: every record carries a **TTL** (seconds it may be reused). The recursive caches answers *and* referrals — after resolving one .com name it never bothers root for another .com for days. Negative results are cached too (**negative caching**, governed by the SOA record), which is why a typo'd name stays 'nonexistent' for a while even after you create it. Practical TTL craft: drop to 300 before a planned migration, raise back after — and remember caches around the world only expire on *their* schedule, hence 'DNS propagation' folklore.",
          },
          {
            code: {
              lang: "sh",
              title: "watch the iteration yourself",
              body: "# +trace makes dig act like a recursive resolver, from root down:\ndig +trace www.example.com\n\n# query a specific server directly (bypass your resolver):\ndig @1.1.1.1 example.com A\n\n# read TTLs counting down in your resolver's cache:\ndig example.com   # run twice, compare the TTL column",
            },
          },
        ],
      },
      {
        id: "n10l3",
        title: "Records that earn their keep",
        est: "~12 min",
        blocks: [
          {
            p: "**A** / **AAAA** — name to IPv4 / IPv6. **CNAME** — alias to another *name* (resolution restarts there); the classic constraint: a CNAME must be the only record at its name, which is why zone apexes (`example.com` itself) can't CNAME and hosting providers invented ALIAS/flattening workarounds. **MX** — mail destination, with priorities. **TXT** — free-form strings that became load-bearing: SPF, DKIM, DMARC (email authenticity) and half the world's domain-ownership verifications live here. **SRV** — 'service at this name lives on host X port Y' (how many protocols self-locate). **PTR** — reverse DNS, IP to name, in the special in-addr.arpa tree; mail servers without matching forward/reverse get distrusted. **SOA** — zone metadata; **CAA** — which certificate authorities may issue for this name (foreshadowing N13).",
          },
          {
            p: "DNS is also a **traffic-steering layer**: multiple A records rotate answers (crude round-robin balancing); GeoDNS answers differently by client location; low-TTL records let you fail over by changing an answer. Combined with anycast (N10) this is how planet-scale services front themselves — a fact worth remembering whenever 'the same URL' behaves differently from two places, and when your tunnel changes which resolver (and thus which *answers*) a user gets: full-tunnel users may literally reach different servers than before.",
          },
        ],
      },
      {
        id: "n10l4",
        title: "Securing names: two different problems",
        est: "~12 min",
        blocks: [
          {
            p: "Classic DNS is plaintext UDP with a 16-bit transaction ID — historically vulnerable to **cache poisoning**: race a fake answer to a resolver and every downstream user inherits the lie (Kaminsky's 2008 attack industrialized this). Mitigations hardened the race (source-port randomization, 0x20 case games), but the honest fix splits into two *different* guarantees, and knowing which is which is the professional skill.",
          },
          {
            p: "**DNSSEC** = *authenticity*. Zones sign their records; a chain of trust runs root → TLD → zone via DS/DNSKEY records; validating resolvers reject forged answers. It does **not** encrypt anything — the whole world can still read your queries — and its failure mode is availability (bad signatures = domain vanishes), which is why adoption is respected-but-partial.",
          },
          {
            p: "**DoT / DoH / DoQ** = *privacy of transport*. Same DNS questions, carried inside TLS (port 853), HTTPS (443, indistinguishable from web traffic), or QUIC. The on-path café attacker can no longer read or rewrite your lookups — but the *resolver you chose* still sees everything; you've moved trust, not removed it. Neither technology replaces the other: DNSSEC authenticates answers, DoH hides questions.",
          },
          {
            note: "Tunnel tie-in: encrypted DNS both helps and complicates you. A browser doing its own DoH quietly bypasses the tunnel's carefully-assigned resolver — split-DNS enterprise setups (S01) break, and your 'no leaks' story now includes a browser setting. Real clients detect and account for it.",
            label: "DoH vs your VPN",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "n10e1",
        type: "order",
        title: "Cold-cache resolution",
        kind: "SEQUENCE LAB",
        prompt:
          "A recursive resolver with an empty cache is asked for www.example.com. Order the full dance.",
        items: [
          "Stub resolver sends the question to its one configured recursive resolver",
          "Recursive asks a root server — gets a referral to the .com nameservers",
          "Recursive asks .com — gets a referral to example.com's authoritative servers",
          "Recursive asks the authoritative server — gets the A/AAAA answer",
          "Answer returns to the stub; every step is cached against its TTL",
        ],
        why: "Recursive for you, iterative for itself. Tomorrow the referral cache means most of these steps never happen again — the design runs on remembering.",
      },
      {
        id: "n10e2",
        type: "match",
        title: "Record type triage",
        kind: "MATCH LAB",
        prompt: "Match each situation to the record type it involves.",
        pairs: [
          {
            t: "Mail to the domain bounces; senders can't find a mail host",
            d: "MX — the mail-exchanger records are missing or wrong",
          },
          {
            t: "Provider says 'verify ownership by adding a string to DNS'",
            d: "TXT — the junk drawer that became critical infrastructure",
          },
          {
            t: "www works but example.com (apex) can't alias the CDN",
            d: "CNAME — forbidden at the apex, hence ALIAS/flattening workarounds",
          },
          {
            t: "A CA refuses to issue a certificate for the domain",
            d: "CAA — the record whitelisting which authorities may issue",
          },
          {
            t: "Your mail server's IP has no name when looked up backwards",
            d: "PTR — missing reverse DNS, a spam-score red flag",
          },
        ],
        why: "Five records, five recurring tickets. TXT-as-critical-infrastructure and the apex-CNAME rule are the two that surprise people.",
      },
    ],
    quiz: {
      id: "n10q",
      questions: [
        {
          q: "You update an A record and half the world sees the change hours later. The mechanism?",
          opts: [
            "DNS servers sync on a schedule",
            "Caches worldwide hold the old answer until its TTL expires — 'propagation' is just caches counting down",
            "The registrar batches changes",
          ],
          a: 1,
          why: "Nothing propagates; things expire. Which is why you lower TTLs *before* a migration, not during the outage.",
        },
        {
          q: "DNSSEC vs DoH — the accurate division of labor?",
          opts: [
            "Both encrypt queries",
            "DNSSEC proves answers weren't forged; DoH hides queries from on-path observers — authenticity vs transport privacy",
            "DoH replaces DNSSEC",
          ],
          a: 1,
          why: "Different threats, different layers. A poisoned answer over encrypted transport is still poison; a signed answer over plaintext is still public.",
        },
        {
          q: "Why does a recursive resolver only rarely contact the root servers?",
          opts: [
            "Root servers rate-limit heavily",
            "Referral caching — one lookup teaches it the .com servers for days of future queries",
            "Roots only serve other roots",
          ],
          a: 1,
          why: "The hierarchy's scalability is cached referrals. Roots mostly answer empty-cache resolvers and the world's typos.",
        },
        {
          q: "A user's browser has DoH enabled. What does that mean for their corporate VPN's split-DNS setup?",
          opts: [
            "Nothing — DoH follows system DNS settings",
            "Internal-name resolution can silently break: the browser ships queries to a public resolver, bypassing the tunnel's assigned one",
            "It makes split-DNS more reliable",
          ],
          a: 1,
          why: "The browser opted out of the OS resolver path your tunnel configured. Modern clients must detect this or field the mystery tickets.",
        },
      ],
    },
  },
  {
    id: "n11",
    code: "N13",
    title: "TLS, HTTP & QUIC",
    layers: ["L5", "L6", "L7"],
    est: "~70 min",
    tag: "The encryption the web actually runs on, the PKI behind it, and HTTP's three-act evolution into QUIC.",
    lessons: [
      {
        id: "n11l1",
        title: "TLS 1.3: the web's handshake",
        est: "~12 min",
        blocks: [
          {
            p: "TLS is the other great handshake in your life, and 1.3 made it rhyme with what you know from T02. ClientHello carries the client's supported suites *and* an ephemeral key share (optimistically guessing the group); ServerHello answers with its own share and — already encrypted from this point — the certificate and a signed proof of holding its private key. One round trip to application data, ephemeral (EC)DHE always, so **forward secrecy is mandatory**: yesterday's captures stay dark even if the server key leaks tomorrow. 1.3 also amputated the legacy cipher zoo down to a handful of AEADs (your T02 vocabulary applies verbatim).",
          },
          {
            p: "The contrast with Noise_IK is the instructive part: WireGuard *pre-knows* the peer's key (config is the PKI), so it authenticates in message one and hides in silence. TLS must talk to **strangers** — you've never met this server — so identity arrives *during* the handshake as a certificate, vouched for by a third party. Same primitives, opposite trust bootstrap. That single difference explains most of both designs.",
          },
          {
            p: "Three handshake extensions you'll meet professionally: **SNI** — the client names which site it wants (one IP hosts many), historically in plaintext, which is exactly what censors key on; **ECH** encrypts it, closing one of the last metadata leaks; **ALPN** — negotiate the application protocol (h2 vs http/1.1) inside the handshake, sparing a round trip. And **0-RTT**: returning clients may send data with the first flight using a resumption key — with the sharp edge that 0-RTT data is **replayable**, so it must carry only idempotent requests.",
          },
        ],
      },
      {
        id: "n11l2",
        title: "PKI: manufactured trust",
        est: "~10 min",
        blocks: [
          {
            p: "A certificate is a signed statement — 'this public key belongs to example.com' — from a **Certificate Authority** your OS/browser already trusts. Verification walks the **chain**: leaf, signed by an intermediate, signed by a root in the local trust store; plus name match, validity dates, and (via CAA from N12) whether that CA was even allowed to issue. **ACME/Let's Encrypt** automated issuance by having you prove control of the name (serve a challenge over HTTP or publish a DNS TXT record — N12 again), which took certificates from an annual ritual to invisible infrastructure.",
          },
          {
            p: "The system's checks-and-balances, since any trusted CA can technically vouch for any name: **Certificate Transparency** — all issued certs go into public append-only logs, so a mis-issuance for your domain is *detectable* (monitor the logs; it's how corporate security teams catch trouble). Revocation remains the weak joint: CRLs and OCSP both aged poorly; short-lived certs are the pragmatic answer — things that expire in days don't need elaborate un-trusting.",
          },
          {
            p: "Two patterns for your world: **mTLS** — the client presents a certificate too, machine-to-machine authentication for APIs and service meshes (and how some enterprise VPN postures identify devices, S02); and **certificate pinning** — refusing all but a specific key, which hardens an app *and* is how it breaks the day the key rotates. Pin with escape hatches or not at all.",
          },
        ],
      },
      {
        id: "n11l3",
        title: "HTTP's three acts",
        est: "~10 min",
        blocks: [
          {
            p: "**Act I — HTTP/1.1**: human-readable request/response over one TCP connection, kept alive between requests. Its wall: one request *at a time* per connection — a slow response blocks the queue (**head-of-line blocking**, application edition). Browsers 'solved' it by opening six parallel connections per host, and an era of hacks (spriting, domain sharding) grew around the limit.",
          },
          {
            p: "**Act II — HTTP/2**: one TCP connection, many concurrent **streams**, binary framing, header compression (HPACK). App-level HoL solved — and a subtler one exposed: everything still rides *one TCP byte stream*, so a single lost packet stalls **all** streams until retransmission (N09's in-order guarantee, now a liability). TCP's greatest promise became HTTP/2's bottleneck on lossy paths.",
          },
          {
            p: "**Act III — HTTP/3**: keep the streams idea, replace the transport. QUIC gives each stream **independent delivery**, so one lost packet stalls only its own stream. The endgame of a pattern you now own: reliability guarantees belong at the layer that wants them, not below it (N08's UDP choice, N09's meltdown, S02's MASQUE datagrams — same law, four sightings).",
          },
        ],
      },
      {
        id: "n11l4",
        title: "QUIC: the transport rebuilt in userspace",
        est: "~12 min",
        blocks: [
          {
            p: "QUIC is TCP's job description reimplemented over UDP with 2020s requirements: **encryption is not optional** — TLS 1.3 is fused into the transport, and even most header fields are encrypted, leaving middleboxes almost nothing to 'help' with (that's deliberate: ossification — middleboxes freezing protocol evolution by meddling — is why deploying *any* new L4 protocol natively became impossible, and why the new transport hides inside UDP). Handshake and key exchange complete together: 1-RTT cold, 0-RTT warm.",
          },
          {
            p: "Two features you should recognize as old friends: **streams** with per-stream flow control and independent loss recovery (the HoL fix), and **connection IDs** — a QUIC connection is identified by an ID, not by the 5-tuple, so it survives your phone hopping Wi-Fi→LTE. That is WireGuard's roam-by-identity trick (T03) arriving in the mainstream transport. Add **unreliable DATAGRAM frames** (RFC 9221) and QUIC can carry packet-shaped cargo without retransmission — the exact hook MASQUE/CONNECT-IP hangs a whole VPN on (S02).",
          },
          {
            p: "Costs, honestly: userspace QUIC burns more CPU than kernel TCP (improving as offloads land), UDP gets second-class treatment on some networks (hence every QUIC deployment keeps a TCP fallback — Happy-Eyeballs thinking again), and 0-RTT's replay caveat travels with it. But the trajectory is one-way: the web's transport is becoming an encrypted, stream-multiplexed, connection-mobile thing that *looks like ordinary UDP on port 443* — which is precisely the crowd your stealthiest tunnels want to disappear into.",
          },
        ],
      },
      {
        id: "n11l5",
        title: "DTLS: TLS for datagrams",
        est: "~10 min",
        blocks: [
          {
            p: "One family member remains: **DTLS** — TLS re-engineered to run over UDP, for the years between 'we need datagram security' and QUIC. TLS assumes TCP's gifts (ordered, reliable bytes); DTLS must live without them, so it adds back the minimum: **explicit sequence numbers and epochs** in every record (TLS infers order from TCP; DTLS cannot), **handshake retransmission timers** (lost flights are resent whole), **fragmentation** of large handshake messages to fit MTUs (N01 strikes again), and a **replay window** on received records — the same sliding-bitmap idea as WireGuard's counters (T02).",
          },
          {
            p: "Its anti-DoS move should look familiar: since a UDP ClientHello can carry a spoofed source, the server responds with a **stateless cookie challenge** (HelloVerifyRequest in 1.2; the Retry-style mechanism in 1.3) and only allocates state once the client echoes it from a real address — the third sighting of the cookie pattern after WireGuard (T02) and SYN cookies (N17). DTLS 1.3 modernized alongside TLS 1.3: same 1-RTT handshake, AEAD-only, slimmer records.",
          },
          {
            p: "Where you'll meet it: **WebRTC** (every browser call negotiates SRTP media keys via DTLS), **Cisco AnyConnect / OpenConnect** (TLS control channel + DTLS data channel, falling back to TLS when UDP is blocked — a two-transport design worth studying for your own fallback logic), CoAP/IoT, and LDAP-over-UDP corners of enterprise. The family portrait for tunnel builders: **DTLS** = certificate-PKI trust, standardized, middlebox-legible; **WireGuard** = pre-shared-key trust, silent, minimal (T02); **QUIC** = PKI trust *plus* streams, migration, and camouflage among web traffic. Same AEAD engine room in all three — the differences are trust bootstrap and what the wire betrays.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "n11e1",
        type: "order",
        title: "TLS 1.3, cold start",
        kind: "SEQUENCE LAB",
        prompt:
          "A browser meets a server for the first time. Order the 1-RTT handshake to first request.",
        items: [
          "ClientHello: supported suites plus an optimistic ephemeral key share",
          "ServerHello: server's key share — both sides now compute shared secrets",
          "Server sends certificate chain and proof-of-key, already encrypted",
          "Client validates the chain to a trusted root and checks the name",
          "Finished messages confirm; the HTTP request rides the same flight",
        ],
        why: "Key agreement first, identity second, all in one round trip — and compare T02: WireGuard skips steps 3–4 because config pre-answered the identity question.",
      },
      {
        id: "n11e2",
        type: "match",
        title: "Which layer broke?",
        kind: "MATCH LAB",
        prompt: "Match each production symptom to the mechanism at fault.",
        pairs: [
          {
            t: "Site works in browsers, one legacy app rejects it",
            d: "Trust store — the app's CA bundle is stale and can't build the chain",
          },
          {
            t: "HTTP/2 site crawls on a 2% packet-loss link",
            d: "TCP head-of-line blocking — one loss stalls every multiplexed stream",
          },
          {
            t: "App breaks the day certificates rotate",
            d: "Certificate pinning without an escape hatch",
          },
          {
            t: "Censor blocks specific sites on a shared-IP host",
            d: "Plaintext SNI naming the target in the ClientHello — ECH's reason to exist",
          },
          {
            t: "Duplicate purchase from a resumed session",
            d: "0-RTT replay — early data must be idempotent, and this wasn't",
          },
        ],
        why: "Five famous failure modes. HTTP/2-on-lossy-link and pinning-vs-rotation are the two most reliably rediscovered in production.",
      },
    ],
    quiz: {
      id: "n11q",
      questions: [
        {
          q: "Why does TLS need certificates when WireGuard doesn't?",
          opts: [
            "TLS uses weaker crypto",
            "TLS authenticates strangers, so identity must be vouched mid-handshake; WireGuard pre-distributes peer keys in config",
            "Certificates are legally required",
          ],
          a: 1,
          why: "Opposite trust bootstraps: PKI for the open web, out-of-band keys for closed peer sets. Same AEAD machinery underneath.",
        },
        {
          q: "HTTP/2 solved head-of-line blocking, and HTTP/3 solved it again. Both true — how?",
          opts: [
            "Marketing repetition",
            "H2 fixed the application-level queue; one lost TCP packet still stalled all streams — H3's independent QUIC streams fixed the transport level",
            "H3 just renamed H2",
          ],
          a: 1,
          why: "Two different HoLs, one lesson: the guarantee has to live at the layer that wants it.",
        },
        {
          q: "What makes QUIC connections survive a Wi-Fi-to-LTE switch?",
          opts: [
            "Faster retransmission",
            "Connections are identified by connection ID rather than the address 5-tuple",
            "Carriers coordinate the handoff",
          ],
          a: 1,
          why: "Identity decoupled from address — the same design move as WireGuard's roam-by-key, now in the web's transport.",
        },
        {
          q: "Why is nearly all of QUIC encrypted, including headers TCP exposes?",
          opts: [
            "Pure privacy maximalism",
            "To prevent middlebox meddling and the protocol ossification that froze TCP's evolution",
            "To compress better",
          ],
          a: 1,
          why: "If middleboxes can read it, they'll depend on it; if they depend on it, you can never change it. Encryption as an anti-ossification coating.",
        },
        {
          q: "Why does DTLS need explicit sequence numbers, retransmission timers, and a cookie exchange when TLS has none of them?",
          opts: [
            "It predates good design",
            "It runs over UDP: no ordering to infer from, no reliable delivery for handshakes, and no TCP handshake to weakly validate source addresses",
            "For FIPS compliance",
          ],
          a: 1,
          why: "Every addition is a TCP gift being replaced. And the cookie is the third appearance of stateless source validation in this course — SYN cookies, WireGuard cookies, DTLS cookies: one idea, three uniforms.",
        },
      ],
    },
  },
];
