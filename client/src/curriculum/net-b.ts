import type { Module } from "./types";

/* Networking fundamentals — new modules B: TCP deep dive, routing the internet */

export const NET_B: Module[] = [
  {
    id: "n07",
    code: "N09",
    title: "TCP Deep Dive",
    layers: ["L4"],
    est: "~70 min",
    tag: "The state machine, the reliability machinery, and the two windows that decide how fast anything downloads.",
    lessons: [
      {
        id: "n07l1",
        title: "The state machine, honestly",
        est: "~10 min",
        blocks: [
          {
            p: "N08 gave you the handshake as a gesture; professionals read it as **states**, because states are what `ss` shows you at 3 a.m. Opening: client sends SYN (`SYN_SENT`), server was `LISTEN` and answers SYN+ACK (`SYN_RECV`), client ACKs — both sides `ESTABLISHED`. Sequence numbers are exchanged and synchronized in these three packets; everything after is 'bytes numbered from those starting points.'",
          },
          {
            p: "Closing is the underrated half. Each direction closes independently: FIN → ACK, FIN → ACK (four packets, sometimes the middle two coalesce). The side that closes *first* lands in **TIME_WAIT** and lingers there ~60 s, on purpose: it absorbs stray retransmitted packets from the old connection so they can't corrupt a new connection reusing the same port pair. Thousands of TIME_WAIT sockets on a busy server are *normal*, not a leak — a fact that has saved many an on-call engineer from 'fixing' the wrong thing.",
          },
          {
            diagram: {
              kind: "state",
              title: "TCP connection lifecycle",
              caption:
                "Left ladder: active open and close — the first closer inherits TIME_WAIT, a ~60 s quarantine against stray old packets. Right ladder: the passive side; a CLOSE_WAIT that never leaves means your app forgot to close().",
              states: [
                { id: "synsent", label: "SYN_SENT", x: 0, y: 0, tone: "l4" },
                { id: "closed", label: "CLOSED", x: 1, y: 0, tone: "dim" },
                { id: "listen", label: "LISTEN", x: 2, y: 0 },
                { id: "synrecv", label: "SYN_RECV", x: 3, y: 0, tone: "l4" },
                { id: "estab", label: "ESTABLISHED", x: 1, y: 1, tone: "ok" },
                { id: "finwait", label: "FIN_WAIT", x: 0, y: 2, tone: "acc" },
                { id: "timewait", label: "TIME_WAIT", x: 1, y: 2, tone: "acc" },
                { id: "closewait", label: "CLOSE_WAIT", x: 2, y: 2 },
                { id: "lastack", label: "LAST_ACK", x: 3, y: 2 },
              ],
              edges: [
                { from: "closed", to: "synsent", label: "connect / SYN", tone: "l4" },
                { from: "closed", to: "listen", label: "listen()" },
                { from: "listen", to: "synrecv", label: "SYN / SYN+ACK", tone: "l4" },
                { from: "synsent", to: "estab", label: "SYN+ACK / ACK", tone: "ok" },
                { from: "synrecv", to: "estab", label: "ACK", tone: "ok" },
                { from: "estab", to: "finwait", label: "close / FIN", tone: "acc" },
                { from: "finwait", to: "timewait", label: "recv FIN / ACK", tone: "acc" },
                { from: "estab", to: "closewait", label: "recv FIN / ACK" },
                { from: "closewait", to: "lastack", label: "close / FIN" },
                { from: "lastack", to: "closed", label: "recv ACK", bend: -30 },
                {
                  from: "timewait",
                  to: "closed",
                  label: "~60 s",
                  tone: "acc",
                  dashed: true,
                  bend: 130,
                },
              ],
            },
          },
          {
            p: "**RST** is the rude exit: no handshake, just 'this conversation does not exist.' You receive RST when connecting to a closed port (that's how `Connection refused` happens), when a peer crashes and reboots mid-connection, or when a middlebox decides to censor you. RST-on-connect vs *silence*-on-connect is a diagnostic fork: refused means a host said no; timeout means a firewall ate the packet (N16 makes this a method).",
          },
        ],
      },
      {
        id: "n07l2",
        title: "Reliability machinery",
        est: "~10 min",
        blocks: [
          {
            p: "TCP's promise — in-order, complete, exactly-once byte delivery over a network that guarantees none of that — rests on **sequence numbers** (every byte is numbered) and **cumulative ACKs** ('I have everything up to byte N'). The sender keeps unACKed data buffered and sets a **retransmission timer** (RTO) computed from a smoothed RTT estimate; timer fires, data goes again.",
          },
          {
            p: "Waiting a full RTO is slow, so TCP has a faster tell: **duplicate ACKs**. If segment 5 is lost but 6, 7, 8 arrive, the receiver keeps ACKing 'up to 4' — three duplicate ACKs and the sender performs **fast retransmit** without waiting for the timer. **SACK** (selective ACK) sharpens it further: 'I have up to 4, *and also* 6–8,' so only the true hole is resent.",
          },
          {
            p: "This machinery is exactly what you're opting out of when you build on UDP (N08's choice), and exactly what doubles up disastrously in the TCP-over-TCP meltdown: the *inner* TCP's retransmissions ride an *outer* TCP that is itself retransmitting — two RTO estimators fighting over one loss event. When your tunnel carries TCP inside UDP, the inner TCP's machinery works alone, exactly as designed. That asymmetry is the entire performance argument for UDP-based tunnels.",
          },
        ],
      },
      {
        id: "n07l3",
        title: "Flow control: the receiver's window",
        est: "~10 min",
        blocks: [
          {
            p: "Every ACK carries the **receive window (rwnd)**: 'I have this much buffer left — send no more than this beyond what you've ACKed.' It's per-connection backpressure protecting a slow *receiver* from a fast sender. Window hits zero → sender stops entirely and probes occasionally until space opens. (Sound familiar? It's the same law as R03's bounded channels: unbounded buffering isn't kindness, it's deferred failure.)",
          },
          {
            p: "The window meets physics in the **bandwidth-delay product**: a path can hold `bandwidth × RTT` bytes 'in flight.' A 100 Mbps path at 80 ms RTT holds 1 MB — if the window is smaller than that, the sender idles every round trip waiting for ACKs, and throughput caps at `window / RTT` *no matter the bandwidth*. This is why long-fat links (transatlantic, satellite) feel slow even when empty, and why the original 64 KB window field needed the **window scaling** extension (negotiated in the SYN packets — one more reason middleboxes that strip TCP options ruin everything).",
          },
          {
            note: "throughput ≤ window / RTT is a formula worth memorizing: it converts 'the download is slow' into arithmetic. 64 KB window at 80 ms RTT = 6.5 Mbps ceiling. On a gigabit link.",
            label: "the ceiling formula",
          },
        ],
      },
      {
        id: "n07l4",
        title: "Congestion control: the network's window",
        est: "~12 min",
        blocks: [
          {
            p: "rwnd protects the receiver; the **congestion window (cwnd)** protects the *network* — the sender's own estimate of how much the path can absorb. Effective limit = min(rwnd, cwnd). Classic behavior: **slow start** (begin ~tiny, double every RTT — exponential, despite the name) until loss or threshold, then **congestion avoidance** (grow linearly, and on loss, cut multiplicatively — AIMD). The result is TCP's sawtooth: probe up, back off, probe up.",
          },
          {
            diagram: {
              kind: "state",
              title: "The congestion control loop",
              caption:
                "Slow start doubles cwnd every RTT; avoidance adds ~1 MSS per RTT; loss cuts multiplicatively — that alternation is the sawtooth. An RTO timeout is drastic enough to start over from scratch.",
              states: [
                { id: "ss", label: "Slow start", x: 0, y: 0, tone: "acc" },
                { id: "ca", label: "Congestion avoidance", x: 2, y: 0, tone: "ok" },
                { id: "fr", label: "Fast recovery", x: 1, y: 1, tone: "acc2" },
              ],
              edges: [
                { from: "ss", to: "ca", label: "cwnd ≥ ssthresh" },
                {
                  from: "ca",
                  to: "ss",
                  label: "RTO timeout",
                  tone: "bad",
                  dashed: true,
                  bend: -34,
                },
                { from: "ss", to: "fr", label: "3 dup ACKs", tone: "bad" },
                { from: "ca", to: "fr", label: "3 dup ACKs", tone: "bad", bend: 28 },
                { from: "fr", to: "ca", label: "cwnd halved", tone: "ok", bend: 28 },
              ],
            },
          },
          {
            p: "Loss-based control (Reno lineage; Linux's default **CUBIC** is a refined descendant) reads packet loss as the congestion signal. Its failure mode is **bufferbloat**: oversized router buffers delay the loss signal, so senders keep pushing, queues grow, and latency balloons to seconds while throughput looks 'fine' — the reason video calls die when someone uploads a file. **BBR** (Google) changes the philosophy: model the path's actual bottleneck bandwidth and minimum RTT, pace packets to *that*, don't wait for loss. Different senders on one bottleneck are effectively negotiating without speaking.",
          },
          {
            p: "Tunnel-engineering corollaries: your encrypted UDP stream carries flows still governed by *their own* end-to-end congestion control, so the tunnel shouldn't add its own (once more: don't stack control loops). And a lossy VPN path punishes loss-based flows brutally — 1% loss can halve CUBIC throughput while barely denting BBR — which is why 'VPN is slow' tickets often decode to 'the underlay drops packets and CUBIC is doing exactly what it was designed to do.'",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "n07e1",
        type: "order",
        title: "One byte's guarantee",
        kind: "SEQUENCE LAB",
        prompt:
          "Segment 5 of a transfer is lost in transit. Order how TCP recovers — the fast path, no timeout.",
        items: [
          "Segments 6, 7, 8 arrive; receiver keeps ACKing 'everything up to segment 4'",
          "Sender counts three duplicate ACKs for the same point",
          "Fast retransmit: segment 5 is resent immediately, no RTO wait",
          "Receiver fills the hole and ACKs the full range cumulatively",
          "Congestion window is cut — loss was still a congestion signal",
        ],
        why: "Duplicate ACKs are the receiver saying 'something is missing' three times fast. Note the last step: recovery and congestion response are inseparable in TCP.",
      },
      {
        id: "n07e2",
        type: "match",
        title: "Socket states as symptoms",
        kind: "MATCH LAB",
        prompt: "You run ss on a misbehaving box. Match each observation to its meaning.",
        pairs: [
          {
            t: "Thousands in TIME_WAIT",
            d: "Normal on a busy server — the closer's mandatory quarantine, not a leak",
          },
          {
            t: "Connect returns 'refused' instantly",
            d: "Host reachable, port closed — an RST came back",
          },
          {
            t: "Connect hangs, then times out",
            d: "A firewall is silently dropping packets — nothing answered at all",
          },
          {
            t: "Pile-up in SYN_RECV",
            d: "Half-open connections — likely a SYN flood or a broken path back to clients",
          },
          {
            t: "Stuck in CLOSE_WAIT for hours",
            d: "The peer closed; your application never called close() — an app bug, not a network one",
          },
        ],
        why: "State names are symptoms. CLOSE_WAIT accumulation in particular points at your own code — the kernel is waiting for the app.",
      },
      {
        id: "n07e_pcap",
        type: "pcap",
        title: "Anatomy of a lossy HTTP fetch",
        kind: "CAPTURE LAB",
        prompt:
          "A client (`10.0.0.5`) fetches a page from a server and one segment dies in transit. Read the capture like Wireshark would — sequence numbers are **relative**, and the info column tells the whole story.",
        why: "Handshake, loss detection via duplicate ACKs, fast retransmit, clean teardown: this one capture contains four exam-grade TCP behaviors. If you can narrate it packet by packet, you understand TCP.",
        packets: [
          {
            no: 1,
            time: "0.000000",
            src: "10.0.0.5",
            dst: "93.184.216.34",
            proto: "TCP",
            info: "52144 → 80 [SYN] Seq=0 Win=64240 Len=0 MSS=1460",
          },
          {
            no: 2,
            time: "0.024311",
            src: "93.184.216.34",
            dst: "10.0.0.5",
            proto: "TCP",
            info: "80 → 52144 [SYN, ACK] Seq=0 Ack=1 Win=65160 Len=0 MSS=1460",
          },
          {
            no: 3,
            time: "0.024389",
            src: "10.0.0.5",
            dst: "93.184.216.34",
            proto: "TCP",
            info: "52144 → 80 [ACK] Seq=1 Ack=1 Win=64240 Len=0",
          },
          {
            no: 4,
            time: "0.024561",
            src: "10.0.0.5",
            dst: "93.184.216.34",
            proto: "HTTP",
            info: "GET /index.html HTTP/1.1 (Seq=1 Ack=1 Len=142)",
          },
          {
            no: 5,
            time: "0.050214",
            src: "93.184.216.34",
            dst: "10.0.0.5",
            proto: "TCP",
            info: "[TCP Previous segment not captured] 80 → 52144 [ACK] Seq=1461 Ack=143 Win=65160 Len=1460",
          },
          {
            no: 6,
            time: "0.050268",
            src: "10.0.0.5",
            dst: "93.184.216.34",
            proto: "TCP",
            info: "[TCP Dup ACK #1] 52144 → 80 [ACK] Seq=143 Ack=1 Win=64240 Len=0",
          },
          {
            no: 7,
            time: "0.050602",
            src: "93.184.216.34",
            dst: "10.0.0.5",
            proto: "TCP",
            info: "80 → 52144 [ACK] Seq=2921 Ack=143 Win=65160 Len=1460",
          },
          {
            no: 8,
            time: "0.050655",
            src: "10.0.0.5",
            dst: "93.184.216.34",
            proto: "TCP",
            info: "[TCP Dup ACK #2] 52144 → 80 [ACK] Seq=143 Ack=1 Win=64240 Len=0",
          },
          {
            no: 9,
            time: "0.050991",
            src: "93.184.216.34",
            dst: "10.0.0.5",
            proto: "TCP",
            info: "80 → 52144 [ACK] Seq=4381 Ack=143 Win=65160 Len=1460",
          },
          {
            no: 10,
            time: "0.051044",
            src: "10.0.0.5",
            dst: "93.184.216.34",
            proto: "TCP",
            info: "[TCP Dup ACK #3] 52144 → 80 [ACK] Seq=143 Ack=1 Win=64240 Len=0",
          },
          {
            no: 11,
            time: "0.075388",
            src: "93.184.216.34",
            dst: "10.0.0.5",
            proto: "TCP",
            info: "[TCP Fast Retransmission] 80 → 52144 [ACK] Seq=1 Ack=143 Win=65160 Len=1460",
          },
          {
            no: 12,
            time: "0.101210",
            src: "10.0.0.5",
            dst: "93.184.216.34",
            proto: "TCP",
            info: "52144 → 80 [FIN, ACK] Seq=143 Ack=5841 Win=63000 Len=0",
          },
          {
            no: 13,
            time: "0.126500",
            src: "93.184.216.34",
            dst: "10.0.0.5",
            proto: "TCP",
            info: "80 → 52144 [FIN, ACK] Seq=5841 Ack=144 Win=65160 Len=0",
          },
          {
            no: 14,
            time: "0.126553",
            src: "10.0.0.5",
            dst: "93.184.216.34",
            proto: "TCP",
            info: "52144 → 80 [ACK] Seq=144 Ack=5842 Win=64240 Len=0",
          },
        ],
        questions: [
          {
            q: "Which packet completes the three-way handshake?",
            opts: [
              "Packet 2 — the SYN-ACK",
              "Packet 3 — the client's ACK of the SYN-ACK; the connection is ESTABLISHED after it",
              "Packet 4 — the first data packet",
            ],
            a: 1,
            why: "SYN, SYN-ACK, ACK. Packet 3 is the third leg — note the client can send its GET a mere 172 µs later without waiting for anything else.",
          },
          {
            q: "Packets 6, 8, and 10 all repeat Ack=1. What is the client saying?",
            opts: [
              "It's updating its receive window",
              "'I'm still missing the server's data starting at (relative) Seq=1' — each out-of-order arrival re-triggers the same ACK",
              "It's sending keepalives while the server thinks",
            ],
            a: 1,
            why: "The first response segment (Seq=1, note packet 5's 'previous segment not captured') was lost. Every later segment that lands makes the receiver re-ACK the last in-order byte — a duplicate ACK is a hole report.",
          },
          {
            q: "Which packet is the retransmission, and why did it happen when it did?",
            opts: [
              "Packet 11 — three duplicate ACKs told the server Seq=1 never arrived, so fast retransmit resent it without waiting for the RTO",
              "Packet 11 — the server's retransmission timer expired",
              "Packet 5 — it repeats the SYN-ACK",
            ],
            a: 0,
            why: "Three dup ACKs (packets 6, 8, 10) is the fast-retransmit trigger. Compare timescales: recovery took ~25 ms (about one RTT) instead of an RTO measured in hundreds of ms — that's the entire point of the mechanism.",
          },
          {
            q: "What MSS was negotiated for this connection?",
            opts: [
              "64240 bytes",
              "1460 bytes — both SYNs advertised MSS=1460, and every data segment carries Len=1460",
              "65160 bytes",
            ],
            a: 1,
            why: "MSS rides in the SYN options (packets 1 and 2); the connection uses the minimum of the two offers. Win=64240/65160 is the receive window — a different lever entirely.",
          },
          {
            q: "Who initiated the connection close?",
            opts: [
              "The server — packet 13 carries its FIN",
              "The client — packet 12 carries the first FIN (and will therefore serve the TIME_WAIT sentence)",
              "Nobody — the connection was reset",
            ],
            a: 1,
            why: "First FIN wins the close and inherits TIME_WAIT. Packet 12 also quietly ACKs the retransmitted data (Ack=5841 = all 5,840 bytes received) — FIN and ACK share a packet all the time.",
          },
        ],
      },
    ],
    quiz: {
      id: "n07q",
      questions: [
        {
          q: "A transfer between continents crawls at ~6 Mbps on gigabit links with no loss. First suspect?",
          opts: [
            "Encryption overhead",
            "Window too small for the bandwidth-delay product — throughput is capped at window/RTT",
            "DNS latency",
          ],
          a: 1,
          why: "64 KB / 80 ms ≈ 6.5 Mbps: the ceiling formula in the wild. Check window scaling before blaming anything exotic.",
        },
        {
          q: "Why does the first closer sit in TIME_WAIT for a minute?",
          opts: [
            "To let the app finish reading",
            "To absorb stray old-connection packets so they can't corrupt a new connection on the same port pair",
            "Kernel garbage collection",
          ],
          a: 1,
          why: "It's a quarantine against time-traveling duplicates. Deliberate, protective, and endlessly mistaken for a bug.",
        },
        {
          q: "During a big upload, the whole household's latency jumps to 2+ seconds. The mechanism?",
          opts: [
            "ISP throttling",
            "Bufferbloat: oversized queues delay the loss signal, so loss-based TCP keeps the buffer full and everything queues behind it",
            "WiFi interference",
          ],
          a: 1,
          why: "Throughput looks great, latency is destroyed — the bufferbloat signature. BBR and smart-queue routers exist because of exactly this.",
        },
        {
          q: "cwnd vs rwnd — the real distinction?",
          opts: [
            "Two names for one value",
            "rwnd protects the receiver's buffer; cwnd is the sender's estimate protecting the network path — the effective limit is the minimum of both",
            "cwnd applies only to UDP",
          ],
          a: 1,
          why: "Two independent brakes on one pedal. Either one alone can be your bottleneck.",
        },
      ],
    },
  },
  {
    id: "n08",
    code: "N10",
    title: "Routing the Internet",
    layers: ["L3"],
    est: "~65 min",
    tag: "From 'which route wins' to OSPF, BGP, and how ~80,000 networks agree on a map with no one in charge.",
    lessons: [
      {
        id: "n08l1",
        title: "How a router chooses",
        est: "~10 min",
        blocks: [
          {
            p: "One router can hear about the same destination from many sources: a connected interface, a static route an admin typed, OSPF, BGP. Selection is a two-stage tiebreak. Stage one you know cold from N01: **longest prefix wins** — /24 beats /16 beats /0, always, first. Stage two breaks ties *between sources* for the same exact prefix: **administrative distance** — a trust ranking. Connected (0) beats static (1) beats OSPF (~110) beats plain BGP-learned routes; lower wins.",
          },
          {
            p: "Within one protocol, its own **metric** breaks the remaining tie: OSPF sums link costs (bandwidth-derived), BGP runs a policy gauntlet you'll meet in lesson 3. So the full mental model: *most specific prefix → most trusted source → best metric*. Every routing conversation you'll ever have compiles down to those three tiebreaks.",
          },
          {
            diagram: {
              kind: "flow",
              title: "How a route wins",
              caption:
                "Three tiebreaks in unbreakable order: most specific prefix, then most trusted source, then the protocol's own metric. A /25 from lowly OSPF still beats a /24 from anything.",
              nodes: [
                { label: "Longest prefix", sub: "/24 beats /16 beats /0", tone: "l3" },
                { label: "Admin distance", sub: "connected 0 · static 1 · OSPF ~110", tone: "acc" },
                { label: "Protocol metric", sub: "OSPF cost · BGP policy", tone: "acc2" },
                { label: "Forwarding table", tone: "ok" },
              ],
              arrows: ["tie", "tie", "winner"],
            },
          },
          {
            p: "**Static vs dynamic** is an economics question. Statics are perfect where topology is trivial and change is rare — a branch office with one exit needs exactly one static default. Dynamic protocols earn their complexity when there are *redundant paths that must fail over without a human*: their actual product isn't routes, it's **reaction to change**.",
          },
        ],
      },
      {
        id: "n08l2",
        title: "IGPs: mapping your own house",
        est: "~12 min",
        blocks: [
          {
            p: "Interior gateway protocols route *within* one organization, and there are two philosophies. **Distance-vector** (RIP, the ancestor): each router tells neighbors 'destinations I know, and how far' — routing by rumor. Simple, and slow to un-learn failures; the pathology is **count-to-infinity**, two routers politely inflating a dead route's metric at each other. RIP capped 'infinity' at 16 hops as the fix, which tells you everything about its scale.",
          },
          {
            p: "**Link-state** (OSPF, IS-IS) inverts it: every router floods a description of *its own links* to all others, so every router holds the **same complete map** and independently runs Dijkstra's shortest-path over it. Convergence is fast because news of a change floods everywhere at once; the cost is memory/CPU and flooding chatter — which OSPF tames with **areas**: detailed maps within an area, summaries between them (your N07 aggregation skill, institutionalized).",
          },
          {
            p: "Cost on each link defaults to a bandwidth ratio, so 'shortest path' really means 'fastest path' — and *tuning costs is traffic engineering*: raise a link's cost to drain traffic off it before maintenance. The link-state idea is worth keeping even outside routers: 'flood small facts, let every node compute the same answer locally' is how your multi-engine client can pick tunnels too — engine health scores are link costs by another name.",
          },
        ],
      },
      {
        id: "n08l3",
        title: "BGP: policy, not shortest path",
        est: "~12 min",
        blocks: [
          {
            p: "Between organizations, shortest-path is the wrong question — *whose network may my traffic cross?* is the real one. The internet is ~80,000+ **autonomous systems** (each with an AS number: ISPs, clouds, big enterprises), and **BGP** is how they exchange reachability. It's a **path-vector** protocol: each route carries the full **AS_PATH** it traveled ('this prefix, via AS3356 then AS13335'), which kills loops — reject anything already containing your own AS — and provides the raw material for policy.",
          },
          {
            p: "And policy beats distance, by design. Routes are filtered and ranked by **business relationships**: prefer routes from customers (they pay you), then peers (free swap), then providers (you pay). LOCAL_PREF encodes that ranking and is consulted *before* AS_PATH length. The result: internet traffic follows money and contracts, and 'suboptimal' paths are usually someone's revenue decision, not a bug. eBGP speaks between ASes; iBGP redistributes those decisions inside one.",
          },
          {
            diagram: {
              kind: "topo",
              title: "Policy beats path length",
              caption:
                "Both neighbors announce the same prefix. The provider path is shorter, but customer routes earn revenue — LOCAL_PREF is consulted before AS_PATH, so traffic takes the longer, paid-for road.",
              nodes: [
                { id: "you", label: "Your AS", sub: "AS 65001", x: 0, y: 1, tone: "acc" },
                { id: "prov", label: "Provider", sub: "you pay them", x: 1, y: 0, tone: "dim" },
                { id: "cust", label: "Customer", sub: "they pay you", x: 1, y: 2, tone: "ok" },
                { id: "dst", label: "203.0.113.0/24", x: 2, y: 1, shape: "cloud" },
              ],
              links: [
                { from: "you", to: "prov", label: "LOCAL_PREF 80", tone: "dim", dashed: true },
                { from: "prov", to: "dst", label: "2 ASes", tone: "dim", dashed: true },
                { from: "you", to: "cust", label: "LOCAL_PREF 200", tone: "ok" },
                { from: "cust", to: "dst", label: "4 ASes", tone: "ok" },
              ],
            },
          },
          {
            p: "BGP's trust model is its scar tissue: historically, routers believed whatever they were told. A misconfigured AS announcing someone else's prefix — a **route leak or hijack** — has repeatedly vacuumed real traffic into black holes (the YouTube/Pakistan incident is the canonical story). **RPKI** retrofits cryptographic origin validation ('is this AS authorized to announce this prefix?'), and adoption keeps climbing, but path validation remains unsolved — one more reason end-to-end encryption (T02) is the layer you actually rely on.",
          },
          {
            note: "BGP convergence is also why 'the internet is down' sometimes fixes itself in 90 seconds: routes are withdrawn, alternatives propagate AS by AS, the map heals. The global routing table sits at roughly a million IPv4 prefixes — every one an aggregation decision from N07.",
            label: "the living map",
          },
        ],
      },
      {
        id: "n08l4",
        title: "Redundancy patterns you'll actually meet",
        est: "~10 min",
        blocks: [
          {
            p: "**First-hop redundancy**: hosts get exactly one default gateway, so that gateway must be un-killable. VRRP (and Cisco's HSRP) lets two routers share a *virtual* IP+MAC; the standby claims it via gratuitous ARP (N02, paying off) when the active dies. Hosts notice nothing.",
          },
          {
            p: "**ECMP** — equal-cost multipath: multiple same-cost routes, traffic spread across them. Crucial detail: the split hashes the **5-tuple flow, not per-packet**, so one flow sticks to one path (no reordering) — this is *also* why one connection can't exceed a single member link's speed, and it quietly matters to tunnels: your entire encrypted UDP stream is one flow to every ECMP hash on the path, gains and limits included.",
          },
          {
            p: "**Anycast**: announce the *same prefix* from thirty cities via BGP, and routing itself delivers each user to the nearest instance. It's how 8.8.8.8 and root DNS servers are 'everywhere,' and how DDoS scrubbing absorbs floods (N17). Works effortlessly for one-shot UDP like DNS; long-lived flows need care since routing changes can silently swap which instance you're hitting — another reason tunnel protocols identify peers by *key* (T03) rather than by address.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "n08e1",
        type: "match",
        title: "Route selection referee",
        kind: "MATCH LAB",
        prompt:
          "A router hears about 10.20.30.0/24 (or contains it) from five sources. Match each candidate to its fate for a packet to 10.20.30.7.",
        pairs: [
          {
            t: "Connected interface: 10.20.30.0/24",
            d: "Wins — same prefix length, and administrative distance 0 beats every other source",
          },
          {
            t: "Static route: 10.20.30.0/24 via R2",
            d: "Loses on trust — AD 1 is beaten by connected's AD 0 for the identical prefix",
          },
          {
            t: "OSPF: 10.20.30.0/24, lowest cost path",
            d: "Loses on trust — right prefix, but AD ~110 ranks below connected and static",
          },
          {
            t: "BGP: 10.20.0.0/16",
            d: "Loses on specificity — shorter prefix never competes with a matching /24, regardless of source",
          },
          {
            t: "OSPF: 10.20.30.0/25 covering .0–.127",
            d: "Would win for .7 if present — longest prefix is evaluated before any trust comparison",
          },
        ],
        why: "Specificity first, trust second, metric last. The /25 sleeper option is the exam-and-real-life trap: prefix length precedes everything.",
      },
    ],
    quiz: {
      id: "n08q",
      questions: [
        {
          q: "Why does BGP carry the full AS path with every route?",
          opts: [
            "For debugging only",
            "Loop prevention (reject paths containing your own AS) and raw material for policy decisions",
            "To compute geographic distance",
          ],
          a: 1,
          why: "Path-vector in one line: the route's history is both its loop check and its policy handle.",
        },
        {
          q: "An ISP prefers a longer path through a customer over a shorter path through a provider. Why?",
          opts: [
            "Misconfiguration",
            "Policy outranks path length — customer routes earn revenue, and LOCAL_PREF is consulted before AS_PATH",
            "BGP can't measure length",
          ],
          a: 1,
          why: "The internet routes money first, hops second. 'Suboptimal' is often 'profitable.'",
        },
        {
          q: "What made classic BGP hijacks possible?",
          opts: [
            "Weak encryption",
            "BGP historically had no origin validation — routers believed any AS announcing any prefix",
            "IPv4 exhaustion",
          ],
          a: 1,
          why: "A trust-your-neighbor protocol running a planet. RPKI patches origin claims; encrypting your traffic end-to-end is still your own job.",
        },
        {
          q: "With ECMP across two equal links, why can a single large download only use one link's bandwidth?",
          opts: [
            "ECMP is broken",
            "Load-sharing hashes per-flow to prevent reordering — one 5-tuple sticks to one path",
            "TCP forbids multiple paths",
          ],
          a: 1,
          why: "Per-packet spraying would shuffle segment order and trigger N09's dup-ACK machinery constantly. Flow-stickiness is the lesser evil — and applies to your tunnel's UDP flow too.",
        },
      ],
    },
  },
];
