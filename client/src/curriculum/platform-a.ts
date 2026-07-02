import type { Module } from "./types";

/* Platform deep dives A: Apple Network Extension; Windows wintun/WFP/routing */

export const PLATFORM_A: Module[] = [
  {
    id: "p01",
    code: "P01",
    title: "Apple Internals: Network Extension",
    layers: ["XP"],
    est: "~75 min",
    tag: "NEPacketTunnelProvider, utun, content filters, transparent proxies — the doors Apple leaves open, in detail.",
    lessons: [
      {
        id: "p01l1",
        title: "The Network Extension family",
        est: "~12 min",
        blocks: [
          {
            p: "On Apple platforms you don't ship a driver; you adopt one of the **Network Extension** provider classes and Apple runs your code inside its plumbing. The family, by job: **NEPacketTunnelProvider** — full L3 VPN, you receive and inject IP packets (your client's home). **NEAppProxyProvider** — flow-level TCP/UDP proxying per managed app (S02's Carriage::Stream made literal: the OS hands you *flows*, not packets). **NEFilterDataProvider + NEFilterControlProvider** — the content-filter pair that inspects traffic inline. **NEDNSProxyProvider / NEDNSSettingsManager** — owning or steering resolution. **NETransparentProxyProvider** (macOS) — the modern power tool: claim *only the flows you want*, everything else passes untouched.",
          },
          {
            p: "Structurally a provider is an **extension**: a separate process with its own binary, sandbox, and lifecycle, shipped inside your app. On iOS that's an app extension, full stop; on macOS you typically ship a **system extension** (activated via OSSystemExtensionRequest, survives your app quitting, requires one-time user approval in System Settings). The consequence is architectural: your UI and your tunnel are *different programs* sharing nothing but IPC and an app-group container — the S01 daemon/UI split isn't a design choice on Apple, it's the platform's shape.",
          },
          {
            p: "Everything is gated by **entitlements** (`com.apple.developer.networking.networkextension`, with per-provider-class values) baked into provisioning profiles. No entitlement, no startTunnel. The container app manages configuration through **NETunnelProviderManager**: save a configuration (the VPN appears in Settings), then `startVPNTunnel()`. Custom control messages flow over `NETunnelProviderSession.sendProviderMessage` — S01's gRPC-flavored control plane becomes 'small serialized messages over Apple's IPC.'",
          },
        ],
      },
      {
        id: "p01l2",
        title: "Life as a packet tunnel provider",
        est: "~14 min",
        blocks: [
          {
            p: "Your subclass overrides `startTunnel`. The contract: build a **NEPacketTunnelNetworkSettings** (constructed with the `tunnelRemoteAddress`) describing everything the OS should plumb — `NEIPv4Settings`/`NEIPv6Settings` with your addresses, **includedRoutes / excludedRoutes** (this *is* route-based split tunneling on Apple: `NEIPv4Route.default()` for full tunnel, specific CIDRs for split — T03's AllowedIPs translated), **NEDNSSettings** with servers plus **matchDomains** (`[\"\"]` = capture all DNS; named domains = split DNS), and **mtu** (1280 is the safe dual-stack floor; N01's clamping lesson applies verbatim). Hand it to the system and it creates a **utun** interface, installs routes, and points DNS — you never touch a route table directly.",
          },
          {
            code: {
              lang: "swift",
              title: "the packet loop every Apple VPN runs",
              body: 'func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {\n    let s = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "203.0.113.7")\n    let v4 = NEIPv4Settings(addresses: ["10.66.0.2"], subnetMasks: ["255.255.255.255"])\n    v4.includedRoutes = [NEIPv4Route.default()]          // full tunnel\n    s.ipv4Settings = v4\n    s.dnsSettings = NEDNSSettings(servers: ["10.66.0.1"])\n    s.dnsSettings?.matchDomains = [""]                   // own ALL resolution\n    s.mtu = 1280\n    setTunnelNetworkSettings(s) { err in\n        completionHandler(err)\n        self.readLoop()\n    }\n}\nfunc readLoop() {\n    packetFlow.readPackets { pkts, protos in\n        for p in pkts { self.core.handleOutbound(p) }    // → FFI → Rust core\n        self.readLoop()\n    }\n}\n// inbound: packetFlow.writePackets(decrypted, withProtocols: [AF_INET])',
            },
          },
          {
            p: "`packetFlow` is your TUN device (T01) wearing Swift clothes: `readPackets` yields outbound IP packets, `writePackets` injects decrypted inbound ones — exactly where the uniffi boundary (S01) hands buffers to the Rust core. The brutal constraint nobody forgets after hitting it: **the iOS extension memory limit (~50 MB)** — exceed it and the OS kills the tunnel mid-flight. This is why lean cores like boringtun matter, why you reuse buffers (R02/R05), and why 'just cache it' is not an option in the provider. Add `wake`/`sleep` overrides and **NEOnDemandRules** (auto-connect when leaving trusted Wi-Fi — posture's little cousin) and you have the full lifecycle.",
          },
        ],
      },
      {
        id: "p01l3",
        title: "utun, scoped routes & kill-switch semantics",
        est: "~12 min",
        blocks: [
          {
            p: "Under the hood the system gave you a **utun** interface — Darwin's built-in TUN, no kext required. (On macOS a CLI tool like wireguard-go can open one directly via a control socket; inside NE, packetFlow wraps it.) Darwin routing has a twist worth knowing: **scoped routing** — routes and sockets can be bound to a specific interface past the default table, which is how the system keeps captive-portal probes and its own chatter working while your utun holds the default route. Verify with `netstat -rn` and `route -n get 1.1.1.1`: utun owns default; the physical interface keeps scoped escape hatches.",
          },
          {
            p: "Kill-switch semantics arrive as *flags, not firewall rules*: **includeAllNetworks** asks the system to drop traffic that would bypass the tunnel (with documented carve-outs), and **excludeLocalNetworks** re-permits LAN — reread N07's RFC 1918 ranges before enabling that on hostile networks. There is no WFP-style rule engine exposed to you (S01's comparison table, now explained): on Apple you request semantics and the OS implements them — less power, fewer ways to brick a device.",
          },
          {
            p: "Two operational realities to encode early: **captive portals** (the OS needs pre-tunnel HTTP for login; includeAllNetworks fights this, so production clients ship a 'pause for portal' state), and **path migration**: use Network.framework (`NWConnection`) for your outer UDP socket and Wi-Fi→cellular roaming (T03's identity-not-address superpower) arrives as polite path-update callbacks instead of surprises.",
          },
        ],
      },
      {
        id: "p01l4",
        title: "Content filters & the transparent proxy",
        est: "~12 min",
        blocks: [
          {
            p: "The **content filter** pair is deliberately split for privacy: **NEFilterDataProvider** sees traffic (flow metadata, bytes on request) and issues verdicts — allow, drop, or 'peek N more bytes' — but runs in a sandbox that **cannot reach the network**; **NEFilterControlProvider** can fetch rules from your server but never sees traffic. One sees, one talks, neither does both — an architecture worth stealing. Verdicts are flow-level ('app X → host Y : 443'), and on managed devices this is how parental controls and DLP products live.",
          },
          {
            p: "**NETransparentProxyProvider** (macOS) is the modern split-tunnel instrument: declare `includedNetworkRules` (by host, domain, port, prefix) and the system routes *only matching flows* into your provider as app-proxy flows — TCP you read/write, UDP as datagrams. No default-route hijack, no utun, no touching flows you didn't claim. Enterprise clients increasingly pair a packet tunnel (corporate CIDRs) with a transparent proxy (per-domain SaaS steering) — S02's per-Flow dispatch, implemented with two Apple primitives.",
          },
          {
            p: "Per-app VPN completes the set: on MDM-managed devices, **NEAppRule** binds specific apps to your provider — the strongest split-tunnel form Apple offers. The composite picture: Apple hands you packets (packet tunnel), flows (app/transparent proxy), verdicts (filters), and names (DNS proxy) as *separate faucets*. Your unified core must treat 'which faucet feeds me here' as an engine-selection detail — precisely why the TunnelEngine/Carriage abstraction (S02) earns its keep.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "p01e1",
        type: "match",
        title: "Pick the right provider class",
        kind: "MATCH LAB",
        prompt:
          "Match each product requirement to the Network Extension machinery that implements it.",
        pairs: [
          {
            t: "Full-device WireGuard VPN",
            d: "NEPacketTunnelProvider — L3 packets via packetFlow over a system utun",
          },
          {
            t: "Route only *.corp.example flows, touch nothing else",
            d: "NETransparentProxyProvider — claim flows via includedNetworkRules",
          },
          {
            t: "Block content, provably without exfiltrating traffic",
            d: "NEFilterDataProvider — verdicts from a sandbox with no network access",
          },
          {
            t: "Send every DNS query to your resolver",
            d: 'NEDNSSettings with matchDomains = [""] (or a DNS proxy provider)',
          },
          {
            t: "Auto-connect whenever the device leaves trusted Wi-Fi",
            d: "NEOnDemandRules on the saved tunnel configuration",
          },
        ],
        why: "Apple splits the VPN problem into faucets; choosing the wrong class is a rewrite, not a refactor. This table is the first architecture decision of any Apple client.",
      },
    ],
    quiz: {
      id: "p01q",
      questions: [
        {
          q: "Your iOS tunnel dies under sustained throughput with no error in your logs. First suspect?",
          opts: [
            "Apple throttling VPNs",
            "The ~50 MB extension memory limit — the OS kills providers that exceed it; audit buffering and per-packet allocation",
            "Certificate expiry",
          ],
          a: 1,
          why: "The signature Apple-VPN incident, and why lean Rust cores plus buffer reuse aren't optional on iOS.",
        },
        {
          q: "How do you implement 'corporate domains resolve through the tunnel, everything else uses local DNS' on Apple?",
          opts: [
            "Rewrite /etc/resolv.conf from the extension",
            "NEDNSSettings.matchDomains listing the corporate domains — the system routes only those queries to your servers",
            "Block port 53 and hope",
          ],
          a: 1,
          why: "matchDomains is Apple's split-DNS switch: empty string claims everything, named domains claim selectively. No file editing, no resolver daemons.",
        },
        {
          q: "Why does the content-filter API use two separate providers?",
          opts: [
            "Performance isolation",
            "Privacy by construction: the data provider sees traffic but has no network access; the control provider has network access but sees no traffic",
            "Legacy compatibility",
          ],
          a: 1,
          why: "The provider that could leak has nothing to leak through; the one that can talk has nothing to tell. Structural guarantees beat policy promises.",
        },
        {
          q: "What does includeAllNetworks give you, and what does it cost?",
          opts: [
            "Faster routing at the cost of battery",
            "Kill-switch-like 'no traffic outside the tunnel' semantics — at the cost of fighting captive portals, which need pre-tunnel HTTP",
            "IPv6 support at the cost of IPv4",
          ],
          a: 1,
          why: "Fail-closed vs hotel-Wi-Fi login is the classic Apple VPN tension; production clients ship an explicit portal-pause state.",
        },
      ],
    },
  },
  {
    id: "p02",
    code: "P02",
    title: "Windows Internals: Wintun, WFP & the Route Table",
    layers: ["XP"],
    est: "~75 min",
    tag: "How packets are captured, filtered, and routed on Windows — and how kill switches, split DNS, and per-app rules are really built.",
    lessons: [
      {
        id: "p02l1",
        title: "Getting packets: TAP-Windows vs wintun",
        est: "~12 min",
        blocks: [
          {
            p: "Windows has no /dev/net/tun; you install a driver. The legacy answer is **TAP-Windows** (OpenVPN's NDIS driver): an emulated L2 Ethernet adapter — meaning your L3 VPN gets to fake ARP and strip frames it never wanted (N02 knowledge, deployed ironically). The modern answer is **wintun**: a minimal, L3-only virtual adapter built for WireGuard. Its trick is the transport — two **shared-memory ring buffers** (send/receive) between kernel and userspace with events for wakeups: packets move by writing into the ring, not via per-packet syscalls, and throughput jumps accordingly (the same syscall-amortization instinct as T01's batching lesson).",
          },
          {
            code: {
              lang: "rust",
              title: "wintun from Rust — the ring in practice",
              body: '// crate: wintun (wraps wintun.dll — the DLL ships in your installer)\nlet wintun = unsafe { wintun::load()? };\nlet adapter = wintun::Adapter::create(&wintun, "MyVPN", "MyVPN", None)?;\nlet session = std::sync::Arc::new(adapter.start_session(wintun::MAX_RING_CAPACITY)?);\n\n// TX toward the OS: allocate INSIDE the ring, write, send — zero copies\nlet mut pkt = session.allocate_send_packet(decrypted.len() as u16)?;\npkt.bytes_mut().copy_from_slice(&decrypted);\nsession.send_packet(pkt);\n\n// RX from the OS: blocks on the ring\'s event\nlet pkt = session.receive_blocking()?;\ncore.handle_outbound(pkt.bytes());   // → encrypt → UDP socket',
            },
          },
          {
            p: "Operational facts that shape your installer and support queue: driver installation needs **administrator rights** and a **signed driver** (wintun ships pre-signed; you bundle the DLL), the adapter appears in 'Network Connections' where users can and will disable it, and one process owns a session at a time. Alternatives you'll meet in the wild: **WinDivert** (packet interception without a virtual adapter — filters/mangles live traffic, great for transparent proxying) and the newer **DriverKit-style** approaches; but for a VPN, wintun's create-adapter-own-the-ring model is the mainstream.",
          },
        ],
      },
      {
        id: "p02l2",
        title: "Windows Filtering Platform: the rule engine",
        est: "~14 min",
        blocks: [
          {
            p: "**WFP** is Windows' in-kernel filtering framework — the machinery behind Windows Firewall and every serious kill switch. Mental model: packets and connection events pass through **layers** (the useful ones are the ALE — Application Layer Enforcement — connect/accept layers, plus inbound/outbound transport); you register **filters** at a layer, each with **conditions** (remote address, port, protocol, *application path*, interface LUID) and a **weight**; highest-weight match wins permit/block. Filters group under your own **sublayer** so your rules compose predictably with the system's.",
          },
          {
            p: "The canonical **fail-closed kill switch** (S01's doctrine, now with real parts) is four filters: (1) block everything outbound, low weight; (2) permit traffic on the tunnel interface's LUID, higher weight; (3) permit your daemon's own process (by application path) to the VPN endpoint's IP:port — the outer UDP must escape; (4) permit loopback and DHCP. Order by weight, not by prayer. The detail that separates toy from product: **persistent vs dynamic filters**. Dynamic filters die with your session (crash = leak — the exact failure S01 warned about); persistent/boot-time filters survive process death and reboot, which is what fail-closed actually means on Windows.",
          },
          {
            p: "WFP is also Windows' **content-filtering and per-app** surface: the ALE layers expose the connecting *application*, so 'block app X entirely' or 'only app Y may use the tunnel' are ordinary filters — this is how per-app split tunneling is built here (P01's NEAppRule equivalent, but assembled by hand). The cost of all this power is symmetrical: a wrong block-all filter with persistence briefly bricks networking on every machine you manage. Test on VMs; ship an emergency-restore CLI.",
          },
        ],
      },
      {
        id: "p02l3",
        title: "Routing, metrics & the DNS leak machine",
        est: "~14 min",
        blocks: [
          {
            p: "Windows routing is `route print`: destination/mask/gateway/**interface**/**metric**, lowest metric wins among equal prefixes (N10's tiebreak, Windows edition — metric plays the role administrative distance played on routers). Interfaces get an **automatic metric** derived from link speed, which is why 'my VPN's default route keeps losing to Ethernet' is a recurring mystery ticket. VPN clients win the table one of two ways: set the tunnel default with a *lower metric*, or play the classic **/1 trick** — add `0.0.0.0/1` and `128.0.0.0/1` via the tunnel, which beat any default route on prefix length (N01's longest-prefix rule, weaponized) without touching the original. Either way you also pin a **/32 host route to the VPN endpoint via the physical gateway** — the loop-prevention move from N01, mandatory here too.",
          },
          {
            p: "Then Windows adds its own flavor of DNS chaos: the resolver is **multi-homed and impatient** — historically it races queries across *every* interface's DNS servers and takes the fastest answer, meaning a perfect route table still leaks names to the LAN resolver (N11's leak lesson, mechanized). The professional fixes, in escalating order: set the tunnel adapter's DNS and interface priority; use **NRPT** (Name Resolution Policy Table) rules to pin domains — or all names — to specific servers (Windows' split-DNS instrument, group-policy friendly); and belt-and-suspenders, WFP filters blocking ports 53/853 everywhere except the tunnel. Production clients on Windows do all three.",
          },
          {
            code: {
              lang: "text",
              title: "the table a full-tunnel client leaves behind",
              body: "> route print -4   (abridged)\n  0.0.0.0/0        gw 192.168.1.1   if eth0   metric 25   <- original, untouched\n  0.0.0.0/1        gw on-link       if MyVPN  metric 5    <- /1 trick, tunnel\n  128.0.0.0/1      gw on-link       if MyVPN  metric 5    <- /1 trick, tunnel\n  203.0.113.7/32   gw 192.168.1.1   if eth0   metric 25   <- endpoint pinned out physical\n\nverify like N16 taught: which route wins for 8.8.8.8?\nlongest prefix: /1 beats /0 -> tunnel. for 203.0.113.7? /32 -> physical.",
            },
          },
        ],
      },
      {
        id: "p02l4",
        title: "Services, elevation & shipping",
        est: "~10 min",
        blocks: [
          {
            p: "Routing changes, WFP filters, and driver sessions all require privilege, and your UI must not run elevated — so the Windows shape is S01's split made concrete: a **Windows Service** running as SYSTEM owns wintun + WFP + routes, and a per-user tray/UI app talks to it over a **named pipe** (or gRPC on localhost) with the service authenticating callers. UAC prompts once, at install; day-to-day toggling is IPC. The service also buys crash-recovery semantics: service restart policies plus persistent WFP filters equal a kill switch that survives everything short of an uninstall.",
          },
          {
            p: "Shipping realities that consume real engineering weeks: the **code-signing** pipeline (wintun is pre-signed, but your service and installer want Authenticode/EV or SmartScreen will slander you), an MSI with driver-install steps, and **NCSI** — Windows' connectivity probes that decide whether the tray shows 'no internet'. A kill switch that blocks NCSI paints every machine offline in the UI while working fine, so permit its probes deliberately (the captive-portal cousin from P01).",
          },
          {
            p: "Debug kit for this platform, N16-style: `route print`, `netsh wfp show state` (dump every filter deciding your fate), `netsh wfp capture` (WFP's own tcpdump-for-verdicts), PowerShell's `Get-NetAdapter` / `Get-DnsClientNrptRule`, and packet capture on the wintun adapter itself — plaintext there, ciphertext on the physical NIC: N16's two-vantage-point lesson on a single machine.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "p02e1",
        type: "order",
        title: "Build the Windows kill switch",
        kind: "SEQUENCE LAB",
        prompt:
          "Order the steps that produce a fail-closed full tunnel on Windows (each depends on the previous).",
        items: [
          "Create the wintun adapter and start its ring-buffer session",
          "Pin a /32 route to the VPN endpoint via the physical gateway",
          "Add 0.0.0.0/1 and 128.0.0.0/1 routes through the tunnel adapter",
          "Install persistent WFP filters: block-all, permit tunnel LUID, permit daemon-to-endpoint",
          "Point DNS at the tunnel plus NRPT rules; verify with route print and netsh wfp show state",
        ],
        why: "Adapter before routes (routes need its LUID); endpoint pin before the /1s or the outer UDP loops into the tunnel (N01's rule); persistent filters make it fail-closed; DNS last because a perfect route table still leaks names on Windows.",
      },
      {
        id: "p02e2",
        type: "match",
        title: "Windows mechanism triage",
        kind: "MATCH LAB",
        prompt: "Match each symptom on a Windows client to its mechanism.",
        pairs: [
          {
            t: "VPN connected, but traffic still exits the Ethernet NIC",
            d: "Metric fight — the physical default route outranks the tunnel's; use lower metric or the /1 trick",
          },
          {
            t: "Routes perfect, yet internal hostnames resolve to public IPs",
            d: "Multi-homed DNS racing — the resolver asked the LAN server too; NRPT or block port 53 off-tunnel",
          },
          {
            t: "Daemon crashes and traffic flows in the clear",
            d: "Dynamic WFP filters died with the session — fail-closed requires persistent filters",
          },
          {
            t: "Tray icon says 'No Internet' while the tunnel works",
            d: "Kill switch is blocking NCSI connectivity probes",
          },
          {
            t: "Per-app rule ignores a UWP app",
            d: "ALE filters match by application path — packaged apps need package-id conditions instead",
          },
        ],
        why: "Five canonical Windows-VPN tickets. Each maps to one subsystem: route table, resolver, WFP persistence, NCSI, ALE conditions.",
      },
    ],
    quiz: {
      id: "p02q",
      questions: [
        {
          q: "Why does wintun outperform the legacy TAP driver?",
          opts: [
            "Newer compiler",
            "L3-only design plus shared-memory ring buffers — packets move without per-packet syscalls or fake Ethernet framing",
            "It runs in userspace entirely",
          ],
          a: 1,
          why: "Drop the L2 charade, amortize the kernel crossing. Same performance law as batching everywhere else in this course.",
        },
        {
          q: "What do 0.0.0.0/1 + 128.0.0.0/1 accomplish that replacing 0.0.0.0/0 doesn't?",
          opts: [
            "They're faster to look up",
            "They win by longest-prefix over any default route without deleting or restoring the original — cleaner teardown, no fights with other software",
            "They enable IPv6",
          ],
          a: 1,
          why: "Two /1s cover the whole v4 internet and outrank every /0 on specificity. Teardown is 'remove my routes,' not 'reconstruct yours.'",
        },
        {
          q: "A Windows kill switch must survive your process crashing. What's the load-bearing detail?",
          opts: [
            "A watchdog process",
            "Persistent (or boot-time) WFP filters — kernel-resident rules that outlive the session, unlike dynamic filters",
            "Running the UI as admin",
          ],
          a: 1,
          why: "S01's fail-closed doctrine has exactly one Windows implementation, and it's the persistence flag on your filters.",
        },
        {
          q: "Why can DNS leak on Windows even with a perfect route table?",
          opts: [
            "It can't",
            "The resolver is multi-homed and can query every interface's servers in parallel, taking the fastest answer — names escape via the LAN NIC",
            "IPv6 is enabled",
          ],
          a: 1,
          why: "Name resolution doesn't consult your default route's loyalty. NRPT and port-53 filtering exist because routing alone was never enough.",
        },
      ],
    },
  },
];
