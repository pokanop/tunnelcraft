import type { Module } from "./types";

/* Platform deep dives B: Linux & Android; proxies, PAC & split tunneling */

export const PLATFORM_B: Module[] = [
  {
    id: "p03",
    code: "P03",
    title: "Linux & Android Internals",
    layers: ["XP"],
    est: "~70 min",
    tag: "/dev/net/tun for real, policy routing dissected line by line, and VpnService — the fd Android hands your Rust core.",
    lessons: [
      {
        id: "p03l1",
        title: "/dev/net/tun, properly",
        est: "~12 min",
        blocks: [
          {
            p: "T01 opened the device; here's the professional's tour. `open(\"/dev/net/tun\")` then `ioctl(TUNSETIFF)` with flags: **IFF_TUN** (L3, IP packets) vs **IFF_TAP** (L2, whole Ethernet frames — which drags ARP, broadcast, and N02's entire circus into your userspace; VPNs almost always want TUN), and **IFF_NO_PI** to skip the 4-byte packet-info header nobody misses. Creating the interface needs CAP_NET_ADMIN, but here's the deployment-relevant part: the fd can be *handed to an unprivileged process* — set a persistent interface with `ip tuntap add mode tun user vpn`, and your daemon drops privileges after setup (least-privilege, S01).",
          },
          {
            p: "Performance features that separate wireguard-go-class throughput from toy loops: **IFF_MULTI_QUEUE** gives you several fds for one interface — one per core, the kernel spreads flows across them (ECMP thinking from N10, applied to your own device); and **TUNSETOFFLOAD / virtio-net headers** enable **GSO/GRO through the TUN device**: the kernel hands you one giant 64 KB 'packet' plus a header describing how to segment it, so your encrypt loop runs once per *batch* instead of once per MTU-sized packet — the single biggest userspace-VPN speedup of recent years, and exactly the syscall-amortization law from T01/P02 again.",
          },
          {
            p: "Debug the device itself like N16 taught: `ip -d link show tun0` (flags, queues), `ip addr`/`ip route` for plumbing, and tcpdump directly on tun0 — plaintext there vs ciphertext on eth0 is the one-machine, two-vantage capture from N16, Linux edition.",
          },
        ],
      },
      {
        id: "p03l2",
        title: "Policy routing: the WireGuard incantation, dissected",
        est: "~14 min",
        blocks: [
          {
            p: "Linux routing isn't one table — it's **rules selecting among tables**: `ip rule` lists prioritized selectors (match on source, fwmark, incoming interface…) each pointing at a routing table; `ip route show table X` shows a table's contents. N10's 'most specific wins' still governs *within* a table; rules decide *which table plays*. This is the machinery behind split tunneling, multi-WAN, and every 'route this differently' trick on Linux — and it's how wg-quick does full-tunnel without ever touching your main table.",
          },
          {
            code: {
              lang: "sh",
              title: "wg-quick's four moves, one idea each",
              body: "wg set wg0 fwmark 51820                  # 1. outer UDP packets get MARKED\nip route add default dev wg0 table 51820 # 2. private table: everything -> tunnel\nip rule add not fwmark 51820 table 51820 # 3. UNMARKED traffic uses that table...\nip rule add table main suppress_prefixlength 0\n                                         # 4. ...but main's SPECIFIC routes (LAN!)\n                                         #    still win; only main's default is suppressed\n\n# read it back like N16 taught:\nip rule show; ip route show table 51820\nip route get 8.8.8.8        # -> dev wg0 (tunneled)\nip route get 8.8.8.8 mark 51820   # -> via eth0 (the outer socket escapes)",
            },
          },
          {
            p: "Read the loop-prevention trick in rule 3: the encrypted outer packets carry the fwmark, so they *skip* the tunnel table and exit via main/eth0 — the /32 endpoint pin from N01/P02, achieved with a mark instead of a route. And rule 4's `suppress_prefixlength 0` is the elegant part: consult main first, accept any match more specific than /0 (your LAN, your printer), suppress only its default — so 'LAN stays local, world goes tunneled' emerges from rule composition, not enumeration. This is the pattern to steal for your own client's Linux engine; nftables marks per-cgroup extend it to **per-app** routing (the Android trick, native edition).",
          },
          {
            p: "Round out the Linux picture: `rp_filter` (reverse-path filtering) will silently drop asymmetric tunnel traffic — set loose mode on the tunnel interface; kill switch is an nftables policy-drop chain with exceptions for wg0 + marked packets (persistent via netfilter, S01's fail-closed); and split DNS is `resolvectl domain wg0 ~corp.example` with systemd-resolved routing queries per-domain per-link — the third platform, the third completely different split-DNS mechanism.",
          },
        ],
      },
      {
        id: "p03l3",
        title: "Android: VpnService & the borrowed fd",
        est: "~14 min",
        blocks: [
          {
            p: "Android's entire VPN surface is **VpnService**: your app declares the service, the user grants the one-time system consent dialog, and you configure a **Builder** — `addAddress` (tunnel IP), `addRoute` (what to capture: `0.0.0.0/0` plus `::/0` for full tunnel — N05's dual-stack rule, or you ship the v6 leak), `addDnsServer`, `setMtu(1280)`, and the split-tunnel pair `addAllowedApplication` / `addDisallowedApplication` — **per-app split tunneling as a first-class API**, the thing P02 hand-builds with WFP conditions and P01 needs MDM for. `establish()` returns a **ParcelFileDescriptor**: a real TUN fd you detach and pass across JNI/uniffi (S01) straight into the Rust core's packet loop — the same read()/write() code as Linux, because underneath it *is* Linux (VpnService drives the same tun driver plus per-UID routing rules on your behalf).",
          },
          {
            p: "The loop-prevention move is unique here: your process can't add an endpoint route, so **VpnService.protect(socket)** marks your outer UDP socket to bypass the VPN — forget it and you build the self-swallowing tunnel from N01 on day one. Lifecycle is the hard part: **always-on VPN + lockdown** (user-togglable in settings) is the system-enforced kill switch — traffic blocked whenever your VPN isn't up, no nftables required; Doze and background-execution limits mean your service must run as a foreground service with a notification; and network switches arrive via ConnectivityManager callbacks — rebind the outer socket, keep the tunnel fd, and WireGuard's identity-not-address roaming (T03) makes the handover seamless.",
          },
          {
            p: "Two closing realities: apps can *detect* VPN presence (NetworkCapabilities) and some (banking, streaming) change behavior — a support-ticket genre of its own; and Android 10+ offers **seamless handover**: establish a *second* tunnel fd, migrate, then close the old one — zero-packet-drop reconfiguration, which is precisely the double-buffered config-swap pattern your S02 config broker wants everywhere.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "p03e1",
        type: "blank",
        title: "Read the policy-routing incantation",
        kind: "CODE LAB",
        prompt:
          "Fill the blanks so this Linux full-tunnel setup routes everything through wg0 while the encrypted outer packets and LAN traffic escape correctly.",
        code: "wg set wg0 §0§ 51820\nip route add default dev wg0 table 51820\nip rule add not fwmark 51820 §1§ 51820\nip rule add table main §2§ 0",
        blanks: [
          { opts: ["fwmark", "mtu", "listen-port"], a: 0 },
          { opts: ["table", "prohibit", "goto"], a: 0 },
          { opts: ["suppress_prefixlength", "pref", "blackhole"], a: 0 },
        ],
        why: "Mark the outer packets; send unmarked traffic to the tunnel table; let main's specific routes (your LAN) still win while suppressing only its default. Four lines that encode loop prevention, full tunnel, and LAN exclusion at once.",
      },
      {
        id: "p03e2",
        type: "match",
        title: "Same job, three platforms",
        kind: "MATCH LAB",
        prompt:
          "Match each cross-platform job to its Linux/Android primitive (P01/P02 taught the Apple/Windows versions).",
        pairs: [
          {
            t: "Keep the outer UDP socket out of the tunnel",
            d: "fwmark rule on Linux; VpnService.protect() on Android",
          },
          {
            t: "Per-app split tunneling",
            d: "addAllowed/DisallowedApplication — first-class in the VpnService Builder",
          },
          {
            t: "Fail-closed kill switch",
            d: "nftables default-drop on Linux; system always-on + lockdown on Android",
          },
          {
            t: "Split DNS by domain",
            d: "resolvectl domain wg0 ~corp.example via systemd-resolved",
          },
          {
            t: "Zero-drop config change",
            d: "Establish a second tun fd, migrate, close the old (Android seamless handover)",
          },
        ],
        why: "The jobs are constant across P01–P03; only the primitives change. This table is your S02 platform-abstraction layer, written as a study aid.",
      },
    ],
    quiz: {
      id: "p03q",
      questions: [
        {
          q: "What does 'ip rule add table main suppress_prefixlength 0' accomplish in the wg-quick setup?",
          opts: [
            "Deletes the main table's default route",
            "Lets main's specific routes (LAN, printers) keep winning while ignoring only its default — LAN exclusion without enumerating LANs",
            "Suppresses IPv6",
          ],
          a: 1,
          why: "Consult main first, accept anything more specific than /0, fall through to the tunnel table for the rest. Composition instead of enumeration.",
        },
        {
          q: "Why must an Android VPN call protect() on its own UDP socket?",
          opts: [
            "Battery optimization",
            "Otherwise the encrypted outer packets are captured by the VPN's own routes — the classic tunnel-swallows-itself loop",
            "TLS requires it",
          ],
          a: 1,
          why: "protect() is Android's spelling of the endpoint escape: N01's /32 pin, P03-Linux's fwmark, all the same idea.",
        },
        {
          q: "The strongest kill switch on Android is…",
          opts: [
            "An in-app nftables rule",
            "System always-on VPN with lockdown — the OS itself blocks traffic when your VPN is down, surviving your process entirely",
            "A watchdog thread",
          ],
          a: 1,
          why: "Apps can't install firewall rules; the platform offers something better — enforcement that outlives you. Know which platform gives you what (S01's table, completed).",
        },
        {
          q: "What makes TUNSETOFFLOAD/GSO through the tun device such a large speedup?",
          opts: [
            "It compresses packets",
            "The kernel batches many segments into one giant buffer per syscall, so your read/encrypt loop runs per-batch instead of per-MTU-packet",
            "It bypasses encryption",
          ],
          a: 1,
          why: "Per-packet syscalls were the ceiling (T01); offload headers amortize them away. Wintun's rings (P02) attack the identical cost differently.",
        },
      ],
    },
  },
  {
    id: "p04",
    code: "P04",
    title: "Proxies, PAC & Split-Tunnel Strategy",
    layers: ["L4", "L7", "XP"],
    est: "~65 min",
    tag: "CONNECT, SOCKS5, PAC files and WPAD, and the four ways to split a tunnel — the traffic-steering layer above routing.",
    lessons: [
      {
        id: "p04l1",
        title: "The proxy bestiary",
        est: "~12 min",
        blocks: [
          {
            p: "A **proxy** steers traffic at L4/L7 the way routes steer it at L3 — and enterprises run both, so your client must coexist with theirs. The species: a **forward HTTP proxy** speaks HTTP itself for plain requests; for HTTPS the client sends **CONNECT host:443** and the proxy opens a blind TCP pipe while TLS runs end-to-end through it (N13's guarantees survive; the proxy sees only the target name). Recognize CONNECT as a tunnel-inside-TCP primitive — MASQUE (S02) is literally its modern descendant: CONNECT-UDP and CONNECT-IP extend the same verb to datagrams and whole IP flows over HTTP/3.",
          },
          {
            p: "**SOCKS5** is the L4 generalist: protocol-agnostic TCP relaying, name-based targets (the *proxy* resolves DNS — which is itself a leak-control decision: 'socks5h' vs 'socks5' in curl is exactly whether names escape locally), and the often-forgotten **UDP ASSOCIATE** for datagram relay. It's the shape most 'proxy your app through the tunnel' features take, and what SSH's -D flag hands you. **Transparent proxies** intercept without client configuration — on Linux via REDIRECT/TPROXY (nftables sending flows to a local port), on macOS as P01's NETransparentProxyProvider — the client thinks it's talking to the origin.",
          },
          {
            p: "Auth is where proxy integration goes to suffer: Basic (fine over TLS), and the Windows-enterprise pair NTLM/**Kerberos** (Negotiate) with per-connection handshakes that break naive connection pooling. And keep the taxonomy straight when talking to users: a proxy steers *some application traffic* by configuration; a VPN captures *the device's packets* by routing. Your client may be both at once — a packet tunnel that also runs a local SOCKS listener for per-app opt-in is a common hybrid.",
          },
        ],
      },
      {
        id: "p04l2",
        title: "PAC & WPAD: proxy policy as JavaScript",
        est: "~13 min",
        blocks: [
          {
            p: 'Enterprises rarely hardcode one proxy; they ship a **PAC file** — JavaScript defining `FindProxyForURL(url, host)` that returns a routing decision string: `"PROXY px1.corp:8080; SOCKS5 fallback:1080; DIRECT"` (a failover *list*, tried in order). The helper predicates are a fixed little standard library: `dnsDomainIs(host, ".corp.example")`, `isInNet(host, "10.0.0.0", "255.0.0.0")`, `shExpMatch`, `isPlainHostName`, `myIpAddress()` — pattern-matching hosts to egress paths. PAC is, notice, *split tunneling at L7, in JavaScript, from 1996* — the strategy matrix in the next lesson has deep roots.',
          },
          {
            code: {
              lang: "javascript",
              title: "a real-world-shaped PAC file",
              body: 'function FindProxyForURL(url, host) {\n  if (isPlainHostName(host) || dnsDomainIs(host, ".corp.example"))\n    return "DIRECT";                          // intranet: never proxy\n  if (isInNet(host, "10.0.0.0", "255.0.0.0"))\n    return "DIRECT";                          // beware: this RESOLVES host!\n  if (shExpMatch(host, "*.video-cdn.com"))\n    return "PROXY media-px.corp:8080";        // steer bulk traffic\n  return "PROXY px1.corp:8080; PROXY px2.corp:8080; DIRECT";\n}',
            },
          },
          {
            p: "Where does the PAC come from, and who evaluates it? Discovery is **WPAD**: DHCP option 252, or probing `http://wpad.<domain>/wpad.dat` — convenient and a famous attack surface, since whoever answers for 'wpad' on a hostile network becomes everyone's proxy (a cousin of N02/N12's spoofing family; modern OSes dialed WPAD back for exactly this reason). Evaluation happens in per-OS engines — WinHTTP on Windows, CFNetwork on Apple, and browsers with their own — which is why 'system proxy' and 'browser proxy' can disagree.",
          },
          {
            p: "Now the part that lands on *your* desk: a VPN client on an enterprise machine must **process PAC itself**. If corporate egress requires a proxy, your tunnel's outer connection may need to honor `FindProxyForURL` before it can even reach the VPN gateway (WireGuard-over-TCP/MASQUE via `PROXY ...`, since raw UDP rarely traverses these networks) — which means evaluating JS: clients embed a small engine or a PAC-subset interpreter, cache the verdict per destination, and re-evaluate on network change. Two footguns to encode: `isInNet(host,…)` *resolves the hostname* during evaluation — a DNS query your leak story must account for (N11), potentially before the tunnel exists; and PAC verdicts are failover lists, so honor the `; DIRECT` tail or you'll hard-fail where the browser would have soldiered on.",
          },
        ],
      },
      {
        id: "p04l3",
        title: "Split tunneling: the strategy matrix",
        est: "~14 min",
        blocks: [
          {
            p: "You have now met every mechanism; here is the map. **By route (CIDR)** — AllowedIPs (T03), includedRoutes (P01), the /1 trick (P02), policy tables (P03): simple, universal, leak-analyzable — and blind to *who* is talking, useless when services live on ever-shifting CDN ranges. **By app** — Android's Builder lists, WFP application-path conditions, NEAppRule, Linux cgroup marks: matches user intent ('work apps through work VPN') but per-platform machinery differs wildly, and one app can serve both personal and corporate traffic.",
          },
          {
            p: "**By domain** — the modern enterprise favorite: matchDomains split DNS (P01), NRPT (P02), resolvectl domains (P03), or the DNS-synthesis trick where the tunnel's resolver answers corporate names with addresses from a captured CIDR so domain policy *becomes* route policy. Its Achilles heel you already know from N12: a browser doing its own DoH silently bypasses the whole scheme — production clients detect and handle it. **By policy/flow** — the endgame: per-flow decisions weighing app, destination, user, and device posture, i.e. S02's Flow dispatch and zero trust's per-request authorization (N17). The four strategies compose; real deployments layer them.",
          },
          {
            p: "Whatever the strategy, run the same **leak review**: What happens to IPv6 (is ::/0 handled, or does every AAAA walk around the split — N05)? Who resolves names, and does the *resolution path* match the *traffic path* (the isInNet and DoH traps)? What do LAN exclusions admit on a hostile network (excludeLocalNetworks + a café using 192.168.0.0/16 — N07's ranges as threat model)? And does the inverse hold under failure — when the tunnel dies, does 'split' decay to 'open' (kill-switch interaction, S01)? A split-tunnel design isn't done when it routes correctly; it's done when each of those four questions has a written answer.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "p04e1",
        type: "match",
        title: "Steer this traffic",
        kind: "MATCH LAB",
        prompt: "Match each requirement to the steering mechanism that fits it best.",
        pairs: [
          {
            t: "Only 10.0.0.0/8 through the corporate tunnel",
            d: "Route-based split: AllowedIPs / includedRoutes with the RFC 1918 block",
          },
          {
            t: "Slack and Jira via VPN, Spotify direct, on Android",
            d: "Per-app: addAllowedApplication on the VpnService Builder",
          },
          {
            t: "*.corp.example steered without knowing its CDN's IPs",
            d: "Domain-based: split DNS plus resolver-synthesized addresses in a captured range",
          },
          {
            t: "HTTPS out of a locked-down office network",
            d: "HTTP CONNECT through the mandated proxy — per the PAC verdict",
          },
          {
            t: "Curl through the tunnel daemon without touching routes",
            d: "Local SOCKS5 listener exposed by the client (socks5h to keep DNS inside)",
          },
        ],
        why: "Strategy selection is the skill: CIDRs for networks, apps for intent, domains for services, proxies for mandated egress. The socks5h detail is the DNS-path question in miniature.",
      },
    ],
    quiz: {
      id: "p04q",
      questions: [
        {
          q: "How does an HTTPS connection remain end-to-end encrypted through a corporate HTTP proxy?",
          opts: [
            "The proxy re-encrypts it",
            "CONNECT opens a blind TCP relay; TLS then runs client-to-origin through the pipe — the proxy sees the target name, not the content",
            "It doesn't",
          ],
          a: 1,
          why: "CONNECT is a tunnel verb inside HTTP — the direct ancestor of MASQUE's CONNECT-UDP/IP. The proxy carries what it cannot read.",
        },
        {
          q: "Why is isInNet() in a PAC file a leak concern for a VPN client?",
          opts: [
            "It's slow",
            "It performs a DNS resolution during PAC evaluation — a query that may escape before the tunnel is up and outside your controlled resolver path",
            "It only supports IPv4",
          ],
          a: 1,
          why: "The resolution path must be part of the leak model, not just the traffic path. PAC evaluation is traffic too.",
        },
        {
          q: "What made WPAD a classic attack vector?",
          opts: [
            "Weak encryption",
            "Auto-discovery trusts the local network: whoever answers for 'wpad' (DHCP or DNS) hands every client its proxy config — instant on-path position",
            "PAC files are compiled",
          ],
          a: 1,
          why: "Convenience by ambient trust — the N17 pattern. The fix, as ever: verify or don't discover.",
        },
        {
          q: "Domain-based split tunneling is cleanly configured, yet corporate names sometimes resolve publicly on some machines. Likely cause?",
          opts: [
            "The TTLs are too long",
            "Browsers using their own DoH bypass the OS resolver that implements the split — the N12 failure mode in production",
            "PTR records are missing",
          ],
          a: 1,
          why: "Split DNS only governs resolvers that consult it. Encrypted DNS moved the decision into apps, and split-tunnel designs must account for it.",
        },
      ],
    },
  },
];
