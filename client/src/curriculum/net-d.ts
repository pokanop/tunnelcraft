import type { Module } from "./types";

/* Networking fundamentals — new modules D: toolbelt & troubleshooting, security fundamentals */

export const NET_D: Module[] = [
  {
    id: "n12",
    code: "N16",
    title: "The Toolbelt",
    layers: ["L3", "L4", "L7"],
    est: "~65 min",
    tag: "ping, traceroute, ss, dig, tcpdump, curl, nmap — and a repeatable method that turns 'it's broken' into a layer.",
    lessons: [
      {
        id: "n12l1",
        title: "A method before the tools",
        est: "~10 min",
        blocks: [
          {
            p: "Amateurs run commands; professionals run a **search strategy**. The layered model you learned in N01 is also a debugging framework: every failure lives at *some* layer, and each tool tests a specific one. Two classic strategies: **bottom-up** (link up? IP assigned? gateway reachable? DNS resolving? service answering?) when nothing works, and **divide-and-conquer** — start at L3 with a ping and let the result cut the search space in half — when something works partially.",
          },
          {
            diagram: {
              kind: "flow",
              title: "the bottom-up sweep",
              nodes: [
                { label: "Link up?", sub: "L2 · carrier/Wi-Fi", tone: "l2" },
                { label: "IP + gateway?", sub: "L3 · addr, ping gw", tone: "l3" },
                { label: "Internet?", sub: "L3 · ping 1.1.1.1", tone: "l3" },
                { label: "Name resolves?", sub: "L7 · dig", tone: "l7" },
                { label: "Service answers?", sub: "L4/L7 · curl -v", tone: "l4" },
              ],
              arrows: ["ok", "ok", "ok", "ok"],
              caption:
                "Each check tests exactly one layer — the first failure names your suspect; every tool after that just confirms it.",
            },
          },
          {
            ul: [
              "Ping by **IP** works but by **name** fails → the network is fine; it's DNS. Half your career's tickets end here.",
              "Ping works but the **port** times out → L3 is fine; a firewall or dead service at L4+.",
              "'Connection refused' vs silent timeout → refused means a host *answered* with RST (N09); timeout means something *ate* the packet. Different suspects entirely.",
              "Works from one vantage point, not another → the path is the variable; compare traceroutes.",
            ],
          },
          {
            p: "Write your conclusion in layer terms — 'L3 reachability confirmed, name resolution failing at the stub' — and you'll not only fix things faster, you'll hand colleagues a reproducible trail instead of vibes.",
          },
        ],
      },
      {
        id: "n12l2",
        title: "Reachability: ping, traceroute, mtr",
        est: "~10 min",
        blocks: [
          {
            p: "You know the mechanisms (N05); now the *interpretation craft*. Ping's numbers: loss %, RTT min/avg/max, and — read it — **stddev**: high jitter with a fine average means queueing somewhere (bufferbloat's fingerprint, N09). Run pings in parallel to the gateway, an internet IP (1.1.1.1), and a name: three answers that instantly bracket which segment and which layer.",
          },
          {
            p: "Traceroute's honest caveats: `* * *` at a hop means *that router won't generate ICMP for you* — if later hops answer, the path is fine and the silent hop is cosmetic. High latency **at one hop only** is a router deprioritizing ICMP generation (control plane), not slowing your traffic (data plane); real problems show latency that **persists from a hop onward**. And return paths can differ from forward paths (N10's policy routing), so a clean outbound trace doesn't acquit the round trip.",
          },
          {
            p: "**mtr** merges both tools: continuous traceroute with per-hop loss/jitter statistics — the difference between a snapshot and a story. Loss that *starts* at hop 7 and continues to the end is real loss at hop 7; loss shown *only* at hop 7 is that router rate-limiting ICMP. That one distinction ends most 'my ISP is dropping packets!!' misdiagnoses.",
          },
        ],
      },
      {
        id: "n12l3",
        title: "Sockets and captures: ss and tcpdump",
        est: "~12 min",
        blocks: [
          {
            p: "**ss** answers 'what is this machine doing right now': `ss -tlnp` — TCP listeners with owning processes (the first question of 'why won't it connect': is anything even listening, and on which address? A service bound to 127.0.0.1 is invisible to the network — an all-time classic). `ss -tnp state established` — live conversations; and the state pathologies from N09 (CLOSE_WAIT pile-ups, SYN_RECV floods) are read directly off this output.",
          },
          {
            p: "**tcpdump** is ground truth: what is *actually on the wire*, past every log and assumption. Working grammar: `-i` interface, `-n` no name lookups (always), `-w file.pcap` to capture for Wireshark. Filters do the aiming: `host 10.0.0.5`, `port 443`, `udp port 51820`, combined with and/or/not. Capture discipline: **vantage point is everything** — capturing on both ends of a mystery answers 'did it leave?' and 'did it arrive?' separately, which is usually the whole diagnosis.",
          },
          {
            code: {
              lang: "sh",
              title: "the capture patterns you'll reuse forever",
              body: "# is my WireGuard traffic actually leaving?\nsudo tcpdump -ni eth0 udp port 51820\n\n# DNS: watch the questions AND who answers them\nsudo tcpdump -ni any port 53\n\n# capture a mystery for Wireshark, ring-buffered so it can run for hours\nsudo tcpdump -ni eth0 -w cap.pcap -C 100 -W 5 host 10.0.0.5\n\n# the negative-space assertion (S01's kill-switch test):\n# during failover this must print NOTHING\nsudo tcpdump -ni eth0 not udp port 51820",
            },
          },
          {
            p: "In Wireshark, three moves cover most work: a display filter (`tcp.analysis.retransmission` finds pain instantly), **Follow → Stream** to read one conversation, and **Statistics → Conversations** to see who's talking to whom. It dissects WireGuard, TLS, QUIC, and DNS natively — the protocol lessons of this whole track, drawn as pictures.",
          },
        ],
      },
      {
        id: "n12l4",
        title: "dig, curl, nmap: the application-layer bench",
        est: "~12 min",
        blocks: [
          {
            p: "**dig** you met in N12; the triage move worth repeating: query your configured resolver, then `@1.1.1.1`, then the domain's authoritative server directly. Same answer everywhere = the record is what it is. Different answers = a cache, a split-DNS view (N12), or a hijack — and *which pair differs* tells you which.",
          },
          {
            p: "**curl -v** is a protocol microscope disguised as a download tool: the verbose trace shows name resolution, TCP/QUIC connect, the TLS handshake with certificate details (N13 live on your terminal), then raw request/response headers. `curl -v` failing at *exactly which phase* is a layer diagnosis in itself. Flags that earn their keep: `--resolve` (test a server before DNS cutover), `-k` (inspect past a bad cert — diagnostic only), `-x` (through a proxy), `-4`/`-6` (pin the address family — N05's dual-stack splitter).",
          },
          {
            p: "**nmap** asks the question from outside: what does this host expose? `nmap -sS host` SYN-scans common ports; `-sV` fingerprints services; `-p-` sweeps all 65,535. Read results in N09 states: **open** (SYN-ACK came back), **closed** (RST came back — host alive, nothing listening), **filtered** (silence — a firewall dropped it). Scan only what you're authorized to touch — unsolicited scanning ranges from rude to illegal — but scanning *your own* perimeter after every change is basic hygiene: it's how you find the debug port you forgot was world-reachable. And the T02 punchline holds: a WireGuard endpoint shows *nothing* to any scan — silence by design.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "n12e1",
        type: "match",
        title: "Symptom → next command",
        kind: "MATCH LAB",
        prompt: "For each finding, pick the move a professional makes next.",
        pairs: [
          {
            t: "Ping 1.1.1.1 fine; ping example.com fails",
            d: "dig — it's a name-resolution problem, stop testing the network",
          },
          {
            t: "Service 'unreachable' — but is anything listening?",
            d: "ss -tlnp — check listeners and their bind addresses first",
          },
          {
            t: "mtr shows loss only at hop 7, none afterward",
            d: "Nothing — that's ICMP rate-limiting at one router, not path loss",
          },
          {
            t: "Two ends disagree about whether packets were sent",
            d: "tcpdump on both sides — let the wire arbitrate",
          },
          {
            t: "TLS 'sometimes fails' to one API",
            d: "curl -v — watch which handshake phase dies, cert details included",
          },
        ],
        why: "Tool selection is the skill. Each symptom already names its layer; the command merely confirms it.",
      },
      {
        id: "n12e2",
        type: "ports",
        title: "Port reflexes — infinite drill",
        kind: "LIVE DRILL",
        prompt:
          "Reading ss, tcpdump, nmap, and firewall rules at speed requires port-number reflexes. Name the port for each service. New rounds forever.",
      },
    ],
    quiz: {
      id: "n12q",
      questions: [
        {
          q: "A connect attempt returns 'Connection refused' instantly. What do you now know?",
          opts: [
            "A firewall blocked it",
            "The host is up and reachable — it answered with RST; nothing listens on that port",
            "DNS failed",
          ],
          a: 1,
          why: "Refused is an *answer*. Firewalls produce silence and timeouts; RST means you reached a live stack. N09's fork, now a diagnostic.",
        },
        {
          q: "Traceroute shows 200 ms at hop 4, then 20 ms at hops 5–10. Verdict?",
          opts: [
            "Hop 4 is congested and slowing traffic",
            "Hop 4's router deprioritizes generating ICMP — forwarding is fine, as the faster later hops prove",
            "The trace is corrupted",
          ],
          a: 1,
          why: "Later hops' RTTs pass *through* hop 4. If it were truly slow, everything after would inherit the delay. Control plane ≠ data plane.",
        },
        {
          q: "A web service works locally on its host but times out from the network. ss shows it LISTENing. Prime suspect?",
          opts: [
            "DNS misconfiguration",
            "Bound to 127.0.0.1 instead of 0.0.0.0 — or a host firewall dropping the port; ss's Local Address column decides which",
            "MTU too low",
          ],
          a: 1,
          why: "The two classics, distinguished by one column. Loopback-bound services are unreachable by design; check the bind address before blaming the firewall.",
        },
        {
          q: "Why capture traffic at both endpoints of a failing connection?",
          opts: [
            "Twice the data is better",
            "To separate 'never sent' from 'sent but never arrived' — each capture answers a different half",
            "tcpdump requires it",
          ],
          a: 1,
          why: "One capture shows intent; two show the truth about the path between. Most finger-pointing between teams dies at this step.",
        },
      ],
    },
  },
  {
    id: "n13",
    code: "N17",
    title: "Security Fundamentals",
    layers: ["L2", "L3", "L4", "L7"],
    est: "~65 min",
    tag: "Attacks on the wire, firewalls done right, segmentation and detection, DDoS — and why zero trust won.",
    lessons: [
      {
        id: "n13l1",
        title: "Attacks on the wire",
        est: "~10 min",
        blocks: [
          {
            p: "You've already met the primitives; now see them as an attacker's toolkit. **Spoofing** — lying about a source address: trivial for single UDP packets (the source field is just bytes, N05), which enables reflection attacks; hard for TCP conversations (you'd have to guess sequence numbers blind — N09's accidental security contribution). **On-path (MITM)** positions: ARP spoofing owns a LAN segment (N02), DNS poisoning owns name resolution (N12), a rogue 'evil twin' access point owns everyone who joins it.",
          },
          {
            p: "The strategic insight that organizes all defense: attackers aim at **trust boundaries that were never verified**. ARP trusts any reply; classic DNS trusts any fast answer; the LAN trusted whoever plugged in. Every mature defense you'll meet is one of those implicit trusts being made explicit — authenticated, encrypted, or removed.",
          },
          {
            p: "And the recurring punchline of this course, stated as doctrine: **end-to-end encryption makes position worthless**. An attacker who fully owns the café Wi-Fi, the ARP table, and the upstream router sees only AEAD ciphertext and metadata from a WireGuard or TLS 1.3 session. Defense-in-depth still matters (metadata leaks; availability attacks remain), but E2E crypto is the load-bearing wall — which is why this course taught it before teaching this module.",
          },
        ],
      },
      {
        id: "n13l2",
        title: "Firewalls, honestly",
        est: "~12 min",
        blocks: [
          {
            p: "A **stateless** filter judges each packet alone against ACLs — fast, dumb, and awkward at 'allow replies to my outbound traffic.' A **stateful** firewall tracks connections in exactly the conntrack table you met in N08/N11: an outbound SYN creates an entry; inbound packets are admitted *only if they match known state*. That single idea — replies to what I started, nothing unsolicited — is 90% of what a firewall does for you, and NAT's accidental version of it is why people mistake NAT for security. Say it precisely: **NAT is not a security feature**; the stateful filtering that usually accompanies it is.",
          },
          {
            diagram: {
              kind: "seq",
              title: "stateful filtering: replies only",
              actors: [
                { id: "h", label: "Host", tone: "l7" },
                { id: "fw", label: "Firewall", sub: "conntrack", tone: "acc" },
                { id: "net", label: "Internet", tone: "dim" },
              ],
              steps: [
                { note: "outbound creates state" },
                { from: "h", to: "fw", label: "SYN out", tone: "l4" },
                {
                  from: "fw",
                  to: "net",
                  label: "forwarded",
                  sub: "entry: h:5061 ↔ srv:443",
                  tone: "l4",
                },
                { note: "replies match the entry" },
                { from: "net", to: "fw", label: "SYN-ACK", tone: "ok" },
                { from: "fw", to: "h", label: "admitted", sub: "matches known state", tone: "ok" },
                { note: "unsolicited gets silence", tone: "bad" },
                {
                  from: "net",
                  to: "fw",
                  label: "stray SYN",
                  sub: "no entry → DROP",
                  tone: "bad",
                  dashed: true,
                },
              ],
              caption:
                "Replies to what I started, nothing unsolicited — the stateful filter people mistakenly credit to NAT.",
            },
          },
          {
            p: "Policy doctrine: **default deny**. Enumerate what's allowed; drop the rest — because you can list your legitimate services, but never every attack. The dual decision is **DROP vs REJECT**: drop is silence (a scanner sees 'filtered' and wastes time on timeouts), reject is an RST/ICMP refusal (faster for legitimate users to fail, more informative to attackers). Perimeter convention: drop toward the outside, reject toward the inside.",
          },
          {
            p: "**Host firewalls** (nftables, Windows Filtering Platform, pf) complement network ones — and you already know their highest-stakes application: the **fail-closed kill switch** (S01), where kernel-resident rules outlive your crashed process. Egress filtering is the perpetually-skipped half of firewalling: limiting what can *leave* catches malware phoning home, and is literally the mechanism of leak-proofing a VPN host.",
          },
        ],
      },
      {
        id: "n13l3",
        title: "Segmentation & detection",
        est: "~10 min",
        blocks: [
          {
            p: "**Segmentation** is blast-radius engineering: compromise of one thing shouldn't be compromise of everything. The classic tiers — a **DMZ** for internet-facing services (double-filtered so a hacked web server still can't reach the LAN), VLANs per trust class (N02: guests, IoT, workstations, servers), and filtering *between* segments — exist because the attacker's second move is always **lateral movement**. The flat network where a smart lightbulb can reach the finance share is the pattern every breach post-mortem features.",
          },
          {
            p: "**Detection** assumes prevention eventually fails. An **IDS** watches traffic and alerts on signatures or anomalies (Suricata, Zeek); an **IPS** sits inline and blocks — with the inline trade: false positives now cause outages. Encryption complicates payload inspection (that's partly the point), pushing modern detection toward **metadata and flow analysis**: NetFlow/IPFIX records of who-talked-to-whom-how-much. A workstation suddenly moving gigabytes to a residential IP at 3 a.m. is visible in flows regardless of encryption — and flow telemetry is exactly what your client's own observability (S03) contributes to defenders.",
          },
          {
            p: "Logging discipline completes it: logs and flows are only useful if shipped *off-host* (attackers delete local evidence first) with synchronized clocks (correlation is timestamps). Detection without retained, centralized telemetry is a smoke alarm with no battery.",
          },
        ],
      },
      {
        id: "n13l4",
        title: "DDoS & the zero-trust conclusion",
        est: "~12 min",
        blocks: [
          {
            p: "**DDoS** attacks availability — the one property encryption can't defend. Three flavors: **volumetric** (drown the pipe, amplified by spoofed-source reflection off open UDP services — a 1× query returning a 50× answer to the victim you impersonated); **protocol/state** (exhaust tables, not bandwidth: SYN floods filling half-open queues — N09's SYN_RECV pile-up as a weapon, answered by SYN cookies: statelessness under pressure, exactly like T02's cookie mechanism); and **application-layer** (expensive requests that look legitimate). Defense at scale is mostly **anycast + scrubbing**: spread the flood across thirty sites (N10), filter, pass the remainder. You rent this; you don't build it.",
          },
          {
            p: "Now the synthesis this track has been building toward. The perimeter model — hard shell, soft inside, 'inside = trusted' — fails against phishing, laptops that commute, cloud workloads, and lateral movement. **Zero trust** (NIST SP 800-207, the framework behind S02's posture work) replaces location with verification: authenticate the *user and device* for every access, authorize per-request against identity and device **posture**, encrypt everywhere, and **continuously re-evaluate** — trust decays, and posture changes revoke live access.",
          },
          {
            note: "Notice what a zero-trust access client actually is: per-flow policy (S02's Flow dispatch), identity-keyed crypto (T02/T03), device posture as a live signal (S02's PostureProvider), fail-closed enforcement (S01), and flow telemetry (S03). The VPN client you're building *is* the zero-trust architecture's enforcement point. The fundamentals track and the engineering tracks were the same course all along.",
            label: "the whole map",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "n13e1",
        type: "match",
        title: "Attack → the defense that answers its mechanism",
        kind: "MATCH LAB",
        prompt:
          "Match each attack to the control that addresses its mechanism, not just its symptoms.",
        pairs: [
          {
            t: "ARP spoofing on shared Wi-Fi",
            d: "End-to-end encryption — make owning L2 worthless (plus switch-level ARP inspection)",
          },
          {
            t: "SYN flood filling the half-open queue",
            d: "SYN cookies — answer statelessly, spend memory only on completed handshakes",
          },
          {
            t: "UDP reflection/amplification flood",
            d: "Anycast + scrubbing capacity; upstream, providers filtering spoofed sources",
          },
          {
            t: "Compromised IoT device probing the file server",
            d: "Segmentation — VLANs and inter-segment filtering to kill lateral movement",
          },
          {
            t: "Stolen laptop with a valid VPN key",
            d: "Zero-trust posture checks — device state re-evaluated continuously, not just identity at connect time",
          },
        ],
        why: "Each defense targets a *mechanism*: statelessness against state exhaustion, capacity against volume, segmentation against movement, continuous verification against stolen credentials.",
      },
    ],
    quiz: {
      id: "n13q",
      questions: [
        {
          q: "\"We're safe from inbound attacks — we're behind NAT.\" The precise correction?",
          opts: [
            "Correct as stated",
            "The protection is the stateful only-replies-admitted filtering that accompanies NAT — NAT itself is address translation, not a security control",
            "NAT encrypts inbound traffic",
          ],
          a: 1,
          why: "The distinction matters the day someone deploys IPv6 (no NAT) and assumes safety evaporated — it didn't, if the stateful filter is still there.",
        },
        {
          q: "Why did SYN cookies defeat SYN floods?",
          opts: [
            "They block the attacker's IP",
            "The server stops storing state for half-open connections — the 'cookie' encodes it in the sequence number, so only completed handshakes cost memory",
            "They rate-limit all SYNs",
          ],
          a: 1,
          why: "State-exhaustion attacks die when you stop holding state for strangers. The same statelessness-under-pressure move as WireGuard's cookies.",
        },
        {
          q: "Traffic is increasingly encrypted. How does network detection stay useful?",
          opts: [
            "It can't — encryption ends detection",
            "Metadata and flow analysis: who talks to whom, when, how much — anomalies show in NetFlow regardless of payload encryption",
            "Decrypt everything at the perimeter",
          ],
          a: 1,
          why: "The 3 a.m. gigabytes-to-a-residential-IP pattern needs no plaintext. Flows are the encrypted era's detection substrate.",
        },
        {
          q: "The core inversion zero trust makes versus the perimeter model?",
          opts: [
            "Stronger perimeter firewalls",
            "Network location stops implying trust — every access is verified against identity and device posture, continuously",
            "Blocking all remote work",
          ],
          a: 1,
          why: "'Inside' stopped being a meaningful security category. Verification moved from the edge to every request — and your VPN client became the enforcement point.",
        },
      ],
    },
  },
];
