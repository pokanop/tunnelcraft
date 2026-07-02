import type { Module } from "./types";

/* Networking fundamentals — the wireless modules.
   N03 (Wi-Fi & the Wireless Link) slots in right after N02 (Wires, Frames &
   Switches), because it builds directly on half-duplex media, Ethernet framing,
   and ARP. N04 (RF & Modern Wi-Fi) follows it down into the physical layer.
   N06 (Enterprise Wi-Fi) lands after N05 so VLAN↔subnet segmentation has IP
   addressing to stand on. N14 (Cellular & Mobile Links) sits late in the track,
   after NAT (N11), because CGNAT is its centrepiece. */

export const NET_WIFI: Module[] = [
  {
    id: "n03",
    code: "N03",
    title: "Wi-Fi & the Wireless Link",
    layers: ["L1", "L2"],
    est: "~75 min",
    tag: "802.11 for engineers: why air is half-duplex, the association dance, WPA2/WPA3 and the 4-way handshake, roaming, and the hostile-Wi-Fi threats your tunnel exists to survive.",
    lessons: [
      {
        id: "n03l1",
        title: "Air is a shared, half-duplex medium",
        est: "~12 min",
        blocks: [
          {
            p: "In N02 you met duplex almost in passing: switched Ethernet is full-duplex, Wi-Fi is half-duplex. This lesson is why that single fact shapes everything else about wireless. On a switch, each port is its own collision domain and both directions run at once. In the air, every station sharing a channel is in **one collision domain** — the radio can either transmit or receive, never both, and only one device may transmit at a time or the signals collide into noise. Wi-Fi is a hub from the 1990s, rebuilt in radio.",
          },
          {
            ul: [
              "**Band** — the slice of spectrum. 2.4 GHz (long range, crowded, only three non-overlapping channels: 1, 6, 11), 5 GHz (more channels, shorter range), and 6 GHz (Wi-Fi 6E/7 — vast clean spectrum, shortest range).",
              "**Channel** — a specific frequency within a band. Overlapping channels interfere; the 2.4 GHz 1/6/11 rule exists because the channels are wider than their spacing.",
              "**Channel width** — 20/40/80/160 MHz. Wider = faster peak rate but more interference and fewer non-overlapping channels. The '866 Mbps' on the box is a wide channel in ideal conditions you will never meet.",
              "**Airtime** — the real currency. Because the medium is shared, a distant slow client transmitting for a long time starves everyone: it's holding the one talking stick. This is the *airtime anticommons*.",
            ],
          },
          {
            p: "The consequence that surprises people: **one slow device slows the whole network**, not just itself. A phone at the edge of range negotiates a low data rate, so each of its frames occupies the channel far longer, and that airtime is stolen from every other station. Wired networks don't have this failure mode — it is pure half-duplex shared-medium physics.",
          },
          {
            note: "Carry this into tunnel work: a VPN's throughput ceiling on Wi-Fi is set by airtime contention, not by your crypto. When a user reports 'the VPN is slow on Wi-Fi but fine on Ethernet,' the tunnel is usually innocent — they're contending for air with the neighbourhood. Latency and jitter (N02) also spike under contention, which matters far more for a tunnel than raw bandwidth.",
            label: "diagnosis instinct",
          },
        ],
      },
      {
        id: "n03l2",
        title: "CSMA/CA: taking turns without collisions",
        est: "~12 min",
        blocks: [
          {
            p: "Wired Ethernet historically used CSMA/CD — Collision *Detection*: transmit, and if you hear a collision, back off. A radio can't do that; while transmitting it's deaf to its own frequency, so it cannot hear a collision happening. Wi-Fi instead uses CSMA/CA — Collision *Avoidance*: try hard not to collide in the first place, because you'll never notice if you do.",
          },
          {
            p: "The mechanism: a station that wants to transmit **listens first** (carrier sense). If the channel is busy, it waits. If idle, it waits a short random **backoff** interval and only then transmits — the randomness keeps two waiting stations from pouncing simultaneously the instant the channel clears. Every successful unicast frame is confirmed by an immediate **ACK**; no ACK means assume collision and retry with a longer backoff.",
          },
          {
            p: "The classic pathology is the **hidden node**: two stations both in range of the access point but *not of each other*. Neither hears the other's carrier, so both think the channel is free and transmit over each other at the AP. The optional fix is **RTS/CTS** — Request To Send / Clear To Send: a station asks the AP for permission, the AP's CTS is heard by everyone in range and reserves the air, silencing the hidden node. It costs overhead, so it's used mainly for large frames or known-contended cells.",
          },
          {
            note: "All of this is *per-frame* overhead — sensing, backoff, ACKs, occasional RTS/CTS — layered on top of the actual data. It's why measured Wi-Fi throughput is routinely half the negotiated rate. The efficiency gap isn't a bug; it's the price of coordinating a shared medium with no central clock.",
            label: "why 866 becomes 400",
          },
        ],
      },
      {
        id: "n03l3",
        title: "The association dance: scan, auth, associate",
        est: "~13 min",
        blocks: [
          {
            p: "Before a laptop can send a single IP packet over Wi-Fi, it must join a **BSS** (Basic Service Set — one AP's cell, identified by the AP's MAC, the **BSSID**). The network name you see is the **SSID**; a building with many APs sharing one SSID is an **ESS**, and moving between its APs is roaming (next lesson). Joining happens in three L2 stages, all before DHCP or ARP:",
          },
          {
            ul: [
              "**Scan** — find APs. *Passive*: listen on each channel for **beacon** frames (APs broadcast them ~10×/second advertising SSID, supported rates, security). *Active*: send **probe requests** and collect probe responses. Hidden SSIDs merely omit the name from beacons — trivially defeated, not a security control.",
              "**Authenticate** — a historical vestige. In modern WPA2/WPA3 this 802.11 'authentication' step is a near-empty formality (Open System); the real authentication is the key handshake that comes *after* association.",
              "**Associate** — the station sends an Association Request; the AP assigns an association ID and now considers the station a member of the BSS. At this point you are on the network at L2 but, on a secured network, you can't pass traffic yet.",
            ],
          },
          {
            p: "Only now does the security handshake run (next lesson), and only after *that* do the L3 rituals you already know begin: DHCP for an address (N15), ARP to find the gateway (N02), and you're routing. The whole 'connecting…' spinner is this sequence: scan → auth → associate → key handshake → DHCP → gateway ARP. Every one of those steps is a place it can stall, which is exactly why Wi-Fi 'connected but no internet' has so many distinct causes.",
          },
          {
            note: "The frame types split into three families worth knowing by name: **management** (beacons, probes, auth, association, and — crucially — *deauthentication*), **control** (RTS/CTS, ACK), and **data** (your actual traffic, carrying the Ethernet-like payload from N02). The attacks in lesson 5 almost all abuse *management* frames, because in classic Wi-Fi those frames are unauthenticated.",
            label: "three frame families",
          },
        ],
      },
      {
        id: "n03l4",
        title: "Securing the link: WPA2, WPA3 & the 4-way handshake",
        est: "~14 min",
        blocks: [
          {
            p: "Wi-Fi security is about turning a broadcast medium anyone can receive into a private link. The lineage: **WEP** (broken, dead — never deploy), **WPA2** (the workhorse for a decade, AES-CCMP encryption, still everywhere), and **WPA3** (the current standard, fixing WPA2's structural weaknesses). Two deployment modes cut across all of them:",
          },
          {
            ul: [
              "**Personal (PSK)** — one shared passphrase for the whole network. Simple; the home/coffee-shop model. Everyone who knows the passphrase can, with effort, derive each other's keys under WPA2.",
              "**Enterprise (802.1X / EAP)** — no shared secret. Each user authenticates individually (certificate or credentials) to a **RADIUS** server; the AP is just a gatekeeper relaying the exchange. Per-user keys, central revocation, no passphrase to leak. This is the corporate model and the thing your zero-trust posture work (S02) ultimately wants.",
            ],
          },
          {
            p: "The **4-way handshake** is how WPA2/WPA3 turn a credential into fresh per-session encryption keys, *after* association. Both sides already share a master key (the PMK — derived from the passphrase in Personal, or from the 802.1X exchange in Enterprise). The four messages exchange random nonces so both derive the same **PTK** (Pairwise Transient Key) without ever sending it, prove liveness to each other, and install the keys. Only when it completes does encrypted data flow. If you've watched a capture, this is the `EAPOL` message 1/2/3/4 sequence.",
          },
          {
            p: "**WPA2's structural weakness** is twofold: an eavesdropper who captures the 4-way handshake can brute-force a weak passphrase offline (the handshake is enough — they never need to touch the network again), and WPA2-Personal has no forward secrecy, so a passphrase learned later decrypts past captured traffic. **WPA3** fixes both with **SAE** (Simultaneous Authentication of Equals, a.k.a. Dragonfly): a password-authenticated key exchange where a captured handshake reveals *nothing* offline — each guess requires a fresh live interaction with the AP — and each session gets forward secrecy. WPA3 also mandates **PMF** (Protected Management Frames, 802.11w), which authenticates management frames and kills the deauth attack from the next lesson.",
          },
          {
            note: "The engineering lesson mirrors T02 exactly: the 4-way handshake is a nonce-exchange producing fresh ephemeral session keys from a long-term secret, and WPA3/SAE adds forward secrecy — the same properties Noise gives WireGuard. Different protocol, identical crypto instincts. And the same hard truth: link encryption stops at the AP. WPA3 protects you from the *other clients* and the air; it does nothing about the AP operator, the ISP, or a malicious hotspot. That gap is precisely what your tunnel fills.",
            label: "link crypto ≠ end-to-end",
          },
        ],
      },
      {
        id: "n03l5",
        title: "Roaming, and the hostile hotspot",
        est: "~14 min",
        blocks: [
          {
            p: "In an ESS (many APs, one SSID), the client — not the network — decides when to **roam**: as signal from the current AP fades, the station scans, picks a stronger BSSID, and re-associates, running a fresh key handshake with the new AP. Basic roaming means a full handshake each time, which is slow enough to drop a call; **802.11r** (fast BSS transition) pre-authenticates to speed it up, with **802.11k/v** helping the client choose a good target AP. This is a client-side decision, and aggressive vs sticky roaming logic is a real tuning problem.",
          },
          {
            p: "Why a tunnel engineer cares: **roaming changes your L2 attachment but a good VPN hides it from L3**. Each roam can mean a brief blackout and — if it crosses subnets or the AP re-NATs you — an apparent IP change. WireGuard's design (T03) shines here: it's connectionless and identifies peers by key, not by IP:port, so a roam that changes your source address just gets noticed at the next authenticated packet and the session continues. The same roaming resilience that WireGuard gives across Wi-Fi-to-cellular handoff is a direct payoff of cryptokey routing.",
          },
          {
            p: "Now the threats — nearly all abusing the unauthenticated **management** frames from lesson 3:",
          },
          {
            ul: [
              "**Evil twin** — an attacker runs an AP broadcasting a beacon with the *same SSID* as a network you trust, often with a stronger signal. Your device, which trusts SSIDs by name, may associate automatically. Now the attacker is your L2 *and* your gateway — the ARP-spoofing MITM of N02, but they own the whole link by default.",
              "**Deauthentication attack** — because classic management frames are unauthenticated, an attacker spoofs a **deauth** frame 'from' the AP, kicking a victim off. Repeat it to deny service, or to force the victim to reconnect — often onto the evil twin, or to re-capture the 4-way handshake for offline cracking. **PMF (WPA3) closes this** by authenticating management frames.",
              "**Captive portal** — the coffee-shop 'agree and connect' page. Benign in intent, but it's a deliberate MITM: the network hijacks your first HTTP request and forges DNS to redirect you. Its mechanics (forged DNS, HTTP interception) are indistinguishable from an attack, which is why they interact badly with VPNs and DNS security (P04): the tunnel must stay down until the portal is satisfied, then come up — the captive-portal detection and ordering problem you handle at the platform layer.",
            ],
          },
          {
            note: "The through-line of this whole module: Wi-Fi security protects the *link*, and on any network you don't control you should assume the link is hostile — evil twin, portal, or just a nosy AP operator. That assumption is the entire justification for an always-on, end-to-end tunnel with authenticated peers and its own DNS. WPA3 is a good floor; it is not the ceiling, and it is not present on the open hotspot you're actually worried about.",
            label: "why the tunnel exists",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "n03e1",
        type: "match",
        title: "Wireless vocabulary lock-in",
        kind: "MATCH LAB",
        prompt:
          "Match each 802.11 term to what it actually denotes. These are the load-bearing words in every Wi-Fi conversation and capture.",
        pairs: [
          { t: "BSSID", d: "The MAC address identifying one specific access point's cell" },
          { t: "SSID", d: "The human-readable network name, shared by all APs in an ESS" },
          {
            t: "CSMA/CA",
            d: "Listen-then-backoff medium access — avoidance, because a radio can't detect its own collisions",
          },
          {
            t: "4-way handshake",
            d: "The post-association exchange that derives fresh per-session keys from the master key",
          },
          {
            t: "PMF (802.11w)",
            d: "Protected management frames — authenticates deauth/disassoc, killing the deauth attack",
          },
          {
            t: "Evil twin",
            d: "A rogue AP impersonating a trusted SSID to become the victim's gateway",
          },
        ],
        why: "BSSID vs SSID and CSMA/CA are daily working vocabulary; the handshake, PMF, and evil twin are the security core the module builds toward.",
      },
      {
        id: "n03e2",
        type: "order",
        title: "From cold radio to routed packet",
        kind: "SEQUENCE LAB",
        prompt:
          "A laptop with Wi-Fi off joins a WPA2 network and loads a page. Order the full sequence — note where L2 ends and the L3 rituals you already know begin.",
        items: [
          "Scan: collect beacons / probe responses to find the AP and its security",
          "Authenticate (Open System) and send an Association Request; AP admits the station to the BSS",
          "4-way handshake: exchange nonces, derive the PTK, install session keys",
          "DHCP: obtain an IP address, mask, gateway, and DNS",
          "ARP the default gateway to get its MAC (N02)",
          "Encrypted data frames flow; the HTTP request is finally on its way",
        ],
        why: "Scan → associate → key handshake → DHCP → gateway ARP → data. The 'connecting…' spinner is this exact chain, and every step is a distinct place it can stall — the anatomy of 'connected, no internet.'",
      },
    ],
    quiz: {
      id: "n03q",
      questions: [
        {
          q: "A single distant, slow client noticeably drags down throughput for everyone else on the same Wi-Fi channel. Why?",
          opts: [
            "Its weak signal corrupts other clients' frames",
            "The medium is shared and half-duplex — its low data rate makes each frame occupy the channel longer, stealing airtime from all",
            "The AP prioritizes distant clients",
          ],
          a: 1,
          why: "Airtime is the shared currency. A slow client transmits for longer per frame, and that time is subtracted from everyone. This is pure shared-medium physics with no wired equivalent.",
        },
        {
          q: "Why does Wi-Fi use collision *avoidance* (CSMA/CA) rather than the collision *detection* (CSMA/CD) of classic Ethernet?",
          opts: [
            "Avoidance is simply faster",
            "A transmitting radio is deaf to its own frequency and cannot detect a collision while it happens",
            "Detection requires a central controller Wi-Fi lacks",
          ],
          a: 1,
          why: "Half-duplex radio can't listen while transmitting, so it can never notice a collision in progress — it must avoid them up front and rely on missing ACKs to infer failures.",
        },
        {
          q: "What does the WPA2/WPA3 4-way handshake accomplish, and when does it run?",
          opts: [
            "It carries the passphrase to the AP during scanning",
            "After association, it exchanges nonces to derive fresh per-session encryption keys from the shared master key without transmitting them",
            "It replaces DHCP for secured networks",
          ],
          a: 1,
          why: "It runs post-association and pre-data. Both sides already hold the master key; the handshake mixes in nonces to derive the same session key independently — the same ephemeral-key instinct as Noise in T02.",
        },
        {
          q: "WPA3's SAE is a meaningful upgrade over WPA2-Personal primarily because:",
          opts: [
            "It uses a longer AES key",
            "A captured handshake yields nothing to an offline brute-force attacker, and each session gains forward secrecy",
            "It hides the SSID",
          ],
          a: 1,
          why: "WPA2's captured 4-way handshake enables offline passphrase cracking and has no forward secrecy. SAE makes every password guess require a fresh live exchange and protects past traffic — the WireGuard-grade properties, on the link.",
        },
        {
          q: "An attacker floods spoofed deauthentication frames at a victim. Which control specifically defeats this, and why does it work?",
          opts: [
            "A stronger passphrase — it re-secures the handshake",
            "PMF / 802.11w — it authenticates management frames, so forged deauths are rejected",
            "RTS/CTS — it reserves the air against the attacker",
          ],
          a: 1,
          why: "The deauth attack works only because classic management frames are unauthenticated. Protected Management Frames sign them, so a spoofed deauth is dropped. RTS/CTS addresses hidden-node contention, an unrelated problem.",
        },
      ],
    },
  },
  {
    id: "n04w",
    code: "N04",
    title: "RF & Modern Wi-Fi",
    layers: ["L1"],
    est: "~80 min",
    tag: "Down into the physics: dBm and SNR, how signal quality becomes a data rate, MIMO and OFDMA, the Wi-Fi 4→7 generations, and a working method for diagnosing bad RF instead of blaming the tunnel.",
    lessons: [
      {
        id: "n04wl1",
        title: "Decibels, RSSI & the noise floor",
        est: "~13 min",
        blocks: [
          {
            p: "N03 treated the radio as a given. This module opens it up, because most 'the network is slow' mysteries on wireless are physical-layer facts wearing a software costume. The first tool is the unit: signal strength is measured in **dBm** — decibels relative to one milliwatt — and it is *logarithmic*. Every +3 dB doubles the power; every +10 dB is ten times the power. Wi-Fi receive levels are tiny fractions of a milliwatt, so the numbers are negative: −40 dBm is a very strong signal, −90 dBm is a whisper. The gap between them is not '50 units' — it is a factor of one hundred thousand.",
          },
          {
            tbl: {
              head: ["RSSI", "What it means in practice"],
              rows: [
                ["−30 to −50 dBm", "Excellent — same room as the AP; full rates available"],
                [
                  "−50 to −67 dBm",
                  "Good — the design target for anything real-time (VoIP, video, your tunnel)",
                ],
                ["−67 to −75 dBm", "Fair — browsing works, rates drop, retries climb"],
                [
                  "−75 to −85 dBm",
                  "Poor — low rates, heavy airtime use (N03), roam candidates wanted",
                ],
                ["below −85 dBm", "Barely associated — near the noise floor, effectively unusable"],
              ],
            },
          },
          {
            p: "**RSSI** (Received Signal Strength Indicator) is the receiver's estimate of that level. But signal alone decides nothing — what matters is how far the signal sits *above* the **noise floor**, the ambient RF energy on the channel (thermal noise, microwave ovens, the neighbour's everything). That margin is the **SNR** (signal-to-noise ratio): signal minus noise, in dB. A −75 dBm signal over a quiet −95 dBm floor (SNR 20 dB) outperforms a −65 dBm signal over a noisy −75 dBm floor (SNR 10 dB), even though the second signal is ten times stronger. Receivers decode *margin*, not strength.",
          },
          {
            note: "This is the anatomy of 'full bars but slow.' The bars render RSSI; they say nothing about the noise floor or channel contention. A client can show maximum bars while sitting in RF soup, retrying half its frames. When a user swears the signal is perfect, believe them — and then ask about the SNR they can't see.",
            label: "full bars, no throughput",
          },
        ],
      },
      {
        id: "n04wl2",
        title: "From SNR to speed: modulation & rate adaptation",
        est: "~13 min",
        blocks: [
          {
            p: "How does a radio turn margin into megabits? By choosing how much information to pack into each transmission — the **modulation**. Simple schemes (BPSK) encode one bit per symbol and survive terrible SNR; dense schemes (256-QAM, 1024-QAM, 4096-QAM in Wi-Fi 7) encode 8, 10, 12 bits per symbol but need a pristine channel, because the receiver must distinguish ever-finer differences in amplitude and phase. Add a **coding rate** — the fraction of transmitted bits that are real data versus error-correction redundancy — and you get the **MCS index** (Modulation and Coding Scheme): a numbered ladder from slow-and-indestructible to fast-and-fragile.",
          },
          {
            ul: [
              "**Low MCS** — BPSK/QPSK, heavy error correction. Works at SNR ≈ 5–10 dB. This is the rate your phone negotiates at the edge of the garden.",
              "**Mid MCS** — 16/64-QAM. Needs SNR ≈ 15–25 dB. Where most healthy real-world links live.",
              "**High MCS** — 256/1024-QAM, light coding. Needs SNR ≈ 30 dB+. The number on the router's box, measured in the same room.",
            ],
          },
          {
            p: "**Rate adaptation** is the control loop that walks this ladder live: transmit, and if ACKs go missing (N03 — the only failure signal a radio gets), step down to a hardier MCS; after a run of clean frames, probe upward again. It never sits still, which is why wireless throughput graphs breathe. And connect this to N03's airtime economics: a client that drops from MCS 9 to MCS 2 doesn't just get slower *itself* — each of its frames now occupies the shared channel several times longer, taxing every station in the cell.",
          },
          {
            note: "Retry rate is the most underrated wireless health metric. A link retrying 30% of its frames still 'works' — TCP hides the losses — but latency and jitter go feral, which is exactly what a tunnel carrying interactive traffic can't absorb. When diagnosing, look at retries and the negotiated rate before anything else; lesson 5 shows you where.",
            label: "watch the retries",
          },
        ],
      },
      {
        id: "n04wl3",
        title: "MIMO, beamforming & OFDMA",
        est: "~13 min",
        blocks: [
          {
            p: "Modulation packs more bits per symbol; the second lever is transmitting *several symbol streams at once*. **MIMO** (multiple-in, multiple-out) uses multiple antennas to send independent **spatial streams** over the same channel simultaneously, exploiting the fact that signals bouncing off walls arrive with distinguishable spatial signatures. A '2×2' client can double, a '4×4' AP quadruple, the base rate — when conditions allow. **Beamforming** uses the same antenna arrays to shape transmission toward a specific client instead of radiating uniformly, buying a few dB of SNR exactly where lesson 2 showed every dB pays rent.",
          },
          {
            p: "**MU-MIMO** (multi-user MIMO) lets an AP address several clients in the same instant using separate spatial streams. Useful, but the quiet revolution is **OFDMA** (Wi-Fi 6): instead of giving the *entire channel* to one station per transmission — N03's talking stick — the AP subdivides the channel into small **resource units** and schedules multiple stations' data into a single transmission opportunity. Small frames from many clients stop paying the full per-frame contention overhead each.",
          },
          {
            p: "Think about what a busy network actually carries: TCP ACKs, DNS queries, VoIP packets, game state, tunnel keepalives — floods of *tiny* frames. Under classic Wi-Fi, each one contends for the whole channel, and per-frame overhead (N03) dwarfs the payload. OFDMA batches them. The result is less peak throughput headline, more *latency under load* — the metric that decides whether a video call over your VPN survives a household of streamers.",
          },
          {
            note: "OFDMA moves Wi-Fi a step toward the scheduled radio you'll meet in N14: the AP begins acting like a scheduler handing out airtime, rather than a referee for a free-for-all. Wireless keeps rediscovering that at scale, coordination beats contention.",
            label: "toward a scheduled medium",
          },
        ],
      },
      {
        id: "n04wl4",
        title: "The generations: Wi-Fi 4 → 7",
        est: "~13 min",
        blocks: [
          {
            p: "The 802.11 alphabet finally got human names. Each generation is, at heart, a bundle of the levers you now understand: denser QAM, wider channels, more spatial streams, better scheduling.",
          },
          {
            tbl: {
              head: ["Name", "Standard", "Bands", "What it actually added"],
              rows: [
                [
                  "Wi-Fi 4",
                  "802.11n",
                  "2.4 + 5 GHz",
                  "MIMO, 40 MHz channels — the first 'modern' Wi-Fi",
                ],
                [
                  "Wi-Fi 5",
                  "802.11ac",
                  "5 GHz",
                  "256-QAM, 80/160 MHz channels, MU-MIMO (downlink)",
                ],
                [
                  "Wi-Fi 6",
                  "802.11ax",
                  "2.4 + 5 GHz",
                  "OFDMA, 1024-QAM, uplink MU-MIMO, target wake time",
                ],
                [
                  "Wi-Fi 6E",
                  "802.11ax",
                  "+ 6 GHz",
                  "Same protocol, vast clean spectrum — WPA3 mandatory",
                ],
                [
                  "Wi-Fi 7",
                  "802.11be",
                  "2.4 + 5 + 6 GHz",
                  "4096-QAM, 320 MHz channels, multi-link operation (MLO)",
                ],
              ],
            },
          },
          {
            p: "Two entries deserve a second look. **6 GHz** (Wi-Fi 6E/7) is less about speed than hygiene: a huge band with no legacy devices, where WPA3 and PMF (N03) are *mandatory*, not optional — the deauth attack simply doesn't board the plane. The trade is physics: higher frequency, shorter range, worse wall penetration. **MLO** (Wi-Fi 7's multi-link operation) lets one client use several bands *simultaneously* — steering latency-sensitive traffic to the clean band while bulk flows elsewhere, or failing over between links without re-association.",
          },
          {
            note: "Generation numbers are ceilings, not floors: a Wi-Fi 7 AP serving a client at −80 dBm still talks BPSK, slowly. When speccing or debugging, the question is never 'what generation?' — it's 'what MCS is *this client* actually negotiating, on what channel width, at what retry rate?' The generation just sets what's possible when the RF is right.",
            label: "ceilings, not floors",
          },
        ],
      },
      {
        id: "n04wl5",
        title: "Channel planning & the RF diagnosis playbook",
        est: "~14 min",
        blocks: [
          {
            p: "Last piece: the channel itself. On 5 GHz, many channels are **DFS** (Dynamic Frequency Selection) — shared with radar. An AP using them must listen constantly and, on detecting radar, vacate within seconds and go silent on the new channel during a minute-long check. To a user that's Wi-Fi dropping 'for no reason'; to you it's a log line. **Band steering** is the AP nudging dual-band clients off crowded 2.4 GHz; combined with N03's roaming logic, it explains most 'my laptop keeps switching networks' complaints. And channel *width* is a bet: 80 MHz doubles peak rate over 40 MHz but quadruples the spectrum you must find clean — in an apartment block, narrower is often faster.",
          },
          {
            p: "Now assemble the whole module into a working diagnosis method. The data is one command away:",
          },
          {
            code: {
              lang: "sh",
              title: "Reading the physical layer (Linux; macOS: option-click the Wi-Fi menu)",
              body: "$ iw dev wlan0 link\nConnected to aa:bb:cc:dd:ee:ff (on wlan0)\n\tSSID: HomeNet\n\tfreq: 5240                 # the channel, in MHz — 5 GHz here\n\tsignal: -71 dBm            # RSSI: 'fair' — check the table in lesson 1\n\trx bitrate: 117.0 MBit/s   # negotiated MCS — nowhere near the box number\n\ttx bitrate: 86.7 MBit/s MCS 4 40MHz\n\n$ iw dev wlan0 station dump | grep -E 'signal|tx (bitrate|retries|failed)'\n\tsignal:  \t-71 [-71, -75] dBm\n\ttx bitrate:\t86.7 MBit/s MCS 4 40MHz\n\ttx retries:\t44821          # the number that matters\n\ttx failed:\t312",
            },
          },
          {
            ul: [
              "**1. RSSI** — below ≈ −70 dBm, everything downstream is suspect. Fix placement/roaming first.",
              "**2. SNR** — decent RSSI but low rate? Suspect the noise floor: interferers, or a co-channel neighbour.",
              "**3. Negotiated rate & retries** — low MCS or a climbing retry counter with good RSSI means contention or interference, not distance.",
              "**4. Channel occupancy** — scan for co-channel APs (`iw dev wlan0 scan`); on 2.4 GHz, remember only 1/6/11 don't overlap (N03).",
              "**5. Only then** blame anything above L1 — DHCP, DNS, the tunnel.",
            ],
          },
          {
            note: "This ordering is the whole point of the module. 'The VPN is slow on Wi-Fi' tickets almost always resolve at steps 1–4, and every one of those steps is invisible to ping and traceroute (N16 gives you the L3+ toolbelt; this is the L1 toolbelt under it). Diagnose the air before you diagnose the tunnel.",
            label: "L1 before L3",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "n04we1",
        type: "match",
        title: "RF vocabulary lock-in",
        kind: "MATCH LAB",
        prompt:
          "Match each physical-layer term to what it denotes. These are the words that turn 'Wi-Fi is being weird' into a diagnosis.",
        pairs: [
          { t: "RSSI", d: "The receiver's measured signal strength, in (negative) dBm" },
          {
            t: "SNR",
            d: "Signal minus the noise floor — the margin the receiver actually decodes with",
          },
          {
            t: "MCS index",
            d: "The numbered ladder of modulation + coding combinations, from robust-and-slow to fragile-and-fast",
          },
          {
            t: "OFDMA",
            d: "Subdividing the channel into resource units so many stations' small frames share one transmission",
          },
          {
            t: "DFS",
            d: "Radar-shared 5 GHz channels an AP must vacate on detection — the 'random' Wi-Fi dropout",
          },
          {
            t: "Beamforming",
            d: "Shaping transmission toward a specific client to buy extra dB of SNR",
          },
        ],
        why: "RSSI vs SNR is the single most misdiagnosed distinction in wireless; MCS, OFDMA, and DFS explain the three commonest 'it's slow / it dropped' mysteries.",
      },
      {
        id: "n04we2",
        type: "order",
        title: "The RF triage ladder",
        kind: "SEQUENCE LAB",
        prompt:
          "A user reports 'the VPN is unusable on Wi-Fi, fine on Ethernet.' Order the diagnosis so that each step only runs if the previous one came back clean.",
        items: [
          "Check RSSI at the client — below ≈ −70 dBm, it's a coverage/placement problem, stop here",
          "Check the noise floor / SNR — strong signal with a small margin means interference, not distance",
          "Check negotiated MCS and the retry counters — low rate or heavy retries at good SNR means contention",
          "Scan for co-channel and overlapping APs; reconsider channel and width",
          "Only now investigate above L1 — DHCP, DNS, MTU, the tunnel itself",
        ],
        why: "Each rung explains the ones below it: bad RSSI causes bad SNR causes low MCS causes retries. Starting at the tunnel means debugging four layers of symptom before reaching the cause.",
      },
    ],
    quiz: {
      id: "n04wq",
      questions: [
        {
          q: "A signal improves from −73 dBm to −67 dBm. Roughly what happened to the received power?",
          opts: [
            "It increased by about 8%",
            "It roughly quadrupled — dB is logarithmic, and +3 dB doubles power, twice over",
            "It doubled, since 6 dB is twice 3 dB",
          ],
          a: 1,
          why: "Decibels compound multiplicatively: +3 dB doubles, so +6 dB is ×4. Linear intuition about dBm numbers is the root of most bad RF reasoning.",
        },
        {
          q: "Which link performs better: −75 dBm signal over a −95 dBm noise floor, or −65 dBm over a −75 dBm floor?",
          opts: [
            "The −65 dBm link — the signal is ten times stronger",
            "The −75 dBm link — its 20 dB SNR beats the other's 10 dB; receivers decode margin, not strength",
            "Identical — only the transmit power matters",
          ],
          a: 1,
          why: "SNR is what the demodulator works with. A weaker signal over a quiet floor sustains a higher MCS than a stronger signal drowning in noise — the 'full bars but slow' mechanism.",
        },
        {
          q: "How does a Wi-Fi transmitter discover that its current data rate is too ambitious?",
          opts: [
            "The AP broadcasts the correct rate in beacons",
            "Missing ACKs — the only failure signal a radio gets — trigger rate adaptation to step down the MCS ladder",
            "It measures the noise floor before each frame and computes the rate directly",
          ],
          a: 1,
          why: "A radio can't hear its own collisions or corruption (N03); it infers failure from absent ACKs and walks the MCS ladder down, probing back up after clean runs.",
        },
        {
          q: "OFDMA's headline improvement for a busy network is:",
          opts: [
            "A higher peak throughput number for a single client",
            "Latency under load — many stations' small frames share one scheduled transmission instead of each contending for the whole channel",
            "Longer range at 6 GHz",
          ],
          a: 1,
          why: "OFDMA subdivides the channel into resource units, amortizing per-frame contention overhead across users. Peak throughput barely moves; responsiveness under real mixed traffic is transformed.",
        },
        {
          q: "Wi-Fi drops for everyone at once, then returns on a different channel a minute later. The most likely physical-layer cause?",
          opts: [
            "A deauthentication attack (N03)",
            "DFS — the AP detected radar on its channel, vacated it as required, and had to monitor the new channel before speaking",
            "Rate adaptation stepping down to MCS 0",
          ],
          a: 1,
          why: "That signature — whole-cell drop, channel change, ~60 s of silence — is the DFS radar-vacate sequence. A deauth attack kicks clients but doesn't move the AP's channel.",
        },
      ],
    },
  },
  {
    id: "n06w",
    code: "N06",
    title: "Enterprise Wi-Fi: 802.1X, RADIUS & Segmentation",
    layers: ["L2", "L3"],
    est: "~75 min",
    tag: "How organizations do Wi-Fi: per-user identity with 802.1X and EAP, the RADIUS machinery behind it, VLAN-per-user segmentation, and the messy onboarding reality of portals and MAC randomization.",
    lessons: [
      {
        id: "n06wl1",
        title: "Why the shared passphrase doesn't scale",
        est: "~12 min",
        blocks: [
          {
            p: "N03 introduced the Personal/Enterprise split; this module is the Enterprise half in full. Start with why PSK collapses past the household. One passphrase for the whole network means **authentication without identity**: the network knows a device holds the secret, not *who* it is. Every consequence follows from that.",
          },
          {
            ul: [
              "**Offboarding is rotation.** An employee leaves, a contractor's laptop is stolen — the only revocation is changing the passphrase and re-keying every device in the building. So nobody does, and the secret's true audience grows forever.",
              "**Peers can decrypt each other.** Under WPA2-PSK, anyone with the passphrase who captures a victim's 4-way handshake (N03) can derive that victim's session keys. The 'encrypted' network is transparent to every legitimate insider.",
              "**No differentiation.** One key means one network: the CFO's laptop, the intern's phone, and the smart TV land in the same broadcast domain with the same reach.",
            ],
          },
          {
            p: "WPA3-SAE (N03) fixes the *cryptography* — peers can no longer passively derive each other's keys, and captured handshakes resist offline cracking — but it cannot fix the *identity model*. Revocation, per-user policy, and auditability all require knowing who is connecting. That is what **WPA-Enterprise** buys: the same 4-way handshake you already know, but fed by a per-user authentication instead of a shared secret.",
          },
          {
            note: "This is the link-layer face of the zero-trust doctrine you'll meet properly in N17 and wire into a client in S02: identity, not location or shared secrets, as the basis for access. Enterprise Wi-Fi was doing identity-based network access decades before the term 'zero trust' was coined.",
            label: "identity over secrets",
          },
        ],
      },
      {
        id: "n06wl2",
        title: "802.1X: three parties, one blocked port",
        est: "~13 min",
        blocks: [
          {
            p: "**802.1X** is port-based network access control, and it predates Wi-Fi — it was built for Ethernet switch ports. The model has three roles: the **supplicant** (the client's auth software), the **authenticator** (the switch port or AP), and the **authentication server** (almost always **RADIUS**). The authenticator's port starts in a blocked state where exactly one traffic type may pass: **EAPOL** (EAP over LAN), the authentication conversation itself. No DHCP, no ARP, nothing — until the server says yes.",
          },
          {
            ul: [
              "**Supplicant** — initiates with EAPOL-Start, proves identity via some EAP method (next lesson).",
              "**Authenticator** — the AP. Crucially, it is a *relay*: it repackages EAP frames from the air into RADIUS packets toward the server and back. It never sees credentials and can't evaluate them; it just enforces the verdict.",
              "**Authentication server** — terminates the EAP conversation, checks credentials against its store (often via LDAP/AD), and returns Access-Accept or Access-Reject.",
            ],
          },
          {
            p: "Here's the elegant part, and the exam-grade fact: on Access-Accept, the RADIUS server doesn't just say yes — it *delivers key material*. The EAP exchange produces a master key (the **PMK**) known to the client and the server; the server hands it to the AP inside the RADIUS accept message. From there, the **same 4-way handshake from N03** runs, deriving session keys exactly as in a home network. Enterprise doesn't replace WPA's key machinery — it replaces where the PMK *comes from*: derived from a passphrase in Personal, minted per-user per-session by the EAP exchange in Enterprise.",
          },
          {
            note: "One architecture, two media: the same 802.1X machinery guards wired switch ports, which is how NAC (network access control) deployments stop a visitor's laptop plugged into a meeting-room jack from reaching the finance VLAN. Learn it once on Wi-Fi, reuse it on copper.",
            label: "same machinery, wired too",
          },
        ],
      },
      {
        id: "n06wl3",
        title: "EAP flavors & the supplicant trust problem",
        est: "~14 min",
        blocks: [
          {
            p: "**EAP** (Extensible Authentication Protocol) is a framework, not a method — the actual proof of identity is a pluggable inner protocol, and which one you deploy matters enormously.",
          },
          {
            ul: [
              "**PEAP (MSCHAPv2)** — the ubiquitous one: a TLS tunnel to the server, then a legacy username/password challenge inside. Deployable anywhere a directory has passwords; inherits every password weakness — phishable, reused, sprayed.",
              "**EAP-TTLS** — same shape as PEAP (TLS outside, flexible legacy auth inside), more common off-Windows.",
              "**EAP-TLS** — the gold standard: *mutual* certificate authentication. The client proves identity with a certificate, not a password. Nothing to phish, nothing to reuse, revocation is a CRL entry. Its historical cost — issuing a cert to every device — is exactly what MDM and modern PKI automation dissolved.",
            ],
          },
          {
            p: "Now the structural weak point, and it's not the crypto — it's configuration. In PEAP/TTLS, the client sends its (tunneled) credentials to *whichever server presented an acceptable certificate*. If the supplicant is configured to skip or 'ask the user' on server-certificate validation, an attacker runs the N03 evil twin with a RADIUS server attached: your laptop associates with the familiar SSID, dutifully opens a TLS tunnel to the attacker's server, and hands over an MSCHAPv2 exchange that cracks offline. The enterprise version of the evil twin doesn't steal your traffic — it steals your *domain credentials*.",
          },
          {
            p: "The defenses are configuration discipline: pin the expected RADIUS certificate/CA and server name in the supplicant profile, push those profiles by **MDM** rather than asking users to click through trust prompts — or remove the credential from the equation entirely with EAP-TLS, where there is no password to harvest and the *mutual* authentication means the client also verifies the network.",
          },
          {
            note: "Same lesson as T02 and N03, one layer up: unauthenticated or unverified endpoints turn strong crypto into an escort service for your secrets. WireGuard solves it with pinned public keys per peer (T03); enterprise Wi-Fi solves it with pinned server certificates. Trust must be anchored, never prompted.",
            label: "anchor the trust",
          },
        ],
      },
      {
        id: "n06wl4",
        title: "RADIUS, dynamic VLANs & segmentation",
        est: "~13 min",
        blocks: [
          {
            p: "Zoom in on RADIUS itself: a UDP protocol (auth on 1812) carrying attribute-value pairs between authenticator and server — Access-Request in, Access-Challenge rounds while EAP runs, then Access-Accept or Access-Reject. Because the verdict rides on attributes, the accept can carry *policy*: chiefly a **VLAN assignment**. The AP then drops that client onto the assigned VLAN (N02) — engineering VLAN for engineers, finance for finance, quarantine for the unrecognized — all on **one SSID**. Identity decides placement; the air is just transport.",
          },
          {
            p: "Each VLAN maps to its own subnet with its own DHCP scope and gateway — this is where the IP addressing from N05 becomes organizational structure, and the subnet-design skills of N07 stop being abstract. Inter-VLAN reach is then a routing-and-firewall decision made at L3, not an accident of sharing a broadcast domain.",
          },
          {
            ul: [
              "**Client isolation** — the AP refuses to bridge traffic between wireless clients in the same cell. On a guest or hotspot network this is table stakes: it kills the N02-style neighbor attacks between strangers.",
              "**Guest network design** — separate VLAN, isolated clients, internet-only firewall policy, bandwidth caps. The classic pattern, composed from parts you now know individually.",
              "**Accounting** — RADIUS's third leg (port 1813): session start/stop records per identity. Auditability is half the reason enterprises deploy this at all.",
            ],
          },
          {
            note: "For a tunnel client, segmentation is environmental awareness: corporate networks routinely block UDP to arbitrary ports from guest VLANs, force proxies (P04), or intercept DNS. When your VPN 'works at home, fails at the office,' the office's segmentation policy is the first suspect — your app's fallback and diagnostics strategy (S02, T04) should assume networks like this exist.",
            label: "your tunnel meets policy",
          },
        ],
      },
      {
        id: "n06wl5",
        title: "Portals, MAC randomization & onboarding reality",
        est: "~13 min",
        blocks: [
          {
            p: "N03 introduced the captive portal as a benign MITM; here's the machinery. Every OS probes a known **canary URL** on join (Android hits generate_204, Apple hits captive.apple.com) expecting a known response. If something else comes back — because the network is hijacking HTTP or forging DNS — the OS declares a portal and pops the sign-in sheet. The network, for its part, tracks who has 'signed in' by **MAC address**, the only handle it has before authentication.",
          },
          {
            p: "Which collides head-on with **MAC randomization**: modern phones present a different random MAC per SSID (and may rotate it periodically) to stop the passive tracking that N03's probe-request behavior made trivial. The collateral damage list is long: portals that forget you, MAC-based allowlists that break, DHCP reservations that miss, per-device bandwidth caps that reset. Enterprises answer with identity-based auth (this module) instead of MAC-based trust — which was always a fiction anyway, since MACs are trivially spoofable (N02).",
          },
          {
            p: "The forward-looking fix for public Wi-Fi is **Passpoint / Hotspot 2.0**: your device carries a profile (from a carrier or venue) and authenticates via 802.1X *automatically* — public Wi-Fi with enterprise-grade auth and no portal at all. Adoption is real but uneven; the coffee shop will keep its portal for years yet.",
          },
          {
            note: "Onboarding order is a platform problem your client must own (P04): detect the portal, hold the tunnel down, let the sign-in happen in a sandboxed sheet, *then* bring the tunnel up — while never letting 'portal detection' become an excuse to leak traffic. Every VPN product has a story about getting this wrong; make yours boring.",
            label: "portal, then tunnel",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "n06we1",
        type: "match",
        title: "The 802.1X cast of characters",
        kind: "MATCH LAB",
        prompt:
          "Match each enterprise-Wi-Fi term to its role. The three-party vocabulary is the skeleton of every design discussion and every debugging session.",
        pairs: [
          {
            t: "Supplicant",
            d: "The client-side software that initiates EAPOL and proves identity",
          },
          {
            t: "Authenticator",
            d: "The AP or switch port — a relay that enforces the verdict but never sees credentials",
          },
          {
            t: "RADIUS server",
            d: "Terminates the EAP exchange, checks the directory, returns Accept/Reject plus the PMK and policy attributes",
          },
          {
            t: "EAP-TLS",
            d: "Mutual certificate authentication — no password to phish, revocation via PKI",
          },
          {
            t: "PEAP",
            d: "A TLS tunnel to the server protecting a legacy password exchange inside",
          },
          {
            t: "Client isolation",
            d: "AP refuses to bridge traffic between wireless clients in the same cell",
          },
        ],
        why: "Supplicant/authenticator/server is load-bearing vocabulary; EAP-TLS vs PEAP is the central deployment decision; isolation is the guest-network primitive.",
      },
      {
        id: "n06we2",
        type: "order",
        title: "EAP-TLS join, from probe to routed packet",
        kind: "SEQUENCE LAB",
        prompt:
          "A managed laptop joins the corporate SSID using EAP-TLS with dynamic VLAN assignment. Order the sequence — note how it wraps the N03 join you already know around a new key source.",
        items: [
          "Scan, 802.11 authenticate (Open System), and associate to the AP — L2 admission, port still blocked (N03)",
          "EAPOL starts; the AP relays an EAP-TLS exchange between supplicant and RADIUS server",
          "Mutual certificate verification: server proves its identity, client proves its own — the PMK is derived",
          "RADIUS Access-Accept delivers the PMK and a VLAN attribute to the AP",
          "The 4-way handshake runs, deriving session keys from the per-user PMK (N03)",
          "The client lands on its assigned VLAN; DHCP and gateway ARP proceed on that subnet (N05)",
        ],
        why: "Enterprise Wi-Fi is N03's join with one substitution: the PMK comes from a mutual EAP-TLS exchange instead of a shared passphrase — and the accept message doubles as a policy decision (the VLAN).",
      },
    ],
    quiz: {
      id: "n06wq",
      questions: [
        {
          q: "The deepest reason WPA-PSK fails at organizational scale is:",
          opts: [
            "The passphrase can be too short",
            "Authentication without identity — one shared secret means no per-user revocation, policy, or audit trail",
            "PSK networks cannot use AES encryption",
          ],
          a: 1,
          why: "Even a perfect passphrase can't tell the network who connected. Offboarding, differentiation, and accountability all require identity — which is the thing Enterprise adds.",
        },
        {
          q: "In 802.1X, what does the access point actually do with the user's credentials?",
          opts: [
            "Verifies them against its local database",
            "Nothing — it relays the EAP conversation between supplicant and RADIUS server and enforces the verdict, never seeing credentials",
            "Decrypts them and forwards them to the domain controller",
          ],
          a: 1,
          why: "The authenticator is a relay and enforcement point. Credential evaluation happens at the RADIUS server; the AP's job is keeping the port blocked until Accept arrives — then installing the PMK it's handed.",
        },
        {
          q: "Where does the PMK come from on a WPA2-Enterprise network?",
          opts: [
            "It's derived from the SSID and a master passphrase",
            "The EAP exchange mints it per-user, per-session; the RADIUS server delivers it to the AP inside Access-Accept, then the normal 4-way handshake runs",
            "The AP generates it randomly and broadcasts it encrypted in beacons",
          ],
          a: 1,
          why: "Enterprise swaps the PMK's provenance, not the key machinery: same 4-way handshake as N03, but the master key is fresh, individual, and never derived from a shared secret.",
        },
        {
          q: "An attacker's evil twin targeting a PEAP network primarily harvests:",
          opts: [
            "The victim's browsing traffic",
            "Domain credentials — a supplicant that skips server-certificate validation tunnels its MSCHAPv2 exchange straight to the attacker's RADIUS server for offline cracking",
            "The AP's private key",
          ],
          a: 1,
          why: "The enterprise evil twin is a credential trap, worse than a traffic MITM. The fixes are anchored trust — pinned server certs pushed by MDM — or EAP-TLS, which has no password to steal and authenticates the network back.",
        },
        {
          q: "Dynamic VLAN assignment means:",
          opts: [
            "Each SSID broadcasts on a rotating VLAN for security",
            "The RADIUS Access-Accept carries a VLAN attribute, so one SSID places each authenticated identity onto its own segment and subnet",
            "The client chooses its VLAN via a DHCP option",
          ],
          a: 1,
          why: "Identity decides placement: engineering, finance, and quarantine can share one SSID while landing in different broadcast domains (N02) and subnets (N05/N07). Policy then lives at L3, on purpose.",
        },
      ],
    },
  },
  {
    id: "n14w",
    code: "N14",
    title: "Cellular & Mobile Links",
    layers: ["L1", "L2", "L3"],
    est: "~80 min",
    tag: "The other radio your tunnel lives on: scheduled airtime instead of contention, the GTP tunnels inside the carrier, CGNAT and IPv6-only reality, and the handoff-and-battery physics that shape a mobile VPN client.",
    lessons: [
      {
        id: "n14wl1",
        title: "A scheduled radio: cellular is not big Wi-Fi",
        est: "~13 min",
        blocks: [
          {
            p: "Half of this course's wireless story (N03, N04) was about coping with a free-for-all: unlicensed spectrum, CSMA/CA, contention, hidden nodes. Cellular starts from the opposite premise. The operator *owns* the spectrum — licensed, exclusive — so the base station doesn't referee a scramble; it **schedules** every transmission. A phone (the **UE**, user equipment) with data to send asks for an uplink grant; the base station (LTE's **eNodeB**, 5G's **gNB**) tells each device exactly which time slots and frequency blocks are its. Nobody collides, ever, because nobody transmits uninvited.",
          },
          {
            ul: [
              "**No hidden node problem** — the scheduler hears everyone; the CSMA/CA pathologies of N03 simply don't exist.",
              "**Graceful saturation** — a loaded cell degrades by giving everyone smaller grants, not by collision collapse. Latency rises smoothly instead of falling off a cliff.",
              "**The same PHY levers as N04** — SNR still decides modulation (QPSK up to 256-QAM+), MIMO still multiplies streams. The physics didn't change; the *coordination model* did.",
            ],
          },
          {
            p: "Generations, minus the marketing: **4G LTE** made the network all-IP — no circuit-switched anything, every service including voice is packets. **5G** comes in two flavors worth distinguishing: **NSA** (non-standalone — 5G radio bolted onto the LTE core; most early '5G' indicators) and **SA** (standalone — new core, and where the interesting features live). And spectrum splits the experience: **sub-6 GHz** 5G behaves like better LTE, while **mmWave** offers fiber-like rates across a parking lot but is stopped by a pane of glass — N04's frequency-versus-range trade, taken to its extreme.",
          },
          {
            note: "Grant-based scheduling has a latency floor: even an empty cell costs a request-grant round trip before your packet flies, which is why cellular idle latency feels different from Wi-Fi's. But under *load*, scheduling wins — remember N04's observation that OFDMA is Wi-Fi drifting toward exactly this model.",
            label: "contention vs schedule",
          },
        ],
      },
      {
        id: "n14wl2",
        title: "Your packet is already in a tunnel: the mobile core",
        est: "~13 min",
        blocks: [
          {
            p: "Here is the fact that reframes everything: on cellular, your packets are tunneled *before your VPN does anything*. The radio network (**RAN** — the towers) and the **core** (the operator's brain: authentication via your SIM, billing, policy) are connected by **GTP** (GPRS Tunneling Protocol). Every IP packet your phone sends is encapsulated at the base station and carried through a GTP tunnel to a **packet gateway** deep in the operator's core — and *that* is where your IP address actually lives. Not at the tower. Your phone is, topologically, a device dangling at the end of a very long virtual wire.",
          },
          {
            p: "This architecture is *why* cellular mobility works the way it does. Drive across town through ten tower handoffs and your IP never changes — the mobility is handled *under* IP, by repointing GTP tunnels from tower to tower while the packet gateway anchor stays put. Compare N03: Wi-Fi roaming is client-driven, visible, and can change your subnet; cellular handoff is network-driven and invisible at L3. The complexity didn't disappear — it moved into the operator's infrastructure.",
          },
          {
            p: "The tenant's costs: **latency** (every packet detours through the packet gateway, which may sit in another city — your 'nearest' VPN server is nearest to *the gateway*, not to you); **bufferbloat** (carriers deploy deep buffers to paper over radio hiccups, so a saturated link shows RTT spiking into hundreds of ms — N09's congestion-control story in its harshest habitat); and **middleboxes** (the gateway is a natural place for carriers to NAT, filter, and shape, which is the next lesson).",
          },
          {
            note: "GTP is professionally humbling: encapsulation with an anchor point solving mobility is *exactly* your VPN's architecture — the operator got there first, at continental scale. When your tunnel runs over cellular, it's tunnels all the way down: WireGuard inside GTP, and the skills transfer both ways.",
            label: "tunnels all the way down",
          },
        ],
      },
      {
        id: "n14wl3",
        title: "CGNAT: the address you don't have",
        est: "~14 min",
        blocks: [
          {
            p: "There are far more mobile devices than IPv4 addresses, so carriers deploy **CGNAT** (carrier-grade NAT) at the packet gateway: your phone gets a private address from **100.64.0.0/10** (the shared-address space reserved specifically for this), and thousands of subscribers share each public IP. It's the NAT you learned in N11, at industrial scale — and with the dials set against you.",
          },
          {
            ul: [
              "**Inbound is dead on arrival.** No port forwarding, no UPnP, no way to accept an unsolicited connection. Anything peer-to-peer must be outbound-initiated from both ends.",
              "**Mappings are ruthless.** Serving thousands of users per IP means aggressive timeout of idle bindings — often well under a minute for UDP. An idle tunnel's mapping silently evaporates.",
              "**You're double-NATed by default.** CGNAT at the carrier plus your home/hotspot router's NAT — two translation layers, neither of which you control.",
              "**Reputation is shared.** One abusive subscriber gets the public IP rate-limited or blocked, and you inherit it.",
            ],
          },
          {
            p: "For tunnel engineering this is the boss level, and it's why T04 exists: **STUN** to discover your public mapping, **ICE** to negotiate a path, **DERP**-style relays when direct fails — on mobile these are not optimizations, they're the difference between working and not. And the aggressive UDP timeouts explain a number you've already seen: WireGuard's **persistent keepalive** (T03), typically 25 seconds, is calibrated to refresh NAT bindings *before* a CGNAT reaps them. That config knob is a direct response to this lesson.",
          },
          {
            note: "Diagnostic tell: an address in 100.64.0.0/10 on your cellular interface is CGNAT announcing itself. And the classic symptom — 'the tunnel works, then dies after a quiet minute, then a packet un-sticks it' — is a NAT binding timing out and being re-created. On cellular, silence is not free.",
            label: "the quiet-minute bug",
          },
        ],
      },
      {
        id: "n14wl4",
        title: "IPv6-only mobile: NAT64, DNS64 & 464XLAT",
        est: "~13 min",
        blocks: [
          {
            p: "Carriers escaped the IPv4 shortage the other way too: many large mobile networks are now **IPv6-only** internally — your phone's interface may have *no real IPv4 address at all*. But half the internet still speaks only IPv4, so a translation apparatus fills the gap, and it's one your tunnel will meet in the field.",
          },
          {
            ul: [
              "**NAT64** — a gateway translating IPv6 packets to IPv4: v4 destinations are embedded inside a special v6 prefix (64:ff9b::/96), and the gateway rewrites headers between families.",
              "**DNS64** — the co-conspirator: when a name has no v6 address, the resolver *synthesizes* one by embedding the v4 address in the NAT64 prefix. The client thinks it's talking v6; the gateway un-lies on the wire.",
              "**464XLAT** — the fix for apps that speak raw IPv4: a **CLAT** translator on the phone presents a fake local IPv4 interface, translates v4 packets into v6 toward the NAT64 (the PLAT), which translates back to v4. IPv4 traffic crosses an IPv6-only network via two translations.",
            ],
          },
          {
            p: "Where it bites: DNS64 only works for connections made *by hostname*. An app — or a VPN config — that dials a raw **IPv4 literal** bypasses the synthesis and, without a CLAT, fails outright. This is why Apple requires apps to work on IPv6-only networks, and why your tunnel client (P01/P03) must handle: an endpoint configured as a v4 literal on a v6-only path, DNS inside the tunnel returning v4 answers, and dual-stack preference logic (Happy Eyeballs, N12) interacting with the tunnel's own routes.",
          },
          {
            note: "The robust posture for a tunnel endpoint is boring on purpose: publish the server under a hostname with both A and AAAA records, let the client connect over whichever family the network offers, and carry both families *inside* the tunnel regardless. WireGuard is indifferent to outer family (T03) — v4-in-v6 is a Tuesday. Exploit that.",
            label: "dual-stack outside and in",
          },
        ],
      },
      {
        id: "n14wl5",
        title: "Handoff, RRC & the battery bill",
        est: "~14 min",
        blocks: [
          {
            p: "The transition nobody schedules: walking out the front door. Wi-Fi fades, cellular takes over, and your device's addresses change *completely* — new interface, new IP, new NAT ancestry. TCP connections bound to the Wi-Fi address die; but WireGuard, identifying peers by public key rather than by IP:port (T03's cryptokey routing, previewed in N03), simply continues at the next authenticated packet from the new address. The roaming story that started with N03's ESS handoffs ends here, at its hardest case, with the same answer: identity above the network layer survives what the network layer cannot.",
          },
          {
            p: "The OS meanwhile plays its own games: iOS and Android *hold both radios* during transitions, prefer Wi-Fi even when it's the worse link ('sticky Wi-Fi'), and Apple's Wi-Fi Assist quietly shifts flows to cellular when Wi-Fi degrades. **MPTCP** (multipath TCP) formalizes using both at once for a single connection. Your client can't control this dance, but it must survive it — P01/P03's path-monitoring APIs exist precisely so a tunnel can react to path changes *before* users notice.",
          },
          {
            p: "Finally, the invoice: **RRC** (Radio Resource Control), the radio's state machine. Idle is cheap; Connected burns real power; and *every transition costs* — a single packet sent from idle drags the radio up through a signaling exchange and holds it in the high-power state for a tail of several seconds. Now recall the CGNAT lesson: keepalives must be frequent enough to hold NAT bindings. Each one wakes the radio. A 25-second keepalive can, alone, prevent the radio from ever resting — the tension between 'tunnel stays reachable' and 'phone lasts the day' is a genuine two-sided trade with no free answer.",
          },
          {
            note: "This is where network engineering becomes product engineering (S02): adaptive keepalives (aggressive when active, relaxed when idle), letting the platform's push mechanisms wake the app instead of polling, batching background traffic to share radio wake-ups. On mobile, every packet has a price in joules — the best mobile tunnel clients are the ones that learned to be quiet.",
            label: "joules per packet",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "n14we1",
        type: "match",
        title: "Cellular vocabulary lock-in",
        kind: "MATCH LAB",
        prompt:
          "Match each mobile-network term to what it denotes. These are the words behind every 'works on Wi-Fi, breaks on LTE' bug report.",
        pairs: [
          {
            t: "CGNAT",
            d: "Carrier-grade NAT — thousands of subscribers behind one public IP, no inbound, aggressive UDP timeouts",
          },
          {
            t: "100.64.0.0/10",
            d: "The shared address space whose presence on your interface announces CGNAT",
          },
          {
            t: "GTP",
            d: "The carrier's own tunnel: encapsulates your IP packets from tower to packet gateway, anchoring your address",
          },
          {
            t: "464XLAT",
            d: "On-device CLAT + network PLAT letting IPv4-only apps cross an IPv6-only carrier network",
          },
          {
            t: "DNS64",
            d: "Synthesizes fake AAAA records embedding v4 addresses, steering v6-only clients through NAT64",
          },
          {
            t: "RRC states",
            d: "The radio's idle/connected power ladder — why every keepalive has a battery cost",
          },
        ],
        why: "CGNAT and the 100.64/10 tell are daily diagnostics; GTP explains cellular mobility; 464XLAT/DNS64 explain IPv6-only breakage; RRC is the battery half of the keepalive trade.",
      },
      {
        id: "n14we2",
        type: "order",
        title: "Life of a packet on LTE",
        kind: "SEQUENCE LAB",
        prompt:
          "A phone on an LTE network (with CGNAT) sends a WireGuard packet to your server. Order the journey — and notice how much happens before 'the internet' is even involved.",
        items: [
          "WireGuard encrypts the inner packet; the UDP datagram is handed to the cellular interface",
          "The UE requests an uplink grant; the eNodeB schedules it specific time/frequency resources",
          "The frame is transmitted in its grant — no contention, no CSMA (unlike N03)",
          "The eNodeB encapsulates the IP packet in GTP and forwards it through the carrier core",
          "The packet gateway strips GTP; CGNAT rewrites the 100.64/10 source to a shared public IP:port",
          "Ordinary internet routing (N10) carries the datagram to the server, which replies to the CGNAT mapping",
        ],
        why: "Scheduled radio → GTP tunnel → CGNAT → internet. Three carrier-side stages your Wi-Fi mental model doesn't have, and each is a distinct failure domain when the tunnel misbehaves on mobile.",
      },
    ],
    quiz: {
      id: "n14wq",
      questions: [
        {
          q: "The fundamental medium-access difference between cellular and Wi-Fi is:",
          opts: [
            "Cellular uses stronger encryption on the air",
            "Cellular is scheduled — the base station grants every transmission — while Wi-Fi contends via CSMA/CA",
            "Cellular uses higher frequencies than Wi-Fi",
          ],
          a: 1,
          why: "Licensed spectrum lets the operator coordinate instead of contend: no collisions, no hidden nodes, graceful degradation under load — at the cost of a request-grant latency floor.",
        },
        {
          q: "Why does your phone's IP address survive ten tower handoffs on a drive across town?",
          opts: [
            "Each tower is configured with the same IP pool",
            "Your address is anchored at the packet gateway deep in the core; GTP tunnels are repointed from tower to tower beneath it",
            "The phone re-requests the same address via DHCP at each tower",
          ],
          a: 1,
          why: "Mobility is solved under IP: the RAN repoints the carrier's own tunnels while the gateway anchor holds your address still — encapsulation-with-an-anchor, the same architecture as your VPN.",
        },
        {
          q: "WireGuard's persistent keepalive (~25 s) exists chiefly because:",
          opts: [
            "The protocol requires regular rekeying",
            "CGNAT and similar middleboxes reap idle UDP mappings quickly — the keepalive refreshes the binding before it evaporates",
            "Cellular radios drop unencrypted idle links",
          ],
          a: 1,
          why: "An idle tunnel's NAT binding silently times out, and inbound packets then have no path — the 'works, then dies after a quiet minute' bug. The keepalive holds the door open; T04 covers the heavier machinery.",
        },
        {
          q: "On an IPv6-only carrier network without a CLAT, an app that connects to a hard-coded IPv4 literal will:",
          opts: [
            "Work fine — DNS64 translates the address",
            "Fail — DNS64 can only synthesize addresses during name resolution, and a literal never touches DNS",
            "Work, but at reduced speed",
          ],
          a: 1,
          why: "The NAT64/DNS64 illusion is built at the resolver. Bypass DNS and nothing embeds your v4 destination into the NAT64 prefix — which is why tunnel endpoints should be hostnames with A and AAAA records.",
        },
        {
          q: "A mobile VPN's keepalive interval is a genuine two-sided trade because:",
          opts: [
            "Shorter intervals weaken the encryption",
            "Keepalives must outpace CGNAT binding timeouts, but each one can drag the radio from RRC idle into its high-power state — reachability versus battery",
            "Carriers bill per keepalive packet",
          ],
          a: 1,
          why: "Too slow and the NAT mapping dies; too fast and the radio never rests, draining the battery. Adaptive keepalives and push-based wake-ups (S02) exist to soften exactly this tension.",
        },
      ],
    },
  },
];
