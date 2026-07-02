/* Rust track — idiomatic development & best practices, placed right after foundations */

export const RUST_IDIOM = [
  {
    id: "r05",
    code: "R02",
    title: "Idiomatic Rust: Types, Errors & APIs",
    layers: ["RS"],
    est: "~70 min",
    tag: "Make invalid states unrepresentable, design errors people can handle, and write APIs that feel like the standard library.",
    lessons: [
      {
        id: "r05l1",
        title: "Make invalid states unrepresentable",
        est: "~12 min",
        blocks: [
          {
            p: "R01 taught you what the compiler enforces; idiomatic Rust is about what you can *make* it enforce. The founding move is the **newtype**: `struct Port(u16);` costs nothing at runtime and makes it a compile error to pass a port where a peer index goes. In networking code — awash in u16s, u32s, and byte slices that all look identical — newtypes are the difference between `connect(peer, port)` and `connect(port, peer)` compiling equally happily.",
          },
          {
            p: "Enums do the same for state. A `struct Conn { connected: bool, handshaking: bool, key: Option<Key> }` has 2×2×2 shapes, most of them nonsense (handshaking *and* connected? connected with no key?). The idiomatic version enumerates only reality: `enum Conn { Idle, Handshaking { started: Instant }, Established { key: SessionKey } }` — and now `match` forces every caller to handle every real state and *cannot* handle the impossible ones. This is exactly how tunnel session state wants to be modeled (T03's timer machine is this enum wearing a uniform).",
          },
          {
            code: {
              lang: "rust",
              title: "typestate: the compiler as a state-machine cop",
              body: "struct Disconnected;\nstruct Established { key: SessionKey }\n\nstruct Tunnel<S> { peer: PeerKey, state: S }\n\nimpl Tunnel<Disconnected> {\n    // handshake CONSUMES the disconnected tunnel...\n    fn handshake(self, cfg: &Config) -> Result<Tunnel<Established>, HandshakeError> {\n        let key = noise_ik(&self.peer, cfg)?;\n        Ok(Tunnel { peer: self.peer, state: Established { key } })\n    }\n}\nimpl Tunnel<Established> {\n    // ...and send() simply does not exist on a disconnected tunnel\n    fn send(&mut self, pkt: &[u8]) -> Result<(), SendError> {\n        /* seal with self.state.key */ Ok(())\n    }\n}",
            },
          },
          {
            p: "The **typestate** pattern encodes the state *in the type parameter*, so calling `send()` before `handshake()` isn't a bug you catch in review — it's code that doesn't compile. Use it where the state machine is small and the stakes are high (handshakes, raw-config → validated-config); use plain enums where states are many or dynamic. Both beat booleans, every time.",
          },
        ],
      },
      {
        id: "r05l2",
        title: "Conversions & trait etiquette",
        est: "~12 min",
        blocks: [
          {
            p: "Idiomatic APIs speak the standard vocabulary. **From/Into** for infallible conversions (`impl From<[u8; 32]> for PeerKey` — `Into` comes free); **TryFrom** for fallible ones, which in this course means *parsing*: `TryFrom<&[u8]> for WgHeader` is the honest signature, because bytes off the wire can always be garbage (R04's hostile-input rule, expressed as a trait). **FromStr** for text (`\"10.0.0.1:51820\".parse::<Endpoint>()`), **Display** for humans, **Debug** for you — derive Debug on everything *except* key material, where you hand-write it to redact (`PeerKey(****)`) so secrets can't leak through a log line (S03's tracing spans will thank you).",
          },
          {
            p: "Borrow generously at the boundary: take `&[u8]` not `Vec<u8>`, `&str` not `String`, or `impl AsRef<[u8]>` when callers may hold either — the API promise is 'I look at your bytes, I don't take them.' Return owned data, or on hot paths write into a caller-provided `&mut [u8]` — the boringtun signature you'll meet in T03, and now you know *why* it looks like that. And implement the cheap standard traits (`Clone`, `PartialEq`, `Eq`, `Hash`) wherever they're semantically true; their absence is friction every downstream user pays forever.",
          },
          {
            p: "For construction, the **builder** is the idiomatic answer to config-shaped problems: `TunnelConfig::builder().peer(k).endpoint(e).keepalive(25).build()?` — optional fields without Option-soup arguments, validation concentrated in `build()`, returning the validated-config newtype from lesson 1. Two restraints to learn early: don't implement `Deref` to fake inheritance, and hide clever generics behind simple concrete entry points. The standard library's feel — small verbs, predictable traits, obvious ownership — *is* the style guide.",
          },
        ],
      },
      {
        id: "r05l3",
        title: "Error craft",
        est: "~12 min",
        blocks: [
          {
            p: 'Rust makes errors values; craft is deciding *which* values. The working doctrine: **libraries expose structured enums, binaries flatten to reports**. Inside `tunnel-core`, an error is API — callers must be able to *match* on it (`EngineError::HandshakeTimeout` triggers failover; `EngineError::ConfigRejected` must not) — so you define enums with **thiserror**, which writes the `Display` and `From` boilerplate. At the binary edge (the daemon\'s main, a CLI), nobody matches anymore; **anyhow** gives you one flexible `anyhow::Error`, `?` everywhere, and `.context("loading peer config")` to build the human story.',
          },
          {
            code: {
              lang: "rust",
              title: "library error, the shape you'll write weekly",
              body: '#[derive(Debug, thiserror::Error)]\npub enum EngineError {\n    #[error("handshake with {peer} timed out after {secs}s")]\n    HandshakeTimeout { peer: PeerId, secs: u64 },\n\n    #[error("endpoint DNS failed")]\n    Resolve(#[from] ResolveError),   // ? auto-converts via From\n\n    #[error("I/O")]\n    Io(#[from] std::io::Error),\n}\n// caller can now MATCH: retry on HandshakeTimeout, surface ConfigRejected',
            },
          },
          {
            p: 'The discipline that goes with it: **panics are for bugs, errors are for weather**. Network failures, bad configs, hostile packets — weather; they get `Result`. Violated internal invariants — bugs; `panic!`/`assert!` loudly in debug, and `unwrap()` is banned on any path a packet can reach (clippy can enforce it). When an invariant genuinely holds, `expect("index checked above")` documents *why*. And resist stringly-typed errors (`Err("failed".into())`) — the moment someone needs to react differently to timeout vs rejection, a string is a wall. Errors are the half of your API people meet on their worst day; design them with the same care as the happy path.',
          },
        ],
      },
      {
        id: "r05l4",
        title: "Iterators, slices & zero-cost habits",
        est: "~12 min",
        blocks: [
          {
            p: "Idiomatic Rust leans on **iterators** not because they're fashionable but because they're *checked and free*: `packets.iter().filter(|p| p.is_data()).map(seal)` compiles to the same machine code as the index loop, minus the off-by-one opportunities, and bounds checks optimize away. Habits that mark seasoned code: `collect()` only when you truly need the allocation (often the consumer takes `impl Iterator`); `iter().copied()`/`cloned()` made explicit so copies are visible; `chunks_exact(16)` and `split_at` for packet field carving instead of manual index math.",
          },
          {
            p: "Allocation awareness without paranoia: in a packet loop, the crime isn't allocating — it's allocating *per packet* (R04's buffer-reuse lesson earns its 18% here). `Vec::with_capacity` when sizes are knowable; reused scratch buffers on hot paths; `Cow<[u8]>` when a function *sometimes* rewrites (borrow when unchanged, own when modified); and `Bytes`/`BytesMut` from the ecosystem when multiple owners need slices of one buffer (T01's packet pipeline). Measure before optimizing — criterion, not vibes — but *design* APIs so the fast version is possible: a function that takes `&mut [u8]` can be given a reused buffer; one that returns `Vec<u8>` has already decided to allocate.",
          },
          {
            p: "Last habit: let **clippy be your style mentor** (R05 makes it a CI gate; here it's a teacher). It will flag the `for i in 0..v.len()` that wants to be an iterator, the `&String` argument that wants `&str`, the `match` that wants `if let`, the manual `map_or` chains. Early on, read every lint's explanation — they encode this entire lesson. The goal of this module isn't cleverness; it's writing the Rust that the *next* engineer (or you, at 3 a.m., mid-incident in S03) reads without translation.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "r05e1",
        type: "blank",
        title: "Parse hostile bytes idiomatically",
        kind: "CODE LAB",
        prompt:
          "Complete this wire-format parser so it uses the standard fallible-conversion trait, structured errors, and slice carving — no panics reachable from network input.",
        code: 'impl §0§<&[u8]> for Handshake {\n    type Error = ParseError;\n    fn try_from(b: &[u8]) -> Result<Self, Self::Error> {\n        if b.len() < 148 {\n            return Err(ParseError::§1§ { got: b.len(), need: 148 });\n        }\n        let (head, rest) = b.§2§(4);\n        let kind = u32::from_le_bytes(head.try_into().expect("length checked above"));\n        Ok(Handshake { kind, body: rest.to_vec() })\n    }\n}',
        blanks: [
          { opts: ["TryFrom", "From", "Into"], a: 0 },
          { opts: ["TooShort", "panic", "Unknown"], a: 0 },
          { opts: ["split_at", "get_unchecked", "as_ptr"], a: 0 },
        ],
        why: "TryFrom is the trait for conversions that can fail — parsing is its home turf. A structured TooShort variant lets callers react (and log lengths); split_at after an explicit length check carves fields safely — and note the expect() documents an invariant the code just established, which is the one place it belongs.",
      },
      {
        id: "r05e2",
        type: "match",
        title: "Idiom or anti-pattern?",
        kind: "MATCH LAB",
        prompt: "Match each API decision to the professional verdict.",
        pairs: [
          {
            t: "fn seal(&mut self, buf: &mut [u8])",
            d: "Idiomatic hot path — caller controls allocation, buffers get reused",
          },
          {
            t: "struct Conn { open: bool, ready: bool }",
            d: "Anti-pattern — boolean soup encodes impossible states; wants an enum",
          },
          {
            t: "unwrap() on a packet parse in the data path",
            d: "Anti-pattern — hostile input is weather, not a bug; return a Result",
          },
          {
            t: "impl Debug for PrivateKey that prints ****",
            d: "Idiomatic — derive everywhere except secrets, which redact by hand",
          },
          {
            t: "pub fn connect(s: String, p: u16, r: u16, t: u64)",
            d: "Anti-pattern — positional primitive soup; wants newtypes and a builder",
          },
        ],
        why: "Five decisions you'll face in your client's first week. The &mut [u8] signature is boringtun's own; the redacting Debug is what keeps keys out of tracing output.",
      },
    ],
    quiz: {
      id: "r05q",
      questions: [
        {
          q: "Why prefer enum Conn { Idle, Established { key: SessionKey } } over struct Conn { connected: bool, key: Option<SessionKey> }?",
          opts: [
            "Enums use less memory",
            "The enum makes 'connected but no key' unrepresentable — match forces handling of exactly the real states",
            "Option is slow",
          ],
          a: 1,
          why: "The struct has four shapes, two of them lies. Type design is bug prevention you don't have to remember to do.",
        },
        {
          q: "Your library's callers need to retry on timeout but surface config rejections. What does that requirement dictate?",
          opts: [
            "Log messages with different words",
            "A structured error enum (thiserror-style) with distinct variants callers can match on — not a string or one opaque error",
            "Return error codes as integers",
          ],
          a: 1,
          why: "Errors callers must *react to differently* are API. anyhow-style opaque errors belong at the binary edge where nobody matches anymore.",
        },
        {
          q: "When is unwrap() acceptable in production networking code?",
          opts: [
            "Whenever you're confident",
            'Only for invariants the surrounding code has just established — better written as expect("why") — and never on values derived from network input',
            "Never, under any circumstances",
          ],
          a: 1,
          why: "Panics are for bugs, errors are for weather. Length-checked-then-converted is an invariant; 'the peer sent valid bytes' is a hope.",
        },
        {
          q: "A function returns Vec<u8> per packet and profiling shows allocation dominating. The idiomatic fix?",
          opts: [
            "Switch to unsafe pointers",
            "Change the signature to write into a caller-provided &mut [u8] so buffers can be reused across packets",
            "Add more threads",
          ],
          a: 1,
          why: "APIs decide what performance is possible. The write-into-slice shape is why boringtun's encapsulate looks the way it does.",
        },
      ],
    },
  },
];
