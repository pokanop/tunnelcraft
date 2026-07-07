import type { Module } from "./types";

/* Rust track — new module: the professional toolbelt */

export const RUST_EXTRA: Module[] = [
  {
    id: "r04",
    code: "R07",
    title: "The Professional Rust Toolbelt",
    layers: ["RS"],
    est: "~55 min",
    tag: "Workspaces, the testing pyramid, lints and CI gates, and the tracing/profiling stack — shipping-grade habits.",
    lessons: [
      {
        id: "r04l1",
        title: "Workspaces & features",
        est: "~12 min",
        blocks: [
          {
            p: "A real client is not one crate. A **workspace** — one root `Cargo.toml` listing member crates, one shared lockfile and target directory — is how you enforce the architecture you designed in S02 with the compiler instead of a wiki: `tunnel-core` (protocol, dispatch — no I/O assumptions), `tunnel-engines` (WireGuard, MASQUE implementations), `tunnel-daemon` (tokio, sockets, platform glue), `tunnel-ffi` (the uniffi shell boundary). If `core` can't even *depend* on the daemon, layering violations become compile errors.",
          },
          {
            code: {
              lang: "rust",
              title: "workspace Cargo.toml",
              body: '[workspace]\nmembers = ["tunnel-core", "tunnel-engines", "tunnel-daemon", "tunnel-ffi"]\nresolver = "2"\n\n[workspace.dependencies]      # one version, declared once\ntokio = { version = "1", features = ["rt-multi-thread", "net", "time"] }\nthiserror = "2"\ntracing = "0.1"\n\n[profile.release]\nlto = "thin"\ncodegen-units = 1',
            },
          },
          {
            p: "**Features** are conditional compilation as API: `default = []`, plus flags like `wireguard`, `masque`, `mock-engines`. Two disciplines keep them sane: features must be **additive** (any combination compiles — cargo unifies features across a build, so a 'turn things off' feature breaks someone eventually), and platform-specific code hides behind `#[cfg(target_os = \"linux\")]` rather than features, because the target *is* the condition. Mobile builds that exclude the daemon, test builds that swap in MockEngine — all of it is feature plumbing.",
          },
        ],
      },
      {
        id: "r04l2",
        title: "The testing pyramid, Rust edition",
        est: "~12 min",
        blocks: [
          {
            p: "Unit tests live in-file in a `#[cfg(test)] mod tests` — compiled only for tests, with private access, zero runtime cost in shipping code. **Integration tests** live in `tests/` as separate crates seeing only your public API — which makes them an honesty check on that API: if a workflow is awkward to test from `tests/`, it's awkward for users. Async tests are just `#[tokio::test]`, and tokio's **paused time** (`start_paused = true`) lets you test T03's 120-second rekey timers in microseconds: `tokio::time::advance(Duration::from_secs(121)).await` and assert the handshake fired.",
          },
          {
            p: "**Property tests** (proptest) generate hostile inputs against invariants — you met the pattern in S03 (`decode(encode(x)) == x`, 'random bytes never panic'); the professional habit is reaching for it every time you write a parser, codec, or state machine, and letting the shrinker hand you the *minimal* failing case. **Criterion** benchmarks give you statistics instead of vibes (`cargo bench`), which is what lets you say 'the R04 buffer-reuse change bought 18%' with a straight face.",
          },
          {
            code: {
              lang: "rust",
              title: "Packet-path benchmark with criterion (teaching sketch)",
              body: `use criterion::{black_box, criterion_group, criterion_main, Criterion, Throughput};

fn bench_extract_payload(c: &mut Criterion) {
    let mut group = c.benchmark_group("payload_bytes");
    for size in [1280usize, 4096] {
        let data = vec![0u8; size];
        group.throughput(Throughput::Bytes(size as u64));
        group.bench_with_input(format!("{size}"), &data, |b, data| {
            b.iter(|| black_box(extract_payload(black_box(data))))
        });
    }
    group.finish();
}

// Teaching stub — swap for your real zero-copy accessor.
fn extract_payload(buf: &[u8]) -> &[u8] {
    &buf[24..] // skip a fixed header region
}

criterion_group!(benches, bench_extract_payload);
criterion_main!(benches);`,
            },
          },
          {
            note: "**PRODUCTION ANCHOR** — [EasyTier](https://github.com/EasyTier/EasyTier) (LGPL-3.0) ships criterion benches such as `packet_bytes_extraction` that compare `payload_bytes()` vs `tunnel_payload_bytes()` at 1280- and 4096-byte MTUs — the same shape as above. Run with `cargo bench`; tune warmup and sample size when CI time matters.",
            label: "PRODUCTION ANCHOR",
          },
          {
            code: {
              lang: "rust",
              title: "paused time: testing timers without waiting",
              body: '#[tokio::test(start_paused = true)]\nasync fn rekey_fires_at_120s() {\n    let mut peer = test_peer();\n    tokio::time::advance(Duration::from_secs(121)).await;\n    let out = peer.tunn_update(&mut buf);\n    assert!(matches!(out, TunnResult::WriteToNetwork(_)), "expected handshake initiation");\n}',
            },
          },
        ],
      },
      {
        id: "r04l3",
        title: "Lints, audits & CI gates",
        est: "~12 min",
        blocks: [
          {
            p: "**clippy** is a senior reviewer that never tires: `cargo clippy -- -D warnings` in CI turns its advice into gates. Allow specific lints *locally with a reason* (`#[allow(clippy::too_many_arguments)] // builder pending`) rather than globally — the annotations become a map of acknowledged debt. **rustfmt** ends formatting discussions permanently; `cargo fmt --check` in CI, never argue about braces again.",
          },
          {
            p: "Supply-chain gates matter double for security software: **cargo audit** checks your lockfile against the RustSec advisory database; **cargo deny** enforces policy — licenses you accept, crates you ban, duplicate-version budgets. Declare an **MSRV** (minimum supported Rust version) in `Cargo.toml` and test it in CI, because 'works on my nightly' is not a release criterion.",
          },
          {
            p: "A shippable pipeline in one breath: `fmt --check` → `clippy -D warnings` → `test --workspace` → `audit` / `deny` → build the release matrix (Linux/macOS/Windows targets — S01's platforms) → package. Every gate is one of this lesson's tools; every gate that's missing is a class of regression you've chosen to ship.",
          },
          {
            diagram: {
              kind: "flow",
              title: "the CI gauntlet",
              caption:
                "Each gate is one tool from this lesson; each missing gate is a class of regression you've chosen to ship.",
              nodes: [
                { label: "fmt --check", sub: "style", tone: "dim" },
                { label: "clippy", sub: "-D warnings", tone: "acc" },
                { label: "test", sub: "--workspace" },
                { label: "audit + deny", sub: "supply chain" },
                { label: "release build", sub: "3-OS matrix", tone: "ok" },
              ],
            },
          },
        ],
      },
      {
        id: "r04l4",
        title: "Seeing inside: tracing & profiling",
        est: "~12 min",
        blocks: [
          {
            p: "`println!` debugging dies at the first concurrent packet loop. The **tracing** crate gives you structured, async-aware telemetry: **spans** wrap units of work (a handshake, a Flow decision) and **events** log within them, carrying typed fields instead of prose. Because spans nest across `.await` points correctly, 'which flow did this log line belong to?' — unanswerable with println in R03's spawn-per-connection world — becomes a field on every line. This is also the substrate of S03's observability lesson: the spans you write here are the flow telemetry defenders read there (N17).",
          },
          {
            code: {
              lang: "rust",
              title: "spans that survive .await",
              body: '#[tracing::instrument(skip(flow), fields(dst = %flow.five_tuple.dst))]\nasync fn dispatch(flow: Flow) -> Result<(), EngineError> {\n    let engine = route(&flow)?;\n    tracing::info!(engine = engine.name(), "flow routed");\n    engine.open(flow).await\n}\n// RUST_LOG=tunnel_core=debug cargo run   → filtered, structured, per-flow',
            },
          },
          {
            p: "When the question is *where the time goes*: **tokio-console** is `top` for your async runtime — tasks, wakes, and the poll that's been busy 80 ms (a hidden blocking call starving the executor, R03's cardinal sin, caught red-handed); **flamegraphs** (`cargo flamegraph`) answer CPU questions like 'is encryption or copying the hot path?'. And for the unsafe corners every FFI boundary (S01) forces on you: **Miri** interprets your tests hunting undefined behavior, and the **sanitizers** (ASan, TSan) catch what reviews miss. The theme of the whole module: professionals don't guess — they instrument, measure, and gate.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "r04e1",
        type: "blank",
        title: "Wire up a timer test",
        kind: "CODE LAB",
        prompt:
          "Complete this test so it verifies keepalive behavior instantly instead of waiting 25 real seconds.",
        code: "#[tokio::test(§0§ = true)]\nasync fn keepalive_fires() {\n    let mut peer = test_peer_with_keepalive(25);\n    tokio::time::§1§(Duration::from_secs(26)).await;\n    let out = peer.tunn_update(&mut buf);\n    §2§!(matches!(out, TunnResult::WriteToNetwork(_)));\n}",
        blanks: [
          { opts: ["start_paused", "flavor", "worker_threads"], a: 0 },
          { opts: ["advance", "sleep", "interval"], a: 0 },
          { opts: ["assert", "panic", "todo"], a: 0 },
        ],
        why: "start_paused freezes tokio's clock; advance() teleports it. sleep() would still work under paused time (it auto-advances) but advance is explicit about intent — and assert! is the plain macro that takes any boolean, matches! included.",
      },
    ],
    quiz: {
      id: "r04q",
      questions: [
        {
          q: "Why should cargo features be additive?",
          opts: [
            "Cargo refuses subtractive names",
            "Feature unification: cargo merges the features every dependent requests, so a feature that removes behavior breaks whichever crate didn't ask for it",
            "Additive features compile faster",
          ],
          a: 1,
          why: "Your crate is built once with the union of requested features. 'no-std-only' style toggles that subtract capability are the classic ecosystem footgun.",
        },
        {
          q: "What can integration tests in tests/ verify that unit tests structurally cannot?",
          opts: [
            "Async code",
            "That your public API alone supports real workflows — they compile as external crates with no private access",
            "Performance",
          ],
          a: 1,
          why: "They are your first external user. Friction there is API design feedback, not test-writing difficulty.",
        },
        {
          q: "tokio-console shows one task's poll running for 80 ms. The diagnosis?",
          opts: [
            "The task is high priority",
            "Something inside it blocks synchronously — a poll should return in microseconds, and a long poll starves every task on that worker",
            "Normal for network tasks",
          ],
          a: 1,
          why: "R03's rule made visible: blocking in async freezes the thread's whole cohort. Move it to spawn_blocking or make it truly async.",
        },
      ],
    },
  },
];
