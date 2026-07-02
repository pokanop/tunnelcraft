import type { Module } from "./types";

/* Rust track — unsafe, FFI & atomics: R05 name-dropped Miri and the
   sanitizers in one breath; this module is the deep dive. Your core is
   driven from Swift, Kotlin, and C++ shells, which makes FFI — and the
   unsafe Rust underneath it — a daily reality, not an exotic corner. */

export const RUST_UNSAFE: Module[] = [
  {
    id: "r07",
    code: "R06",
    title: "Unsafe, FFI & Atomics: The Bottom of the Stack",
    layers: ["RS", "XP"],
    est: "~85 min",
    tag: "The aliasing rules raw pointers still obey, what Send and Sync actually claim, memory orderings you can defend in review, and a C ABI that lets Swift, Kotlin, and C++ drive your Rust core without crashing it.",
    lessons: [
      {
        id: "r07l1",
        title: "What unsafe actually unlocks",
        est: "~12 min",
        blocks: [
          {
            p: "Your Rust core does not run alone. On iOS a Swift `NEPacketTunnelProvider` drives it, on Android a Kotlin `VpnService`, on desktop a C++ shell (S01's platform matrix, T01's handed-to-you file descriptors) — and every one of those calls crosses a boundary the compiler cannot see across. That boundary is spelled `unsafe`. Most Rust programmers can avoid the keyword for years; a VPN-client engineer cannot. So this module's goal is not to make unsafe rare in your codebase — FFI already decided that — but to make it **rigorous**: small, documented, tool-checked, and boring.",
          },
          {
            p: "First, demolish the folklore. `unsafe` is not 'trust me' mode, and it does not relax the language. An `unsafe` block unlocks **exactly five** extra operations — the five things the compiler cannot verify for you:",
          },
          {
            ul: [
              "**Dereference a raw pointer** (`*const T` / `*mut T`) — the compiler can't know it's valid, aligned, and in bounds.",
              '**Call an `unsafe` function** — including every `extern "C"` foreign function, whose body the compiler never saw.',
              "**Implement an `unsafe` trait** — like `Send` or `Sync`, where the claim itself is unverifiable (lesson 3).",
              "**Access or mutate a `static mut`** — a global with no owner and no lock.",
              "**Access a field of a `union`** — the compiler can't know which variant the bytes currently are.",
            ],
          },
          {
            p: "Everything else is **unchanged**. The borrow checker still runs inside an unsafe block: two `&mut` to the same buffer is still a compile error, moves are still tracked, types are still enforced, bounds checks still fire on slice indexing. `unsafe` does not turn anything off — it turns five things *on*, and quietly shifts the proof obligation for those five from the compiler to you.",
          },
          {
            code: {
              lang: "rust",
              title: "the compiler is still watching",
              run: true,
              body: `fn main() {
    let mut buf = [0u8; 4];
    let p = buf.as_mut_ptr();
    // SAFETY: p comes from \`buf\` above, both writes are in bounds,
    // and no reference to \`buf\` is live while we write through it.
    unsafe {
        *p.add(0) = 0x45; // version/IHL byte of an IPv4 header
        *p.add(1) = 0x00;
    }
    println!("{buf:02x?}");

    // The borrow checker is still on duty inside \`unsafe\`:
    // let a = &mut buf;
    // let b = &mut buf;   // error[E0499] — unsafe or not
}`,
            },
          },
          {
            p: "Two words you must keep apart: **safety** and **soundness**. A safe API is *sound* if no safe caller — however creative, however adversarial — can trigger undefined behavior through it. An `unsafe fn` with documented preconditions is honest: it says 'you carry the proof.' A *safe* function that can hit UB for some input is **unsound**: a lie in the type system, and the lie is contagious, because every caller believed the signature. Unsoundness is a bug even if nothing crashes today.",
          },
          {
            p: "And what you're guarding against — **undefined behavior** — is not 'a crash'. UB is a broken promise to the optimizer: the compiler is entitled to assume these things never happen, and it optimizes accordingly, so the failure mode is deleted null checks, reordered writes, and code that works in debug, on x86, until Tuesday. The core UB catalog:",
          },
          {
            ul: [
              "**Data races** — unsynchronized concurrent access with a write (lesson 4's whole reason to exist).",
              "**Aliasing violations** — mutating through a shared reference, or two live `&mut` to one place, however you manufactured them (lesson 2).",
              "**Invalid values** — a `bool` holding 3, an uninitialized integer, a dangling or null reference, a non-UTF-8 `str`.",
              "**Out-of-bounds access** — reading or writing past an allocation through a raw pointer.",
            ],
          },
          {
            p: "The discipline that makes all of this manageable: the **smallest possible unsafe block**, wrapped in a **safe API**, with the invariants **written down**. The soundness boundary is the module, not the block — `Vec`'s single unsafe `set_len` can be broken by *safe* code in the same module scribbling on `len`, which is why privacy is a safety tool. Your `tunnel-ffi` crate (S02) is exactly this pattern at architectural scale: a thin, auditable unsafe rind around a safe core.",
          },
          {
            note: "An early build parsed IPv4 headers with a 'safe-looking' pointer cast: take `&buf[..20]`, cast to a header struct, read `u32` fields in place. It passed every test — on x86 laptops, which shrug at unaligned loads. On a customer's ARM Android build the same read was UB: sometimes a SIGBUS, sometimes silently wrong checksums on encrypted packets. Nothing in the diff had touched parsing for months. The fix was `read_unaligned` plus Miri in CI — which flags the bad cast on the first run, on any host.",
            label: "FIELD NOTE",
          },
        ],
      },
      {
        id: "r07l2",
        title: "Aliasing: the rules the borrow checker was enforcing",
        est: "~13 min",
        blocks: [
          {
            p: "R01 taught the law as ergonomics: many `&T` **or** one `&mut T`, never both. Now the real reason. `&T` means *shared and immutable for its entire lifetime*; `&mut T` means *unique — no other path to this memory exists while I live*. These are not bookkeeping conventions. The compiler hands them to the optimizer as facts (`noalias` and read-only attributes on LLVM parameters), and the optimizer **spends** them: it caches values read through `&T` in registers, reorders stores around `&mut T`, deletes writes it can prove nobody could legally observe.",
          },
          {
            p: "Raw pointers escape the *checker* — not the *rules*. When you write `as *mut u64`, the borrow checker stops watching; the promises attached to every reference in the neighborhood remain in force. This is the single most important sentence in the module: **the aliasing rules are defined by which references exist and how memory is used, not by which tool verified you.**",
          },
          {
            code: {
              lang: "rust",
              title: "compiles clean — miscompiles legally",
              body: `fn peek_and_poke(x: &u64) -> u64 {
    let p = x as *const u64 as *mut u64;
    // The borrow checker has no objection. The optimizer does:
    // \`x: &u64\` promised this memory is immutable while x lives.
    unsafe { *p = 7 }   // UB: write through a pointer derived from &T
    *x                  // may return 7, may return the old value —
                        // the compiler already 'knows' *x didn't change
}`,
            },
          },
          {
            p: "Walk through what the optimizer is *allowed* to do there. `x` is a shared reference, so the parameter is marked read-only and non-aliased; the compiler may load `*x` once, early, and return that cached value — your write through `p` happened on hardware but is invisible to the returned result. Change the optimization level and the answer changes. That inconsistency across `-O` levels is the classic signature of aliasing UB: not a crash, just two builds of your VPN client disagreeing about a session counter.",
          },
          {
            p: "How does Rust *define* which raw-pointer dances are legal? The operational model is **Stacked Borrows** (and its successor under adoption, **Tree Borrows**). Plain-language version: every memory location carries a stack of currently-valid borrows. Deriving a new reference or pointer pushes onto the stack; *using* an older one pops everything above it — those derived pointers are now dead. A raw pointer derived from `&T` carries read-only permission; writing through it is using a permission that was never on the stack. Tree Borrows refines the edge cases (a tree instead of a stack, more two-phase-borrow patterns allowed), but the moral survives any refinement: **your raw-pointer code must behave as if the references' promises were still being enforced** — because the optimizer never stopped believing them.",
          },
          {
            p: "There is exactly one blessed hole: **`UnsafeCell<T>`**. It is the only legal way to mutate memory reachable through a shared reference — `&UnsafeCell<T>` formally withdraws the immutability promise, and the compiler stops making aliasing assumptions about its contents. Every interior-mutability type you already use is this cell wearing a costume: `Cell` adds copy-in/copy-out, `RefCell` adds runtime borrow flags, `Mutex` adds a lock, the atomics add hardware ordering. When lesson 5 builds a spinlock, `UnsafeCell` is the vault and the atomic is the door.",
          },
          {
            code: {
              lang: "rust",
              title: "the one blessed hole",
              body: `use std::cell::UnsafeCell;

struct Counters {
    tx: UnsafeCell<u64>,   // mutable through &Counters — legally
}

impl Counters {
    fn bump(&self) {
        // .get() hands out *mut u64 from &self. Legal to write through —
        // but UnsafeCell only lifts the *aliasing* rule. Exclusion is now
        // YOUR job: two threads here is still a data race, still UB.
        unsafe { *self.tx.get() += 1 }
    }
}`,
            },
          },
          {
            p: "You cannot review your way to confidence about this. The referee is **Miri**: `cargo +nightly miri test` runs your tests inside an interpreter with the aliasing model fully instrumented — every retag, every stack, every pointer's provenance tracked. It catches aliasing violations, use-after-free, out-of-bounds, invalid values, and leaks, with a diagnostic that names the exact borrow that died. It's slow (an interpreter, easily 100×) and it cannot execute foreign code — your C and Swift neighbors are invisible to it, which is why lesson 7 adds sanitizers for the linked artifact.",
          },
          {
            code: {
              lang: "sh",
              title: "the referee",
              body: `rustup +nightly component add miri
cargo +nightly miri test -p tunnel-core
# error: Undefined Behavior: attempting a write access using <untagged>
#        at alloc1729[0x0], but that tag does not exist in the borrow
#        stack for this location
#   --> src/parse.rs:41:14   <- the exact line, on any host CPU`,
            },
          },
          {
            note: "Treat a Miri finding exactly like a failing test, even when the shipped binary 'works'. UB that happens to behave is a loan from the optimizer, and toolchain upgrades are the margin call — the parser field note in lesson 1 was six months of accrued interest.",
            label: "FIELD NOTE",
          },
        ],
      },
      {
        id: "r07l3",
        title: "Send & Sync: what the auto traits actually say",
        est: "~12 min",
        blocks: [
          {
            p: "Two traits carry Rust's entire thread-safety story, and both are just declarations — no methods, no code. **`Send`**: a value of this type can be *moved* to another thread and used there. **`Sync`**: a `&T` can be *shared* across threads — formally, `T: Sync` **if and only if** `&T: Send`. Read that second definition twice; it is the whole trait. Sync doesn't mean 'has locks' or 'is atomic' — it means handing out shared references across threads can't cause UB.",
          },
          {
            p: "They're **auto traits**, derived structurally: a struct is `Send` iff every field is `Send`, `Sync` iff every field is `Sync`. You never implement them for ordinary types — composition does. This is also why the compile errors are so baroque: when `tokio::spawn` refuses your future, the diagnostic names some `Rc<Session>` buried three structs deep, because that one field poisoned the derivation for everything containing it.",
          },
          {
            p: "The negative examples teach the definitions. **`Rc<T>` is `!Send`** because its reference count is a plain integer: move a clone to another thread and two threads increment/decrement without synchronization — a data race on the count, then a premature free or a leak. `Arc` is exactly that count made atomic, and the price is exactly the atomic operations. **`RefCell<T>` is `!Sync`** because its borrow flags are non-atomic: two threads calling `borrow_mut()` through shared references can both see 'not borrowed', both succeed, and hand out two `&mut` — the cardinal aliasing violation from lesson 2. `Mutex` is `RefCell`'s thread-safe sibling: same dynamic-exclusivity idea, flag replaced by a real lock.",
          },
          {
            tbl: {
              head: ["Type", "Send?", "Sync?", "Why"],
              rows: [
                ["Rc<T>", "no", "no", "Non-atomic refcount — racing clones corrupt the count"],
                ["Arc<T>", "yes*", "yes*", "Atomic refcount (*needs T: Send + Sync)"],
                [
                  "RefCell<T>",
                  "yes*",
                  "no",
                  "Non-atomic borrow flags; fine to move, lethal to share",
                ],
                ["Mutex<T>", "yes*", "yes*", "Real lock enforces exclusivity (*needs T: Send)"],
                ["MutexGuard<'_, T>", "no", "yes*", "OS mutexes must unlock on the locking thread"],
                ["*const T / *mut T", "no", "no", "A tripwire, not a barrier — see below"],
              ],
            },
          },
          {
            p: "That `MutexGuard` row is a production trap, not trivia. Platform mutexes (pthread and kin) require unlock to happen **on the thread that locked** — unlocking from elsewhere is UB in the C library. The guard unlocks in its `Drop`, so the guard must never change threads: `!Send`. Now connect it to R03: a future holding a `std::sync::MutexGuard` across an `.await` can be *paused and resumed on a different worker thread* by tokio's work-stealing scheduler. That would move the guard between threads — so the future is `!Send`, and `tokio::spawn` rejects it at compile time. The fix is either scoping the guard to end before the `.await`, or `tokio::sync::Mutex`, whose guard is designed to be `Send`.",
          },
          {
            code: {
              lang: "rust",
              title: "the guard-across-await trap",
              body: `async fn flush_stats(stats: &std::sync::Mutex<Stats>, tx: &Sender) {
    let guard = stats.lock().unwrap();
    tx.send(guard.snapshot()).await;   // guard is alive across .await:
    // error: future cannot be sent between threads safely
    // note: MutexGuard<'_, Stats> is not \`Send\`
}

async fn flush_stats_fixed(stats: &std::sync::Mutex<Stats>, tx: &Sender) {
    let snap = stats.lock().unwrap().snapshot();  // guard dies here
    tx.send(snap).await;                          // future is Send again
}`,
            },
          },
          {
            p: "`unsafe impl Send for X {}` means precisely: **'I checked the thing the compiler couldn't.'** The auto-derivation is conservative — it stops at the first raw pointer because a raw pointer *might* be shared with someone else. If you know it isn't (it points into an allocation your type exclusively owns and frees), the impl is correct and necessary. The claim is unverifiable by construction, which is why the trait is `unsafe` to implement — and why the impl deserves a `SAFETY:` comment stating the argument, not just the assertion.",
          },
          {
            code: {
              lang: "rust",
              title: "signing the claim the compiler couldn't check",
              body: `/// Owned view over a wintun ring buffer (T01's Windows I/O model).
pub struct RingHandle {
    base: *mut u8,     // -> auto-derivation stops here
    len: usize,
    session: isize,    // driver session that owns the mapping
}

// SAFETY: \`base\` points into a mapping owned exclusively by \`session\`,
// which this struct owns and closes in Drop. No other alias exists,
// and the driver documents the ring as safe to use from any one thread
// at a time. Moving the whole handle to another thread is therefore fine.
unsafe impl Send for RingHandle {}
// Deliberately NOT Sync: concurrent shared access is not part of the deal.`,
            },
          },
          {
            p: "The mirror-image tools: to opt **out**, embed `PhantomData<*const ()>` — zero size, but it makes the containing type `!Send + !Sync`, which is how you pin a handle to the thread that created it (plenty of OS APIs demand this). And understand what raw pointers being `!Send`/`!Sync` really is: a **tripwire, not a barrier**. Nothing stops you from writing the `unsafe impl` — the default exists so that a human being must sign the claim, in a line of code reviewers can find, instead of the compiler guessing.",
          },
          {
            note: "A Kotlin-side crash that only hit some Samsung devices traced to a Rust struct that had stored a JNI `JNIEnv` pointer and been marked `unsafe impl Send` 'because it's just a pointer'. A `JNIEnv` is thread-local by contract — using it from a Rust worker thread is exactly the unverifiable claim the impl signed, falsely. The compiler had flagged it; a human overrode it. `unsafe impl Send` is a legal document: check the *foreign* API's threading contract, not just your own fields.",
            label: "FIELD NOTE",
          },
        ],
      },
      {
        id: "r07l4",
        title: "Atomics & memory ordering, part 1: the model",
        est: "~13 min",
        blocks: [
          {
            p: "Start from the law: a **data race** — two threads accessing the same location, at least one writing, with no synchronization — is **undefined behavior**. Not 'you might read a stale value': UB, the full lesson-1 kind, because the optimizer compiles every thread assuming no other thread is interleaving with its plain loads and stores. **Atomics are the escape hatch**: an atomic operation is indivisible and participates in the memory model, so concurrent atomic access to the same location is always *defined* — the only question left is what it guarantees.",
          },
          {
            p: "And that question splits into two products people constantly conflate. **Atomicity** says the operation itself can't tear and read-modify-writes can't lose updates. **Ordering** says what *other* memory — the plain, non-atomic data around your atomic — is guaranteed visible to a thread that observes it. Compilers reorder your program; CPUs reorder it again in store buffers and caches; two threads need not agree on the order of writes *at all* unless you buy an ordering edge. The `Ordering` argument on every atomic op is the price list.",
          },
          {
            p: "**`Relaxed`** buys atomicity only. The operation happens, whole, exactly once — and establishes no cross-thread ordering with anything else. A thread that sees your Relaxed store is promised *nothing* about any other write you made before it. Perfect for counters (lesson 5 makes this precise); wrong the instant the value *means* something about other memory — 'the flag is true, therefore the config is written' is an ordering claim, and Relaxed sells no ordering.",
          },
          {
            p: "**`Acquire`/`Release`** is the workhorse pair, and it is one mechanism, not two: a **Release store publishes** everything its thread did before it; an **Acquire load that observes that store** is guaranteed to see all of it. That guarantee is the **happens-before** edge — the fundamental relation of the whole model. Release is throwing the baton with everything you've done taped to it; Acquire is catching it. A Release store nobody Acquire-loads publishes to no one; an Acquire load of a Relaxed store catches nothing. The pairing is the product.",
          },
          {
            diagram: {
              kind: "seq",
              title: "happens-before: Release throws, Acquire catches",
              caption:
                "The Acquire load that observes the Release store is guaranteed to see every write made before it — that edge is the entire proof.",
              actors: [
                { id: "prod", label: "producer", tone: "acc" },
                { id: "slot", label: "shared slot", sub: "data + AtomicBool" },
                { id: "cons", label: "consumer", tone: "ok" },
              ],
              steps: [
                { from: "prod", to: "slot", label: "data = 0xC0FFEE", sub: "plain write" },
                {
                  from: "prod",
                  to: "slot",
                  label: "store(true, Release)",
                  sub: "publishes prior writes",
                  tone: "acc",
                },
                { note: "happens-before edge" },
                { from: "cons", to: "slot", label: "load(Acquire)", dashed: true },
                {
                  from: "slot",
                  to: "cons",
                  label: "true — data visible",
                  sub: "read sees 0xC0FFEE",
                  tone: "ok",
                },
              ],
            },
          },
          {
            code: {
              lang: "rust",
              title: "publish, then flag: a happens-before edge you can run",
              run: true,
              body: `use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;

struct Slot {
    ready: AtomicBool,
    data: UnsafeCell<u64>,
}
// SAFETY: \`data\` is written only before the Release store and read only
// after an Acquire load observes \`ready == true\`. The happens-before
// edge is the entire proof.
unsafe impl Sync for Slot {}

static SLOT: Slot = Slot { ready: AtomicBool::new(false), data: UnsafeCell::new(0) };

fn main() {
    let producer = thread::spawn(|| {
        unsafe { *SLOT.data.get() = 0xC0FFEE }     // 1. plain, non-atomic write
        SLOT.ready.store(true, Ordering::Release); // 2. publish everything above
    });
    while !SLOT.ready.load(Ordering::Acquire) {    // 3. observe the store...
        std::hint::spin_loop();
    }
    // 4. ...therefore this read is guaranteed to see 0xC0FFEE. Not "usually" — always.
    println!("{:#x}", unsafe { *SLOT.data.get() });
    producer.join().unwrap();
}`,
            },
          },
          {
            p: "**`SeqCst`** buys everything Acquire/Release does, plus one more thing: all SeqCst operations in the entire program form a **single total order that every thread agrees on**. A few genuinely symmetric algorithms need that (the store-buffer litmus test: two threads each store their flag then load the other's — under Acquire/Release both can load `false`; under SeqCst at least one must see `true`). But 'just use SeqCst everywhere' is a smell, not a safety net: it cannot create a happens-before edge where you have no store/load pairing, it silences the question *which load synchronizes with which store* instead of answering it, and when the algorithm is still wrong you've hidden the reasoning you'd need to see why. If you can't name the Release/Acquire pairs in your code, SeqCst is anesthesia, not treatment.",
          },
          {
            tbl: {
              head: ["Ordering", "Guarantees", "Typical use"],
              rows: [
                [
                  "Relaxed",
                  "Atomicity only — no cross-thread ordering of other memory",
                  "Counters, stats, IDs; values nobody infers state from",
                ],
                [
                  "Acquire (loads)",
                  "See everything the pairing Release store published",
                  "Reading a ready flag, taking a lock, consuming a snapshot",
                ],
                [
                  "Release (stores)",
                  "Publish all prior writes to whoever Acquire-observes this",
                  "Setting a ready flag, releasing a lock, publishing config",
                ],
                [
                  "AcqRel (RMWs)",
                  "The RMW both acquires what it reads and releases what it writes",
                  "compare_exchange / fetch_* that pass a baton onward",
                ],
                [
                  "SeqCst",
                  "Acquire+Release plus one global total order of all SeqCst ops",
                  "Rare symmetric algorithms; not a substitute for reasoning",
                ],
              ],
            },
          },
          {
            p: "**`compare_exchange(current, new, success, failure)`** is the primitive under every lock: atomically 'if the value is `current`, make it `new`, else tell me what it was'. It takes **two** orderings — `success` for the read-modify-write when the swap happens, `failure` for the plain load when it doesn't — and the failure ordering can't be `Release` or `AcqRel`, because a failed CAS stored nothing. Its sibling `compare_exchange_weak` may fail *spuriously* (report failure even when the value matched — cheaper on ARM's LL/SC hardware) and is the right choice inside retry loops, which is exactly where lesson 5's spinlock uses it.",
          },
          {
            p: "Fences, in one paragraph: `std::sync::atomic::fence(ordering)` is an ordering edge detached from any particular atomic — a `fence(Release)` before a Relaxed store publishes like a Release store; a `fence(Acquire)` after a Relaxed load acquires like an Acquire load. Their legitimate job is amortization: one fence covering a whole batch of Relaxed operations. If you aren't batching, put the ordering on the operation itself, where the next reader of your code can see which store pairs with which load.",
          },
          {
            note: "Your development laptop will lie to you. x86 is strongly ordered — most Acquire/Release mistakes cost nothing and break nothing there. ARM is weakly ordered, and ARM is where your VPN client actually ships: every iPhone, every Android device, Apple Silicon Macs. A missing Release that 'passed QA' on the x86 CI box is a real bug on the phone. The defenses are lesson 5's Loom and testing on ARM hardware — not optimism.",
            label: "FIELD NOTE",
          },
        ],
      },
      {
        id: "r07l5",
        title: "Atomics & memory ordering, part 2: patterns from a real client",
        est: "~13 min",
        blocks: [
          {
            p: "Theory earns its keep when it picks orderings for you. Here are four artifacts every tunnel daemon actually contains — counters, a shutdown flag, a config snapshot, a lock — and the guarantee each one needs. The skill being trained: buy exactly the edges you use, and be able to say *why* in review.",
          },
          { h: "Counters: Relaxed is correct, not sloppy" },
          {
            p: "Packet and byte counters are bumped by every worker thread and read by the stats task and the UI. `fetch_add` is an atomic read-modify-write, so **no increment is ever lost — even at Relaxed**; atomicity, not ordering, is what prevents lost updates. And nobody infers 'other data is ready' from a byte count, so there is no publication to pay for: Relaxed is simply the correct ordering, and also the fastest — on the per-packet path, that matters. (The totals a reader sees mid-flight are a moment's approximation across threads; that's inherent to the question being asked, and no ordering upgrade changes it.)",
          },
          {
            code: {
              lang: "rust",
              title: "per-packet counters: Relaxed, and provably no lost updates",
              run: true,
              body: `use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;

static PACKETS: AtomicU64 = AtomicU64::new(0);
static BYTES: AtomicU64 = AtomicU64::new(0);

fn main() {
    thread::scope(|s| {
        for _ in 0..4 {
            s.spawn(|| {
                for _ in 0..100_000 {
                    PACKETS.fetch_add(1, Ordering::Relaxed);
                    BYTES.fetch_add(1420, Ordering::Relaxed);
                }
            });
        }
    });
    // fetch_add is an atomic read-modify-write: no increment is ever lost,
    // even with Relaxed. Run it: 400000 and 568000000, every time.
    println!("packets={} bytes={}",
        PACKETS.load(Ordering::Relaxed), BYTES.load(Ordering::Relaxed));
}`,
            },
          },
          { h: "The shutdown flag: where Relaxed quietly stops being enough" },
          {
            p: "A bare `AtomicBool` that only controls loop exit — `while !SHUTDOWN.load(...)` — can genuinely be Relaxed: atomic stores become visible to other threads promptly in practice, the loop exits, nothing else was claimed. But the moment shutdown *implies* anything about other memory — 'once you see the flag, the final stats are written', 'the drain queue is complete' — you are publishing data, and publication is the Release/Acquire pattern from part 1, exactly the runnable `Slot` demo. The honest rule: **a flag that guards data is a publication**. And since nearly every shutdown flag grows guarded data eventually, the professional default is `store(true, Release)` / `load(Acquire)` from day one — on a shutdown path, the cost difference is unmeasurable, and the reasoning never has to be revisited.",
          },
          { h: "Config snapshots: swap a pointer, never block the packet path" },
          {
            p: "The hot path reads config on every packet batch; the control plane rewrites it on reconnect or API push. A `Mutex<Config>` puts a lock on the fast path and invites priority problems. The pattern instead: config is an **immutable snapshot** in an `Arc<Config>`; the updater builds a complete new one and atomically swaps the pointer; readers load the current `Arc` — lock-free — and keep their snapshot consistent for the whole batch even if a swap lands mid-batch. The old snapshot frees itself when its last reader drops it (Arc's atomic refcount from lesson 3, earning rent). The `arc-swap` crate packages this correctly — the swap is a release operation, reader loads acquire — and it's the natural output format for S02's `ConfigSource`.",
          },
          {
            code: {
              lang: "rust",
              title: "ArcSwap: readers never wait (arc-swap crate — not runnable here)",
              body: `use arc_swap::ArcSwap;
use std::sync::Arc;

static CONFIG: ArcSwap<TunnelConfig> = /* ArcSwap::from_pointee(initial) */;

// control plane, on update — build complete, then publish:
CONFIG.store(Arc::new(next_config));      // release: snapshot is fully built

// packet path, per batch — one lock-free load:
let cfg = CONFIG.load();                  // acquire: sees a complete snapshot
for pkt in batch {
    route(pkt, &cfg);                     // consistent view all batch long
}`,
            },
          },
          { h: "The spinlock: Acquire/Release worked end to end" },
          {
            code: {
              lang: "rust",
              title: "a teaching spinlock — every piece of this module in 40 lines",
              run: true,
              body: `use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;

pub struct SpinLock<T> {
    locked: AtomicBool,
    value: UnsafeCell<T>,
}
// SAFETY: the lock protocol below guarantees at most one thread
// touches \`value\` at a time.
unsafe impl<T: Send> Sync for SpinLock<T> {}

impl<T> SpinLock<T> {
    pub const fn new(v: T) -> Self {
        Self { locked: AtomicBool::new(false), value: UnsafeCell::new(v) }
    }
    pub fn with<R>(&self, f: impl FnOnce(&mut T) -> R) -> R {
        // Acquire on success: pairs with the previous owner's Release,
        // so everything they did inside the lock is visible to us.
        while self.locked
            .compare_exchange_weak(false, true, Ordering::Acquire, Ordering::Relaxed)
            .is_err()
        {
            std::hint::spin_loop();
        }
        // SAFETY: we hold the lock, so this is the only &mut in existence.
        let out = f(unsafe { &mut *self.value.get() });
        // Release: publishes our writes to whoever acquires next.
        self.locked.store(false, Ordering::Release);
        out
    }
}

static COUNTER: SpinLock<u64> = SpinLock::new(0);

fn main() {
    thread::scope(|s| {
        for _ in 0..4 {
            s.spawn(|| for _ in 0..100_000 { COUNTER.with(|c| *c += 1) });
        }
    });
    println!("{}", COUNTER.with(|c| *c)); // 400000 — no lost updates, no torn writes
}`,
            },
          },
          {
            p: "Read the two orderings like a contract. The **Acquire** on a successful CAS pairs with the previous owner's **Release** store of `false`: everything the old owner did inside the lock happens-before everything you do inside it. That pairing *is* mutual exclusion's memory story — a mutex is precisely 'a Release at unlock, an Acquire at lock, and exclusion in between'. And the standard disclaimer, meant sincerely: **don't ship a spinlock.** No fairness, no priority handling, and it burns a CPU core spinning against an owner the OS has descheduled — on a phone, that's battery. `std::sync::Mutex` or `parking_lot` for production; this artifact exists so you can *read* locks, not so you can write them.",
          },
          {
            p: "Last tool: **Loom**. Tests catch the interleavings your machine happened to produce; Loom is a model checker that produces *all of them* — you write the concurrent test inside `loom::model(|| ...)`, swap `std::sync::atomic` for `loom`'s types under `#[cfg(loom)]`, and Loom executes every schedule and every reordering the memory model permits. The spinlock above with its Release store downgraded to Relaxed passes a million real runs on x86; Loom fails it in seconds, with the exact schedule printed. tokio's own internals are loom-tested; any lock-free structure you write for the packet path should be too.",
          },
        ],
      },
      {
        id: "r07l6",
        title: "FFI: crossing the C ABI",
        est: "~12 min",
        blocks: [
          {
            p: "Swift does not speak Rust. Neither does Kotlin, nor C++. What every one of them speaks — the lingua franca of the entire industry — is the **C ABI**: C's calling conventions, C's type layouts, C's strings. So your core ships as a C library that happens to be written in Rust, and S02's `tunnel-ffi` crate is where the translation lives. `extern \"C\"` is the keyword in both directions: on a Rust function it means 'callable as C'; in an extern block it declares foreign symbols the linker will supply.",
          },
          {
            code: {
              lang: "rust",
              title: "both directions across the boundary (Rust 2024 spellings)",
              body: `// Rust -> C: exported under an unmangled, linkable name.
// Rust 2024 makes you write the danger: a duplicate symbol name
// elsewhere in the process is UB, so no_mangle is an unsafe attribute.
#[unsafe(no_mangle)]
pub extern "C" fn tc_abi_version() -> u32 { 3 }

// C -> Rust: declaring foreign functions is itself a promise —
// the compiler never sees their bodies, so the whole block is unsafe.
unsafe extern "C" {
    fn os_entropy(buf: *mut u8, len: usize) -> i32;
}`,
            },
          },
          {
            p: "Layout next, because it's the silent killer. **Rust's default struct layout is deliberately unspecified** — the compiler reorders fields to minimize padding and may lay the same struct out differently in a future release. A struct crossing the boundary must be **`#[repr(C)]`**: fields in declaration order, C's alignment and padding rules, a layout both sides compute identically. (One blessed exception to memorize: `Option<&T>` and `Option<extern \"C\" fn(...)>` are guaranteed to be a single nullable pointer — the niche optimization — which is how you express 'nullable callback' without `repr(C)`.)",
          },
          {
            code: {
              lang: "rust",
              title: "a struct both sides agree on",
              body: `#[repr(C)]                      // without this, Rust may reorder fields —
pub struct TunnelStats {        // and Swift would read garbage that *parses*
    pub tx_bytes: u64,
    pub rx_bytes: u64,
    pub last_handshake_unix: i64,
    pub peer_count: u32,
    pub _reserved: u32,         // explicit padding: the ABI is forever
}`,
            },
          },
          {
            p: "Strings are two incompatible civilizations. C: a pointer to bytes, terminated by NUL, length unknown, encoding a rumor. Rust: pointer + length, guaranteed UTF-8, NULs allowed inside. The bridge types: **`CStr`** borrows a C string (`CStr::from_ptr` is unsafe — *you* assert the pointer is valid, NUL-terminated, and alive for the borrow), **`CString`** owns a NUL-terminated buffer Rust allocated. And there are exactly **two ownership models** for a string crossing the boundary: **borrow-for-the-call** — the caller keeps ownership, the callee copies if it wants to keep anything (the default for every input parameter); or **transfer** — `CString::into_raw` hands ownership out, and that exact pointer must come back through `CString::from_raw` to be freed. Never let Swift or C call `free()` on a Rust allocation: the two sides may not even share an allocator. **Who allocates must free** — which in API terms means every allocating function ships with a paired `_free` function.",
          },
          {
            code: {
              lang: "rust",
              title: "the transfer model, with its mandatory other half",
              body: `use std::ffi::{c_char, CString};

#[unsafe(no_mangle)]
pub extern "C" fn tc_last_error() -> *mut c_char {
    // ownership leaves Rust here...
    CString::new(last_error_message()).unwrap().into_raw()
}

#[unsafe(no_mangle)]
pub extern "C" fn tc_string_free(s: *mut c_char) {
    if s.is_null() { return }
    // ...and may only come home through the same door.
    // SAFETY: s was produced by tc_last_error's into_raw, exactly once.
    drop(unsafe { CString::from_raw(s) });
}`,
            },
          },
          {
            p: "Panics. A Rust panic unwinds the stack — and **unwinding across an `extern \"C\"` boundary was undefined behavior for years**. Modern Rust (1.81+) closes the UB hole by force: a panic escaping an `extern \"C\"` function is a guaranteed, immediate **process abort**. Better than UB; still your entire VPN vanishing from inside someone's Network Extension, with iOS deciding whether you get to relaunch. The discipline is absolute: **`catch_unwind` at every single entry point**, translate the panic into an error code, log it, survive. No exceptions, including the functions that 'can't panic' — those are the ones that do.",
          },
          {
            code: {
              lang: "rust",
              title: "no panic leaves this function",
              body: `#[unsafe(no_mangle)]
pub extern "C" fn tc_tick(t: *mut Tunnel) -> i32 {
    // SAFETY: contract with the shell — t is a live pointer from tunnel_new.
    let Some(t) = (unsafe { t.as_mut() }) else { return ERR_NULL_HANDLE };
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| t.tick())) {
        Ok(()) => 0,
        Err(_) => ERR_INTERNAL_PANIC,   // logged, reported — not aborted
    }
}`,
            },
          },
          {
            p: "Don't hand-transcribe the boundary. **bindgen** reads a C header and generates the Rust `extern` declarations and `repr(C)` types — with layout tests that assert Rust's idea of every struct matches C's. **cbindgen** goes the other way: it reads your Rust FFI surface and emits the `.h` file Swift and C++ import. A hand-copied signature is silent UB waiting for someone to add a struct field on one side only; generated bindings turn that into a build failure. Run the generators in the build, or CI-check that the committed header matches the source.",
          },
          {
            p: "Callbacks, the last primitive. A Rust closure cannot cross the boundary — it's a compiler-invented type with captured state and no C name. The C idiom is a pair: an **`extern \"C\"` function pointer** plus a **`*mut c_void` context** that the callee passes back verbatim on every invocation. Rust-side, you `Box` your state and `into_raw` it as the context; a small trampoline function casts it back. Every rule from this lesson applies to the callback in reverse — it's the foreign side calling *you* now, so the threading and lifetime contract you document (lesson 7) is what keeps it sound.",
          },
          {
            code: {
              lang: "rust",
              title: "function pointer + context: the C callback idiom",
              body: `use std::ffi::{c_char, c_void};

/// level, message, and the caller's context, passed back verbatim.
pub type TcLogFn = extern "C" fn(level: u8, msg: *const c_char, ctx: *mut c_void);

#[unsafe(no_mangle)]
pub extern "C" fn tc_set_logger(f: TcLogFn, ctx: *mut c_void) {
    // Contract to document, since the compiler can't:
    //  - ctx must stay valid until tc_set_logger(NULL) or tunnel_free
    //  - f may be invoked from ANY Rust worker thread (lesson 7)
    LOGGER.store_callback(f, ctx);
}`,
            },
          },
          {
            note: "A beta build corrupted stats only on 32-bit Android. The Kotlin header said `int session_id`; the Rust side had drifted to `usize`. On 64-bit devices the mismatch happened to be masked by register width; on armv7 it smeared a neighbor field. No compiler on either side could have caught it — two toolchains, one informal agreement. cbindgen in CI would have failed the build the day the Rust type changed. The ABI is a contract with no compiler; generate it.",
            label: "FIELD NOTE",
          },
        ],
      },
      {
        id: "r07l7",
        title: "FFI in a real VPN client",
        est: "~13 min",
        blocks: [
          {
            p: "Now assemble the primitives into the real shape. On every platform, the shell — Swift `NEPacketTunnelProvider`, Kotlin `VpnService`, a C++ tray app — holds exactly **one pointer** into your Rust world and calls perhaps a dozen functions on it. T01 established that mobile hands your core an already-open TUN fd; *this* is the layer where the handing happens. The design that makes it survivable is the **opaque handle pattern**.",
          },
          {
            p: "The handle: `pub struct Tunnel { ... }` stays a normal Rust struct — **not** `repr(C)`, never crossed by value, its fields invisible to the shell. What crosses is `*mut Tunnel`, an opaque token the foreign side can store and pass back but never dereference — the C header says `typedef struct Tunnel Tunnel;` and nothing more. Construction is `Box::into_raw(Box::new(tunnel))`: ownership formally leaves Rust and lives in the Swift/Kotlin object holding the pointer. Destruction is the paired `tunnel_free`, whose `Box::from_raw` takes ownership back so `Drop` runs. `tunnel_new`/`tunnel_free` are your API's `malloc`/`free` — and lesson 6's law applies: who allocates must free.",
          },
          {
            diagram: {
              kind: "flow",
              title: "the opaque handle crossing the C ABI",
              caption:
                "The shell stores a token it can never dereference; every entry point re-proves the contract before touching real Rust state.",
              nodes: [
                { label: "Swift shell", sub: "holds *mut Tunnel" },
                { label: "C ABI", sub: 'extern "C" + repr(C)', tone: "acc" },
                { label: "tunnel-ffi", sub: "null + catch_unwind" },
                { label: "Tunnel", sub: "plain Rust struct", tone: "ok" },
              ],
              arrows: ["call", "check + catch", "scoped &mut"],
            },
          },
          {
            code: {
              lang: "rust",
              title: "the surface: opaque handle, defensive entry points",
              body: `pub struct Tunnel {          // NOT repr(C): the shell never sees inside
    workers: Vec<std::thread::JoinHandle<()>>,
    shutdown: std::sync::Arc<std::sync::atomic::AtomicBool>,
    // sockets, TUN fd, keys, config...
}

#[repr(C)]
pub struct TunnelConfig { pub mtu: u16, pub keepalive_secs: u16 }

#[unsafe(no_mangle)]
pub extern "C" fn tunnel_new(cfg: *const TunnelConfig) -> *mut Tunnel {
    // SAFETY: cfg is either null (checked) or valid for this call — contract.
    let Some(cfg) = (unsafe { cfg.as_ref() }) else { return std::ptr::null_mut() };
    match std::panic::catch_unwind(|| Tunnel::start(cfg)) {
        Ok(Ok(t)) => Box::into_raw(Box::new(t)),   // ownership -> the shell
        _ => std::ptr::null_mut(),                 // error AND panic: null, not abort
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn tunnel_free(t: *mut Tunnel) {
    if t.is_null() { return }        // free(NULL) is a no-op; match it
    // SAFETY: t came from tunnel_new; the shell promises no further calls.
    drop(unsafe { Box::from_raw(t) });   // ownership home -> Drop runs
}`,
            },
          },
          {
            p: "**Every entry point re-asserts the invariants** — null check, `catch_unwind`, and pointers converted to references for the shortest possible scope, never stashed anywhere they could outlive the call. This feels paranoid until you remember what's calling you: an untyped, unchecked, multithreaded runtime that can pass a stale pointer, a null, or call you twice concurrently. Each function should be *locally defensible*: a reviewer reading it alone, plus the documented contract, can conclude it's sound.",
          },
          {
            p: "The **threading contract** is the part everyone under-documents and everyone crashes on. Your status and packet callbacks are invoked by tokio workers (R03) — so they arrive on **Rust's threads, never the shell's**. Document it exactly as: 'callbacks may arrive on any thread, possibly concurrently.' The Swift side must trampoline to its own `DispatchQueue`, Kotlin to a `Handler`; the classic crash is Swift touching UI or NE APIs directly in the callback because it worked in the simulator. The reverse direction needs the same rigor: which of *your* functions may be called concurrently? (Safest answer to promise: any of them — you're already holding `Sync` state, lesson 3.)",
          },
          {
            p: "Logging deserves its own sentence because inside a Network Extension `println!` goes nowhere — there is no console attached to your process. Install an `extern \"C\"` log callback as the *first* call at init, before anything can fail silently, and route R05's `tracing` subscriber through it into `os_log`/logcat. One deadlock to design out from the start: never invoke the log callback while holding a lock that code *inside* the callback's thread might re-take — logging is the innocent-looking edge that closes lock cycles.",
          },
          {
            p: "You don't have to hand-roll all of this. **uniffi** (Mozilla's, battle-tested in Firefox) and **flapigen** generate the C ABI *plus* idiomatic Swift and Kotlin wrappers from an interface definition — strings, error enums, callbacks, and object lifetimes handled by generated code that has fewer typos than yours. The trade: less control over threading and zero-copy paths, which is why performance-critical packet paths often stay hand-rolled next to a uniffi-generated control plane. Either way, *everything in this module still applies underneath* — a generator writes the boilerplate; it cannot write your invariants.",
          },
          {
            note: "The worst bug of one release cycle: intermittent crashes in tunnel teardown, only under memory pressure, backtrace pointing at innocent Swift. The race: `stopTunnel` called its completion handler, iOS released the provider, ARC dropped the last Swift wrapper, and its `deinit` called `tunnel_free` — while a Rust worker thread was still inside a status callback touching the tunnel. Use-after-free, Swift side of the boundary, invisible to Miri (foreign code) and to unit tests (no memory pressure). AddressSanitizer on the full linked framework found it in an afternoon: 'freed by thread T3, used by thread T7', both stacks printed. The fix wasn't a patch — it was the teardown *sequence* below, made law.",
            label: "FIELD NOTE",
          },
          {
            p: "**Teardown order is API law, not implementation detail.** The only sound sequence: first `tunnel_stop` sets the shutdown flag (Release) and guarantees *no new callbacks* will be issued; workers observe it (Acquire), finish in-flight work, and exit; `tunnel_stop` **joins** them — after the join, provably no Rust thread can touch the handle or call out; only then may the shell call `tunnel_free`; and the shell nulls its stored pointer so any straggling call hits the null check instead of freed memory. `tunnel_free` must be the last call ever made on the handle, and 'last' must be *sequenced*, not hoped.",
          },
          { h: "The unsafe-code checklist, as shipped" },
          {
            ul: [
              "**Miri in CI** (`cargo +nightly miri test`) on every crate containing unsafe — catches aliasing violations, use-after-free, and invalid values in pure-Rust tests. It cannot see foreign code.",
              "**ASan and TSan on the linked artifact** — sanitizers instrument the whole process, Swift and C included; they catch exactly the cross-language bugs Miri can't (like the field note above).",
              "**`#![deny(unsafe_op_in_unsafe_fn)]`** — an `unsafe fn` body no longer gets a free implicit unsafe block; every dangerous operation needs its own explicit `unsafe { }`, so the blocks stay small and countable.",
              "**`// SAFETY:` comment on every unsafe block and every `unsafe impl`** — stating the invariant being relied on, enforced mechanically with clippy's `undocumented_unsafe_blocks` lint (R05's `-D warnings` gate makes it a build failure).",
            ],
          },
          {
            p: "Step back and the module has one thesis. Unsafe Rust is not a different language — it's Rust where the proofs are done by hand. The borrow checker's rules never left; `Send` and `Sync` still mean exactly what they claim; the memory model still decides who sees what. What changes at the bottom of the stack is who signs the proof — and the discipline you've built here (smallest blocks, written invariants, Miri, Loom, sanitizers, generated bindings, paired ownership) is what makes your signature worth as much as the compiler's.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "r07e1",
        type: "match",
        title: "Concurrency vocabulary, precisely",
        kind: "MATCH LAB",
        prompt:
          "Match each term to the one claim it actually makes — no more, no less. Half of concurrency review is refusing to let these words blur.",
        pairs: [
          {
            t: "Relaxed",
            d: "Atomicity only — the op can't tear or lose updates, but orders nothing else",
          },
          {
            t: "Release",
            d: "A store that publishes every prior write to whoever observes it",
          },
          {
            t: "Acquire",
            d: "A load that, on observing the pairing store, sees everything it published",
          },
          {
            t: "SeqCst",
            d: "Acquire+Release plus one global total order all threads agree on",
          },
          {
            t: "compare_exchange",
            d: "Atomic 'if the value is X, make it Y, else report what it was' — the primitive under every lock",
          },
          {
            t: "data race",
            d: "Unsynchronized concurrent access with at least one write — undefined behavior, not a stale read",
          },
          {
            t: "UnsafeCell",
            d: "The one legal way to mutate behind a shared reference — it withdraws the immutability promise",
          },
          {
            t: "happens-before",
            d: "The visibility edge a Release/Acquire pair creates between two threads",
          },
        ],
        why: "Every ordering bug postmortem contains one of these words used loosely. Relaxed 'orders nothing else' and Sync-adjacent vocabulary like happens-before are the difference between choosing an ordering and guessing one.",
      },
      {
        id: "r07e2",
        type: "blank",
        title: "Harden the FFI surface",
        kind: "CODE LAB",
        prompt:
          "Fill the blanks so this exported surface follows the law: null-checked, panic-proof, and with ownership crossing the boundary through the right doors.",
        code: `#[repr(C)]
pub struct TunnelConfig { pub mtu: u16, pub keepalive_secs: u16 }

#[unsafe(no_mangle)]
pub extern "C" fn tunnel_new(cfg: §0§) -> *mut Tunnel {
    // null-checked borrow of the caller's struct — caller keeps ownership
    let Some(cfg) = (unsafe { cfg.§1§() }) else { return std::ptr::null_mut() };
    match std::panic::§2§(|| Tunnel::start(cfg)) {
        Ok(Ok(t)) => §3§(Box::new(t)),      // ownership leaves Rust here
        _ => std::ptr::null_mut(),          // error AND panic become null
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn tunnel_free(t: *mut Tunnel) {
    if t.is_null() { return }
    // ownership comes home through the paired door, so Drop runs
    drop(unsafe { §4§(t) });
}`,
        blanks: [
          { opts: ["*const TunnelConfig", "TunnelConfig", "&TunnelConfig"], a: 0 },
          { opts: ["as_ref", "read", "cast"], a: 0 },
          { opts: ["catch_unwind", "set_hook", "resume_unwind"], a: 0 },
          { opts: ["Box::into_raw", "Box::new", "std::mem::transmute"], a: 0 },
          { opts: ["Box::from_raw", "Box::into_raw", "std::ptr::read"], a: 0 },
        ],
        why: "The shell passes a raw *const pointer (references don't exist in the C ABI); as_ref() converts it to Option<&T>, folding the null check into the type. catch_unwind stops a panic from crossing the boundary — an abort on modern Rust. into_raw/from_raw are the paired ownership doors: whoever allocated must free, and only via the same Box.",
      },
      {
        id: "r07e3",
        type: "order",
        title: "Tear down a tunnel without a use-after-free",
        kind: "SEQUENCE LAB",
        prompt:
          "iOS calls stopTunnel on your Swift provider, which owns a *mut Tunnel. Order the teardown so no thread can ever touch freed memory.",
        items: [
          "Swift calls tunnel_stop(): Rust stores the shutdown flag with Release and stops issuing new callbacks",
          "Worker threads observe the flag with Acquire, finish in-flight packets, and exit their loops",
          "tunnel_stop() joins every worker thread — after this, no Rust thread can touch the handle or call out",
          "Swift calls tunnel_free(ptr): after the null check, Box::from_raw takes ownership back",
          "The Box drops: Tunnel's Drop closes the sockets and TUN fd and zeroizes key material",
          "Swift nulls its stored pointer, so any straggling call hits the null check instead of freed memory",
        ],
        why: "The invariant is a chain: no new callbacks, then no running threads, then and only then free. Joining before freeing is what makes from_raw sound, and nulling the shell's pointer is the cheap insurance that turns a late call into a no-op instead of the field note's memory-pressure crash.",
      },
    ],
    quiz: {
      id: "r07q",
      questions: [
        {
          q: "What does wrapping code in an unsafe block actually change?",
          opts: [
            "The borrow checker is disabled inside the block",
            "Exactly five extra operations become legal (raw-pointer deref, unsafe calls, unsafe trait impls, static mut, union fields) — everything else is checked as usual",
            "Bounds checks and overflow checks are removed for performance",
          ],
          a: 1,
          why: "unsafe turns five things on; it turns nothing off. Two &mut to one buffer is still a compile error inside an unsafe block — what moves is the proof obligation for those five operations, from the compiler to you.",
        },
        {
          q: "You cast a &u64 to *mut u64 and write through it. The borrow checker says nothing. Is it fine?",
          opts: [
            "Yes — raw pointers aren't subject to the aliasing rules",
            "No — the &T's immutability promise stands while it lives; the optimizer may have cached the value, and the write is UB",
            "Only a problem on weakly-ordered CPUs like ARM",
          ],
          a: 1,
          why: "Raw pointers escape the checker, not the rules. The promise is attached to the reference's existence and handed to the optimizer as noalias/readonly facts — UnsafeCell is the only legal way to mutate behind &T. Miri flags this on any host.",
        },
        {
          q: "Why is Rc<T> !Send?",
          opts: [
            "It contains a raw pointer, and raw pointers can never cross threads",
            "Its reference count is a plain non-atomic integer — clones on two threads race on the count, then double-free or leak",
            "It isn't — Rc is Send as long as T is Send",
          ],
          a: 1,
          why: "The auto-derivation is protecting the refcount, not the pointer per se. Arc is the same design with an atomic count — that atomicity is both the fix and the entire price difference.",
        },
        {
          q: "Four worker threads bump a shared bytes-transferred counter with fetch_add; the stats task reads it once a second. Which ordering?",
          opts: [
            "SeqCst — shared data across threads always needs the strongest ordering",
            "Acquire on reads, Release on writes",
            "Relaxed — fetch_add's atomicity already prevents lost updates, and nobody infers other state from the count",
          ],
          a: 2,
          why: "Lost updates are prevented by RMW atomicity, which Relaxed already buys. Ordering is only needed when observing the value implies something about other memory — a raw statistic implies nothing, so Relaxed is correct, not merely acceptable.",
        },
        {
          q: "A worker writes a parsed config into a shared slot, then sets an AtomicBool; readers check the flag before reading the config. Which orderings?",
          opts: [
            "Relaxed store, Relaxed load — atomics are always safe to mix",
            "store(Release) on the flag, load(Acquire) on the readers — the pair creates the happens-before edge that makes the config writes visible",
            "SeqCst on the flag; the config also needs to become atomic",
          ],
          a: 1,
          why: "The flag guards data, so this is publication: Release publishes every write before the store, Acquire on an observing load receives them. With Relaxed, a reader can see flag=true and stale config bytes — a real bug on ARM that x86 test machines happily hide.",
        },
        {
          q: 'A panic unwinds out of your extern "C" callback into Swift. What happens?',
          opts: [
            "Swift catches it as a thrown error",
            "Historically UB; on modern Rust (1.81+) the process immediately aborts — either way, catch_unwind at every FFI entry point is mandatory",
            "The panic is silently swallowed and the function returns a default value",
          ],
          a: 1,
          why: "Unwinding doesn't translate across the C ABI. Rust 1.81 turned the old UB into a guaranteed abort — safer, but still your whole VPN process dying inside a Network Extension. Entry points catch the panic and return an error code instead.",
        },
        {
          q: "tc_last_error() returns a *mut c_char from CString::into_raw. How must the Swift side dispose of it?",
          opts: [
            "Call free() on it once it has copied the string",
            "Nothing — Rust's garbage collection reclaims it",
            "Pass it back to the paired tc_string_free, which reclaims it via CString::from_raw",
          ],
          a: 2,
          why: "Who allocates must free — the two sides may not even share an allocator, so free() on a Rust allocation is UB. into_raw/from_raw are paired doors: every allocating export ships with its _free twin, and ownership goes home through it exactly once.",
        },
        {
          q: "tokio::spawn rejects your task: 'future cannot be sent between threads safely,' pointing at a std::sync::MutexGuard held across an .await. Why is the guard !Send?",
          opts: [
            "OS mutexes must be unlocked on the thread that locked them; a work-stealing runtime could resume the future — and run the guard's Drop — on a different thread",
            "MutexGuard contains a raw pointer, and the compiler is being conservative",
            "Holding any lock across .await is a deadlock, so tokio bans it outright",
          ],
          a: 0,
          why: "The guard unlocks in Drop, and pthread-style mutexes make cross-thread unlock UB — so the guard must never migrate. Scope the guard to die before the .await, or use tokio::sync::Mutex, whose guard is designed to be Send.",
        },
      ],
    },
  },
];
