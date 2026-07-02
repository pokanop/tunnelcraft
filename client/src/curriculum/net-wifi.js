/* Networking fundamentals — Wi-Fi / 802.11: the wireless link layer.
   Slots into the NET track at N03, right after N02 (Wires, Frames & Switches),
   because it builds directly on half-duplex media, Ethernet framing, and ARP. */

export const NET_WIFI = [
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
            p: "Only now does the security handshake run (next lesson), and only after *that* do the L3 rituals you already know begin: DHCP for an address, ARP to find the gateway (N02), and you're routing. The whole 'connecting…' spinner is this sequence: scan → auth → associate → key handshake → DHCP → gateway ARP. Every one of those steps is a place it can stall, which is exactly why Wi-Fi 'connected but no internet' has so many distinct causes.",
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
];
