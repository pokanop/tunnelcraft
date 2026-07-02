import type { Module } from "./types";

/* Rust track — futures from first principles: the module where .await stops
   being magic. Slots after async/Tokio (R03); everything here is the machinery
   underneath the packet loops the tunnel modules drive. */

export const RUST_FUTURE: Module[] = [
  {
    id: "r06",
    code: "R04",
    title: "Futures by Hand: Poll, Wakers & Pin",
    layers: ["RS"],
    est: "~75 min",
    tag: "Write a Future from scratch: the poll contract, wakers and their vtable, why Pin exists, and a mini executor — so every .await in your packet loop is machinery you own, not magic you rent.",
    lessons: [
      {
        id: "r06l1",
        title: "The Future trait: a state machine you poll",
        est: "~12 min",
        blocks: [
          {
            p: "R03 asked you to take one thing on faith: 'a runtime **polls** your future.' This module revokes the faith requirement. Your daemon's inner loop — recv, decrypt, route, send — will live inside futures, and when it misbehaves at 2 a.m. you will be staring at a hung `.await` with no stack trace worth reading. The engineers who fix that are the ones for whom async is a mechanism, not a vibe. The mechanism starts embarrassingly small:",
          },
          {
            code: {
              lang: "rust",
              title: "the entire interface, verbatim from std",
              body: `pub trait Future {
    type Output;
    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output>;
}

pub enum Poll<T> {
    Ready(T),
    Pending,
}`,
            },
          },
          {
            p: "One method. The exotic receiver `self: Pin<&mut Self>` is lesson 4's whole subject; `cx: &mut Context<'_>` is lesson 2's. What's left is the protocol: someone calls `poll`, and the future either finishes the job now (`Ready(value)`) or says 'can't yet' (`Pending`). There is no callback registration API, no completion handler, no thread hiding inside — a future is an inert value that makes progress *only* while someone is actively calling `poll` on it.",
          },
          {
            tbl: {
              head: ["poll returns", "It means", "Obligation it creates"],
              rows: [
                [
                  "Poll::Ready(v)",
                  "Done — v is the output",
                  "None. The future is spent; polling again is a contract violation (many panic)",
                ],
                [
                  "Poll::Pending",
                  "Can't progress right now",
                  "The future MUST have arranged to be woken when progress becomes possible (lesson 2)",
                ],
              ],
            },
          },
          {
            p: "So what does the compiler make of an `async fn`? A **state machine**: an enum with one variant per suspension point. Each variant stores exactly the locals that are still alive at that `.await` — because when `poll` returns `Pending`, the thread walks away, and everything the function will need on resume must live inside the future's own bytes.",
          },
          {
            code: {
              lang: "rust",
              title: "what the compiler generates (morally)",
              body: `// you write:
async fn probe(sock: &UdpSocket, peer: SocketAddr) -> io::Result<usize> {
    sock.send_to(b"ping", peer).await?;
    let mut buf = [0u8; 1500];
    let (n, _) = sock.recv_from(&mut buf).await?;
    Ok(n)
}

// the compiler emits, roughly:
enum ProbeFuture<'a> {
    Start      { sock: &'a UdpSocket, peer: SocketAddr },
    AwaitSend  { sock: &'a UdpSocket, send_fut: SendTo<'a> },
    AwaitRecv  { buf: [u8; 1500], recv_fut: RecvFrom<'a> },
    Done,
}
// poll() = "run from the current state until Ready or the next Pending,
//           then record which state we parked in"`,
            },
          },
          {
            p: "Every call to `poll` drives the machine as far as it can go: it polls the inner future of the current state; on `Ready` it executes your code up to the next `.await` and rolls into the next state; on `Pending` it parks and returns `Pending` itself. `.await` points are the **only** places an async fn can pause — between them, your code runs as plain, uninterrupted Rust on the worker thread (a fact lesson 6 turns into a starvation war story).",
          },
          {
            diagram: {
              kind: "state",
              title: "ProbeFuture: what poll() drives",
              caption:
                "Each variant stores only the locals alive at that .await; a Pending inner future parks the machine in its current state until the next poll.",
              states: [
                { id: "start", label: "Start", x: 0, y: 0 },
                { id: "send", label: "AwaitSend", tone: "acc", x: 1, y: 0 },
                { id: "recv", label: "AwaitRecv", tone: "acc", x: 2, y: 0 },
                { id: "done", label: "Done", tone: "ok", x: 3, y: 0 },
              ],
              edges: [
                { from: "start", to: "send", label: "first poll" },
                { from: "send", to: "recv", label: "send Ready" },
                { from: "recv", to: "done", label: "recv Ready(n)", tone: "ok" },
              ],
            },
          },
          {
            p: "Second consequence, and it trips every engineer arriving from JavaScript: **futures are lazy**. A JS promise starts executing the moment you create it; a Rust future is a struct in the `Start` state and nothing more. `let f = handshake(peer);` sends no packet, binds no socket, does *nothing* until first polled. That's what makes `select!` (R03) able to drop the losing branch — an unpolled or half-polled future is just a value you can discard.",
          },
          {
            code: {
              lang: "rust",
              title: "laziness and size, measured — run me",
              run: true,
              body: `async fn small_state() {
    let x: u8 = 1;
    std::future::ready(x).await;
}

async fn big_state() {
    let buf = [0u8; 8192]; // live ACROSS the await -> stored in the machine
    std::future::ready(()).await;
    let _ = buf[0];
}

async fn side_effect() {
    println!("you will never see this");
    std::future::ready(()).await;
}

fn main() {
    let a = small_state();
    let b = big_state();
    let _never_polled = side_effect(); // created, never polled: does NOTHING

    println!("small_state future: {} bytes", std::mem::size_of_val(&a));
    println!("big_state  future: {} bytes", std::mem::size_of_val(&b));
}`,
            },
          },
          {
            p: "Run it: the `println!` inside `side_effect` never fires — proof of laziness — and `big_state`'s future weighs in around 8 KB while `small_state`'s is a few bytes. That's the 'zero-cost' claim made concrete and honest: no heap allocation, no boxing, no runtime bookkeeping per await — the future's size is simply **the largest set of locals alive across any await**, computed at compile time. You pay for exactly the state you keep, and you can measure it with `size_of_val`.",
          },
          {
            note: "Audit a real daemon's futures sometime: a deep async call chain where someone parked a 64 KB scratch buffer across an .await produces a 64 KB future — memcpy'd around at spawn time, bloating every join set that contains it. The fix is usually one line: shrink the buffer's scope so it dies before the await, or heap it. size_of_val on your top-level task futures belongs in your benchmark suite next to R02's criterion runs.",
            label: "FIELD NOTE",
          },
        ],
      },
      {
        id: "r06l2",
        title: "Wakers: how the runtime knows to try again",
        est: "~12 min",
        blocks: [
          {
            p: "Lesson 1 left a hole you could drive a truck through: `poll` returned `Pending` — now who calls `poll` again, and *when*? The naive answers are both wrong. The executor does not spin-poll every pending future (that's a busy loop wearing a trench coat), and the OS does not call your code back directly. The answer is the second parameter you ignored: `cx: &mut Context<'_>`, which today is essentially a carrier for one object — the **`Waker`**.",
          },
          {
            code: {
              lang: "rust",
              title: "the shape of every correct poll",
              body: `fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
    if self.is_ready() {
        return Poll::Ready(self.take_output());
    }
    // THE CONTRACT: before returning Pending you MUST arrange for
    // cx.waker() to be woken when progress becomes possible.
    self.stash_waker_where_the_event_source_can_reach_it(cx.waker().clone());
    Poll::Pending
}`,
            },
          },
          {
            p: "State the **poll contract** precisely, because everything in this module hangs off it: *returning `Pending` obligates you to have arranged, before returning, that the waker from this `Context` will be woken when the future can make progress.* Woken means someone — a timer thread, an IO driver, another task releasing a lock — calls `wake()` on it. The executor's side of the deal: a wake puts your task back on the ready queue and it gets polled again. No wake, no re-poll, ever. Pending is not 'check back later'; it is 'I will call you.'",
          },
          {
            diagram: {
              kind: "seq",
              title: "the poll contract, one round trip",
              caption:
                "No wake, no re-poll — ever. Pending is only legal because the waker was stashed with the event source first.",
              actors: [
                { id: "exec", label: "executor", tone: "acc" },
                { id: "fut", label: "future" },
                { id: "src", label: "event source", sub: "timer / IO driver" },
              ],
              steps: [
                { from: "exec", to: "fut", label: "poll(cx)" },
                {
                  from: "fut",
                  to: "src",
                  label: "stash waker",
                  sub: "cx.waker().clone()",
                  dashed: true,
                },
                { from: "fut", to: "exec", label: "Poll::Pending", tone: "dim" },
                { note: "task sleeps — zero CPU" },
                { from: "src", to: "exec", label: "wake()", sub: "requeue the task", tone: "acc" },
                { from: "exec", to: "fut", label: "poll(cx)" },
                { from: "fut", to: "exec", label: "Poll::Ready(v)", tone: "ok" },
              ],
            },
          },
          {
            p: "So what is a `Waker`? A cheap, `Clone + Send + Sync` handle meaning 'this specific task.' Calling `wake()` doesn't run any of your code — it tells the *executor* 'that task can make progress; schedule it.' Crucially it's type-erased: the same `Waker` API works whether the executor is tokio's work-stealing scheduler, lesson 5's toy channel loop, or a thread waiting to be unparked. The future neither knows nor cares what waking actually does.",
          },
          {
            p: "The erasure is done with honest, artisanal C-style machinery: a `Waker` wraps a **`RawWaker`** — one data pointer plus a **vtable** of four function pointers. That's it. No trait objects, no allocation requirements, usable from `no_std`; this is the one corner of async carved at the ABI level so that *any* executor and *any* future can meet in the middle.",
          },
          {
            code: {
              lang: "rust",
              title: "the vtable, in plain terms",
              body: `// RawWaker = (data: *const (), vtable: &'static RawWakerVTable)
// RawWakerVTable::new(clone, wake, wake_by_ref, drop):
//
//   clone:       mint another handle to the same task
//   wake:        notify, consuming this handle   (fn wake(self))
//   wake_by_ref: notify, keeping the handle      (fn wake_by_ref(&self))
//   drop:        release this handle
//
// For an Arc-based executor these are literally Arc::clone,
// "send self down the ready queue", and Arc::drop. You will
// almost never write this by hand: std::task::Wake (lesson 5)
// or futures' ArcWake generate it from an Arc<Task>.`,
            },
          },
          {
            p: "The `wake()` vs `wake_by_ref()` split exists because waking is a hot path: `wake()` consumes the `Waker`, letting the executor move resources out of it without touching a reference count — use it when you're done with the handle (a timer firing once). `wake_by_ref()` borrows, for when you'll wake the same task again later. And since cloning has a (small) cost, `Waker::will_wake(&other)` lets a future check whether the waker it stashed last poll is still the same one before paying for a fresh clone.",
          },
          {
            p: "Now the two failure modes, and they are not symmetric. A **spurious wake** — waking a task that can't actually progress — is *explicitly legal*: the task gets polled, finds nothing to do, re-registers its waker, returns `Pending`, and the world moves on. Wasteful, harmless. A **lost wake** — readiness arrived but nobody called `wake()`, or someone woke a stale waker from three polls ago — is the deadly one: the task sleeps forever, and *nothing* reports it. No panic, no error, no log line. The daemon just... stops doing that one thing.",
          },
          {
            note: "The signature of a lost wake in production: a tunnel that completes its handshake, forwards exactly one packet, then goes silent — CPU idle, no errors, health checks green because the process is alive. We traced one to a hand-rolled future with an early-return path that hit Pending before the waker-registration line. Rust's compiler catches data races, not protocol violations: the poll contract is enforced by nothing but your discipline. When in doubt, wake — spurious is cheap insurance, lost is a 3 a.m. page with no evidence.",
            label: "FIELD NOTE",
          },
          {
            p: "Keep the asymmetry as doctrine: **wake on every state change that could matter, and always wake the waker from the most recent poll.** The second half of that sentence is the classic bug you are about to build — and then fix — with your own hands.",
          },
        ],
      },
      {
        id: "r06l3",
        title: "Build one: a timer future from scratch",
        est: "~14 min",
        blocks: [
          {
            p: "Time to earn the module title. We'll build `Delay` — a future that completes after a duration — using nothing but `std`. No tokio, no futures crate. This is the same species as `tokio::time::Sleep`, and its anatomy is the anatomy of *every leaf future*: some **shared state**, an **event source** that flips it to ready, and the **waker handoff** between them.",
          },
          {
            p: "The architecture: an `Arc<Mutex<State>>` shared between two parties. The future's `poll` (called by the executor) reads the state and stashes its waker there. A spawned thread (our stand-in for tokio's timer wheel or the IO driver) sleeps for the duration, then flips `done` and calls `wake()`. Two parties, one mutex, one waker crossing between them — that's the whole trick.",
          },
          {
            code: {
              lang: "rust",
              title: "Delay + a minimal executor, complete — run me",
              run: true,
              body: `use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Wake, Waker};
use std::thread;
use std::time::{Duration, Instant};

/// State shared between the future (polled by the executor)
/// and the timer thread (which fires the wake).
struct Shared {
    done: bool,
    waker: Option<Waker>,
}

struct Delay {
    shared: Arc<Mutex<Shared>>,
}

impl Delay {
    fn new(dur: Duration) -> Self {
        let shared = Arc::new(Mutex::new(Shared { done: false, waker: None }));
        let timer_side = Arc::clone(&shared);

        thread::spawn(move || {
            thread::sleep(dur);
            let mut s = timer_side.lock().unwrap();
            s.done = true; // 1) publish readiness FIRST...
            if let Some(w) = s.waker.take() {
                w.wake(); // 2) ...THEN wake. Never the other way around.
            }
        });

        Delay { shared }
    }
}

impl Future for Delay {
    type Output = ();

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<()> {
        let mut s = self.shared.lock().unwrap();
        if s.done {
            Poll::Ready(())
        } else {
            // Refresh the waker EVERY poll -- the task may have been
            // handed a different waker since last time (see below).
            s.waker = Some(cx.waker().clone());
            Poll::Pending
        }
    }
}

/// A one-task executor: poll; if Pending, park until someone wakes us.
struct ThreadWaker(thread::Thread);

impl Wake for ThreadWaker {
    fn wake(self: Arc<Self>) {
        self.0.unpark();
    }
}

fn block_on<F: Future>(fut: F) -> F::Output {
    let mut fut = Box::pin(fut); // pinned: lesson 4 explains why
    let waker = Waker::from(Arc::new(ThreadWaker(thread::current())));
    let mut cx = Context::from_waker(&waker);
    loop {
        match fut.as_mut().poll(&mut cx) {
            Poll::Ready(out) => return out,
            Poll::Pending => thread::park(),
        }
    }
}

fn main() {
    let t0 = Instant::now();
    block_on(Delay::new(Duration::from_millis(300)));
    println!("delay fired after {:?}", t0.elapsed());
}`,
            },
          },
          {
            p: "Walk `poll` with lesson 2's contract in hand: lock the state; if `done`, return `Ready` — obligation-free. Otherwise, *before* returning `Pending`, store `cx.waker().clone()` where the timer thread will find it. `cx.waker()` only lends you a `&Waker`; the clone is what you're allowed to keep. The contract is upheld because the timer thread is guaranteed to `wake()` whatever waker it finds once the deadline fires.",
          },
          {
            p: "Now stare at the timer thread's two commented lines, because their **order is load-bearing**: set `done = true`, *then* wake. Flip them and there's a hole — the executor could poll between your `wake()` and your `done = true`, observe not-done, stash a fresh waker, and return `Pending`... after the only wake it will ever get has already fired. Task hangs. Here the mutex covers both operations so we're safe either way, but the discipline matters the moment your state becomes an `AtomicBool`: **publish readiness before waking**, always.",
          },
          { h: "The classic bug: stashing a stale waker" },
          {
            code: {
              lang: "rust",
              title: "do not write this",
              body: `// BUG: store the waker only once, on first poll
if s.waker.is_none() {
    s.waker = Some(cx.waker().clone());
}
Poll::Pending

// Works in a unit test: one task, one waker, forever.
// Hangs in production: a future's waker is NOT stable across polls.
// select! polls you through combinator layers, a work-stealing
// runtime migrates your task -- the waker you saved on poll #1
// may point at a task handle that no longer represents anyone.
// Waking it is a no-op. Your Delay fires; nobody hears it.`,
            },
          },
          {
            p: "The contract's fine print: when `wake` finally happens, it must be the waker from the **most recent** `poll` — earlier wakers are dead letters. Tokio and every combinator library assume you honor this. So a leaf future clones and stores the waker on *every* pending poll (or checks `will_wake` first to skip redundant clones). Our `Delay` does it right: `s.waker = Some(...)` unconditionally overwrites.",
          },
          {
            note: "This exact bug has shipped in real async libraries more than once, and it's vicious precisely because the unit test passes: block_on hands you the same waker every poll, so stashing it once 'works'. Then someone wraps your future in select! with a shutdown token — R03's own recommended pattern — and the timer silently never fires after the first branch switch. If you write one leaf future in your career, the waker-refresh line is the one to get right.",
            label: "FIELD NOTE",
          },
          {
            p: "Generalize before moving on, because you now know the shape of *every* leaf future in existence: **check readiness → if ready, `Ready(value)` → if not, stash the current waker where the event source can reach it → `Pending`.** Swap the sleeping thread for an epoll readiness event and `Delay` becomes `poll_recv` on a UDP socket (lesson 6). Swap it for a lock queue and it's a `Mutex`. The choreography never changes; only the event source does.",
          },
        ],
      },
      {
        id: "r06l4",
        title: "Pin: why self-referential futures can't move",
        est: "~12 min",
        blocks: [
          {
            p: "Time to pay the debt from lesson 1: why is the receiver `self: Pin<&mut Self>` instead of plain `&mut self`? The answer is a kind of struct that safe Rust otherwise refuses to let you build — one that points into itself — and `async fn` manufactures them constantly.",
          },
          {
            code: {
              lang: "rust",
              title: "an innocent async fn builds a self-referential struct",
              body: `async fn relay(sock: &TcpStream) {
    let buf = [0u8; 1500];
    let header = &buf[..20];   // borrow of a local...
    inspect(header).await;     // ...held alive ACROSS an await
    forward(&buf).await;
}

// the generated state machine must therefore store BOTH:
// struct AwaitInspect {
//     buf: [u8; 1500],
//     header: *const u8,   // points INTO buf, i.e. into this
//                          // very struct's own bytes
// }`,
            },
          },
          {
            p: "Recall from R01 that a Rust move is a bitwise copy to a new address, and the old bytes are simply dead. Move that `AwaitInspect` state — into a `Vec`, into a `spawn`, returned from a function — and `buf` now lives somewhere new while `header` still points at the old address: a dangling pointer, use-after-free, undefined behavior. Ordinary borrow checking can't save you, because 'field borrows sibling field' is a relationship lifetimes can't express. The compiler needs a *new* kind of promise: **this value will never move again**.",
          },
          {
            p: "`Pin` is that promise, encoded as a type. `Pin<&mut T>` is a `&mut T` with one power removed and one guarantee added: you can't safely move the `T` out (no `mem::swap`, no `mem::replace`, no moving out of it), and in exchange the `T` may rely on its own address staying fixed until it's dropped. That's the entire meaning — no magic, no runtime cost, just an API that refuses to hand you the footgun. `poll` takes `Pin<&mut Self>` so a state machine full of internal pointers can trust the ground it stands on.",
          },
          {
            p: "One subtlety keeps async ergonomic: the self-references only exist **once the machine is running**. Before the first poll, the future sits in its `Start` state holding plain arguments — no internal pointers yet — so moving it is completely fine. That's why you can return futures from functions, push them into a `Vec`, and hand them to `tokio::spawn`. The rule is: *move freely before the first poll; pin before you poll; never move after.* Pinning is the ratchet that makes the third clause safe.",
          },
          {
            p: "Next escape hatch: **`Unpin`**. Most types couldn't care less about their address — an `i64`, a `Vec<u8>`, our whole `Delay` (an `Arc` and nothing self-pointing). Those types implement the auto-trait `Unpin`, and for them `Pin` is a paper handcuff: `Pin::new` works without unsafe, `get_mut` hands the `&mut` right back. This is why lesson 3 never mentioned `Pin` while *using* it — hand-written futures with ordinary fields are `Unpin` automatically. Only compiler-generated async state machines (and types containing them) are `!Unpin` and mean it.",
          },
          {
            ul: [
              "**Already `Unpin`?** Nothing to do — `Pin::new(&mut fut)` is free. This covers most hand-written leaf futures.",
              "**`Box::pin(fut)`** — pin by heap allocation: the value lives at one stable heap address until dropped. Costs an allocation; buys you a movable *handle* (`Pin<Box<F>>`) to an immovable future. Also the standard fix for lesson 1's comically large futures.",
              "**`tokio::pin!(fut)`** (or std's `pin!`) — pin to the **stack**, zero allocation: the macro shadows the binding with a `Pin<&mut F>` so the original can never be touched — or moved — again.",
            ],
          },
          {
            code: {
              lang: "rust",
              title: "where you'll actually meet Pin: polling by reference",
              body: `let fut = engine.handshake(peer); // movable: not yet polled
tokio::pin!(fut);                 // pinned to the stack from here on

loop {
    tokio::select! {
        res = &mut fut => break res?,   // poll WITHOUT consuming: needs Pin
        _ = ticker.tick() => tracing::debug!("still handshaking"),
    }
}`,
            },
          },
          {
            p: "This snippet is the reason `tokio::pin!` exists: `select!` normally consumes losing futures (R03's cancellation lesson), so resuming the *same* handshake across loop iterations requires polling it by `&mut` reference — and polling a `!Unpin` future through a reference is only legal once it's pinned. The compiler error that teaches most people this ('`fut` does not implement `Unpin`') is thirty seconds of confusion followed by one macro line.",
          },
          {
            p: "Last, **pin projection**, in exactly one paragraph as promised: if you hand-write a future *containing* other futures, you must decide, per field, whether your `Pin<&mut Self>` yields a `Pin<&mut Field>` (the field is 'structurally pinned' — pinning propagates) or a plain `&mut Field` (it doesn't). Getting it wrong is unsound, the rules are fussy, and the `pin-project` crate generates the correct unsafe for you. In practice you'll compose with `async`/`await` and combinators instead of hand-writing such types — know the word so the error messages and crate docs make sense, and move on.",
          },
          {
            note: "Pin has a reputation as async Rust's hardest topic, and for library authors writing combinators it genuinely is. As a daemon engineer your working surface is three moves: Box::pin when a future must cross an ownership boundary or is embarrassingly large, tokio::pin! when select! asks for it, and pin-project on the rare day you hand-roll a combinator. Every 'fighting Pin' story we've debugged in tunnel code was really one of those three, misapplied.",
            label: "FIELD NOTE",
          },
        ],
      },
      {
        id: "r06l5",
        title: "Executors: write a mini block_on",
        est: "~13 min",
        blocks: [
          {
            p: "You've been writing one side of a contract for three lessons; now switch chairs and *be the executor*. Strip the mystique first: a **task** is a future paired with a waker that reschedules it. An **executor** is a loop that polls tasks that claim to be ready and sleeps otherwise. Tokio is that sentence plus a decade of engineering — so build the sentence first.",
          },
          {
            p: "The minimal executor drives one future on the current thread — `block_on`, the thing hiding inside `#[tokio::main]` and every test harness. Its parts: pin the future (lesson 4 — we're about to poll it in a loop through a reference), manufacture a waker meaning 'unpark this thread', and alternate poll/park until `Ready`. `std::task::Wake` does the vtable ceremony from lesson 2 for us: implement one method on an `Arc`'d type, get a real `Waker` via `Waker::from`.",
          },
          {
            code: {
              lang: "rust",
              title: "block_on, the whole thing (from lesson 3's runnable program)",
              body: `struct ThreadWaker(thread::Thread);

impl Wake for ThreadWaker {
    fn wake(self: Arc<Self>) {
        self.0.unpark(); // waking = "get up, try polling again"
    }
}

fn block_on<F: Future>(fut: F) -> F::Output {
    let mut fut = Box::pin(fut);
    let waker = Waker::from(Arc::new(ThreadWaker(thread::current())));
    let mut cx = Context::from_waker(&waker);
    loop {
        match fut.as_mut().poll(&mut cx) {
            Poll::Ready(out) => return out,
            Poll::Pending => thread::park(), // sleep until wake()
        }
    }
}`,
            },
          },
          {
            p: "Two subtleties make this correct rather than merely cute. First, the poll→park gap: what if the timer thread calls `wake()` — `unpark()` — *after* `poll` returned `Pending` but *before* we reach `park()`? Saved by the park **token**: an `unpark` with no one parked banks a permit, and the next `park()` consumes it and returns immediately. No lost wakeup. Second, `park()` is allowed to return spuriously — and our loop doesn't care, because a spurious re-poll is legal by lesson 2's contract: the future just says `Pending` again. Both sides of the async world tolerate spurious; neither tolerates lost. Notice it's the executor-side mirror of lesson 3's 'publish readiness, then wake' ordering.",
          },
          { h: "Many tasks: the ready queue" },
          {
            p: "One task is a demo; a daemon runs hundreds. The upgrade is the classic **`ArcWake` pattern** (here via std's `Wake`): each task is an `Arc<Task>` owning its boxed future, and the waker is manufactured *from the task itself* — so `wake()` means 'send this `Arc<Task>` down a channel'. The executor is a receive loop. That's it. That's the scheduler.",
          },
          {
            code: {
              lang: "rust",
              title: "a multi-task executor in ~40 lines — run me",
              run: true,
              body: `use std::future::Future;
use std::pin::Pin;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::task::{Context, Wake, Waker};

struct Task {
    // the future this task drives, boxed and pinned once, forever
    future: Mutex<Pin<Box<dyn Future<Output = ()> + Send>>>,
    ready_queue: mpsc::Sender<Arc<Task>>,
}

impl Wake for Task {
    fn wake(self: Arc<Task>) {
        // waking IS scheduling: put yourself back in line
        let _ = self.ready_queue.send(self.clone());
    }
}

fn run(rx: mpsc::Receiver<Arc<Task>>) {
    while let Ok(task) = rx.recv() {          // blocks while idle: costs nothing
        let waker = Waker::from(task.clone()); // the task IS its own waker
        let mut cx = Context::from_waker(&waker);
        let mut fut = task.future.lock().unwrap();
        let _ = fut.as_mut().poll(&mut cx);    // Ready => simply never requeued
    }
}

fn spawn(fut: impl Future<Output = ()> + Send + 'static, tx: &mpsc::Sender<Arc<Task>>) {
    let task = Arc::new(Task {
        future: Mutex::new(Box::pin(fut)),
        ready_queue: tx.clone(),
    });
    let _ = tx.send(task); // initial poll: everything gets polled once
}

fn main() {
    let (tx, rx) = mpsc::channel();
    spawn(async { println!("task one"); }, &tx);
    spawn(async { println!("task two"); }, &tx);
    drop(tx); // no more spawners: run() ends when the queue drains
    run(rx);
}`,
            },
          },
          {
            p: "Read it until the circle closes: lesson 2's 'opaque vtable' is now three honest lines — clone is `Arc::clone`, wake is `send`, drop is `Arc::drop`. A task that returns `Ready` is never requeued, so completion is just *absence from the queue*. A task that returns `Pending` had better have stashed its waker with some event source (lesson 3's `Delay` works unmodified on this executor — its timer thread's `wake()` becomes a channel send). And scheduling policy questions materialize instantly: the channel is FIFO, so this executor is fair by accident; starve-your-siblings behavior (lesson 6) is one greedy task away.",
          },
          {
            p: "Now you can price exactly what **tokio** adds to your forty lines: a ready queue per worker thread with **work stealing** (idle workers steal tasks from busy ones, plus a LIFO slot so a just-woken task runs hot in cache); an **IO driver** — the epoll/kqueue reactor from lesson 6 — so that instead of parking on an empty channel, an idle worker parks *inside the OS readiness wait*, and socket events become `wake()` calls without any dedicated timer threads; a hashed **timer wheel** replacing our thread-per-`Delay` extravagance; and `spawn_blocking`'s separate thread pool so R03's 'never block a worker' law has somewhere to send offenders. Different engine room, same contract: poll, Pending, wake, requeue.",
          },
          {
            note: "The executor bug you'll actually write: calling a block_on — yours, futures', or Handle::block_on — from inside a tokio worker thread. Tokio panics with 'cannot start a runtime from within a runtime' on the obvious version, but the sneaky version arrives through sync FFI: an Apple Network Extension callback (P01) or a C config-reload hook that must return a value NOW, computed by your async engine. Blocking the worker to wait for the very runtime you're standing on is a deadlock with your own reflection. The fix is a channel: hand the request to the runtime, block on a std mpsc/oneshot from the foreign thread — which is exactly R03's actor pattern earning its keep at the FFI boundary.",
            label: "FIELD NOTE",
          },
        ],
      },
      {
        id: "r06l6",
        title: "From poll to packet loop: readiness, AsyncRead & budgets",
        est: "~12 min",
        blocks: [
          {
            p: "Close the loop on the code you'll actually ship. When your daemon's receive task runs `sock.recv_from(&mut buf).await` on a `tokio::net::UdpSocket`, here's the first poll, demystified: try the **nonblocking** syscall immediately; if data is already queued, return `Ready` — no waiting machinery touched at all. If the kernel says `WouldBlock`, register the socket's read-interest waker with tokio's **IO driver** and return `Pending`. Lesson 3's `Delay`, with epoll as the timer thread.",
          },
          {
            code: {
              lang: "rust",
              title: "inside tokio's poll_recv (morally)",
              body: `fn poll_recv(&self, cx: &mut Context<'_>, buf: &mut ReadBuf<'_>) -> Poll<io::Result<()>> {
    loop {
        match self.try_recv_nonblocking(buf) {
            Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                // stash THIS poll's waker with the IO driver,
                // keyed to this socket's read readiness
                self.registration.register_read_waker(cx.waker());
                return Poll::Pending;
            }
            result => return Poll::Ready(result),
        }
    }
}`,
            },
          },
          {
            p: "The driver side is the part no one shows you: at socket creation tokio registered the fd with **mio**, which wraps the OS readiness API — `epoll` on Linux, `kqueue` on macOS. A worker thread with nothing to run parks inside `epoll_wait`. Your peer's datagram arrives; the kernel flags the fd readable; `epoll_wait` returns an event carrying the socket's token; the driver maps token → registered waker and calls `wake()`; your task lands on a run queue; a worker polls it; `poll_recv` retries the syscall and this time gets bytes: `Ready`. That chain — kernel event → driver → wake → queue → poll → `Ready` — is the anatomy of every await in your packet path, and it's this module's sequence lab.",
          },
          {
            p: "Name the model you've been living in: **readiness**. The OS never touches your buffer; it only tells you 'a syscall will succeed now,' and *you* perform it. The rival model is **completion** — Windows IOCP, Linux `io_uring` — where you lend the kernel a buffer up front ('read into this, tell me when it's done') and the notification means *finished*, bytes delivered. Completion can be faster (fewer syscalls, batch submission), but the kernel owning your buffer while you hold a cancellable future is an ownership riddle (drop the future — who owns the buffer mid-read?), which is why Rust's mainstream async IO grew up readiness-shaped and why tokio on Windows does contortions to emulate readiness. When the platform track (P02) hands you Wintun on an IOCP-native OS, this table is the context:",
          },
          {
            tbl: {
              head: ["", "Readiness (epoll, kqueue)", "Completion (IOCP, io_uring)"],
              rows: [
                [
                  "Notification means",
                  "'Trying now would succeed'",
                  "'Already done — here are your bytes'",
                ],
                ["Who does the IO", "You, after being notified", "The kernel, before notifying"],
                [
                  "Buffer during the wait",
                  "Yours; untouched until you act",
                  "Lent to the kernel for the duration",
                ],
                [
                  "Fit with poll/drop",
                  "Natural — Pending holds no kernel state",
                  "Awkward — cancelling must reclaim the buffer",
                ],
              ],
            },
          },
          {
            p: "One trait up from raw polls sits **`AsyncRead`**: `poll_read(self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &mut ReadBuf<'_>) -> Poll<io::Result<()>>` — every signature element now an old friend. (`ReadBuf` tracks filled-vs-initialized bytes so implementations can skip zeroing buffers — R02's allocation thrift, encoded in a type.) It matters to you because the **TUN device** from T01 is just an fd, and wrapping it in tokio's `AsyncFd` puts it under the same regime as the socket: readable event → nonblocking read → `WouldBlock` → re-arm and `Pending`. Your daemon's core is two readiness loops facing opposite directions — TUN-side plaintext, socket-side ciphertext — and now you know both are the same five lines.",
          },
          { h: "Cooperative scheduling: the loop that never yields" },
          {
            p: "The catch in all this elegance: async Rust is **cooperative**. A task yields the worker thread *only* at an `.await` that actually returns `Pending`. Now flood your tunnel with traffic: the socket is *always* readable, `poll_recv` returns `Ready` every single time, and your receive task never pauses. It has become a thread hog wearing async clothing — and its starving siblings include the WireGuard timer task from T03, the one that must fire rekeys and keepalives on deadlines.",
          },
          {
            p: "Tokio's defense is the **task budget**: each task gets an allowance (currently on the order of 128 operations) per scheduler tick, every tokio resource poll decrements it, and once it's spent, every subsequent resource poll returns `Pending` and self-wakes — a forced trip back to the run queue so siblings get the worker. Elegant, automatic... and *only counts tokio resources*. A CPU-heavy stretch — decrypt a batch, parse a config, walk a big routing table — contains no polls, burns no budget, and is invisible to the scheduler. For those, yield on your own schedule with `tokio::task::yield_now().await`, or evict the work to `spawn_blocking` (R03's law) if it's genuinely heavy.",
          },
          {
            code: {
              lang: "rust",
              title: "a hot packet loop that stays a good citizen",
              body: `let mut streak = 0u32;
loop {
    let (n, peer) = sock.recv_from(&mut buf).await?; // tokio-budgeted
    engine.decrypt_and_forward(&buf[..n], peer)?;    // pure CPU: invisible to the budget
    streak += 1;
    if streak % 64 == 0 {
        tokio::task::yield_now().await; // let timers, rekeys & siblings breathe
    }
}`,
            },
          },
          {
            note: "A throughput test that passes for exactly two minutes, then the tunnel drops: the flood kept the receive task's decrypt loop hot, the timer task ran late, a REKEY deadline slid past, and the peer discarded the expired session. Under load is precisely when timers matter most — and cooperative starvation strikes precisely under load. The postmortem line to remember: latency-critical tasks don't fail loudly when starved; they fail two minutes later, somewhere else. Budgets, yield_now, and tokio-console (watch for tasks with huge poll durations) are how you see it coming.",
            label: "FIELD NOTE",
          },
          {
            p: "And that's the module's promise kept. `.await` desugared end to end: a lazy state machine (lesson 1) polled under a contract (lesson 2) by an executor you could write (lesson 5), suspended at a fixed address (lesson 4) with its waker stashed at an event source (lesson 3), woken by an epoll event and requeued to completion (this lesson). When a tunnel hangs now, you won't ask 'why is async broken' — you'll ask *which link of that chain dropped*, and you'll know where each one lives.",
          },
        ],
      },
    ],
    exercises: [
      {
        id: "r06e1",
        type: "order",
        title: "Anatomy of a wakeup",
        kind: "SEQUENCE LAB",
        prompt:
          "Your daemon's receive task is suspended at sock.recv_from(&mut buf).await — its last poll returned Pending after registering with the IO driver. A datagram finally arrives from the peer. Order what happens, from kernel to your next line of code.",
        items: [
          "The datagram lands in the socket's kernel receive queue; the kernel marks the fd readable",
          "The IO driver, parked in epoll_wait, returns with a readiness event for that socket's token",
          "The driver looks up the waker registered for the socket's read interest and calls wake()",
          "wake() pushes the suspended task onto the executor's ready queue",
          "A worker thread dequeues the task and calls poll on its future",
          "poll_recv retries the nonblocking recvfrom, which now succeeds: Poll::Ready((n, peer))",
          "The task resumes on the line after .await, datagram in buf",
        ],
        why: "This chain is behind every await in your packet path: kernel event → driver → wake → queue → poll → Ready → your code. When a tunnel hangs, you debug by asking which link broke — and the usual answer is a Pending that never arranged its wake.",
      },
      {
        id: "r06e2",
        type: "blank",
        title: "Finish the Delay future",
        kind: "CODE LAB",
        prompt:
          "Complete this hand-written timer future so it honors the poll contract — the exact signature, the right Poll variants, and a waker handoff that actually reaches the timer thread.",
        code: `impl Future for Delay {
    type Output = ();

    fn poll(self: §0§, cx: &mut Context<'_>) -> Poll<()> {
        let mut s = self.shared.lock().unwrap();
        if s.done {
            return §1§;
        }
        // not ready: uphold the contract BEFORE returning Pending
        s.waker = Some(§2§);
        §3§
    }
}

// meanwhile, on the timer thread when the deadline fires:
//     s.done = true;                                  // publish first...
//     if let Some(w) = s.waker.take() { w.§4§; }      // ...then notify`,
        blanks: [
          { opts: ["Pin<&mut Self>", "&mut Self", "Arc<Mutex<Self>>"], a: 0 },
          { opts: ["Poll::Ready(())", "Poll::Pending", "Ok(())"], a: 0 },
          { opts: ["cx.waker().clone()", "cx.waker()", "cx.clone()"], a: 0 },
          { opts: ["Poll::Pending", "Poll::Ready(())", "s.waker.unwrap().wake()"], a: 0 },
          { opts: ["wake()", "clone()", "poll()"], a: 0 },
        ],
        why: "Pin<&mut Self> is the Future trait's exact receiver — memorize it. cx.waker() only lends a &Waker, so keeping it means clone() — stored fresh on every poll, never just the first. And Pending is only legal because the timer thread will wake() the stashed waker after publishing done = true, in that order.",
      },
      {
        id: "r06e3",
        type: "match",
        title: "The waker-and-pin lexicon",
        kind: "MATCH LAB",
        prompt:
          "Match each term to its precise meaning. This is the vocabulary of every async hang you will ever debug.",
        pairs: [
          {
            t: "Waker",
            d: "Cheap clonable handle meaning 'this task' — wake() tells the executor to requeue it",
          },
          {
            t: "Context<'_>",
            d: "What poll receives — today, essentially a carrier for the current task's Waker",
          },
          {
            t: "The Pending contract",
            d: "Return it only after arranging a wake — the executor will never re-poll you otherwise",
          },
          {
            t: "Unpin",
            d: "Auto-trait for types that don't care about moving after a pin — for them, Pin is a no-op",
          },
          {
            t: "Box::pin",
            d: "Pin via heap allocation: a movable handle to a future at one stable address for life",
          },
          {
            t: "Lost wakeup",
            d: "Readiness arrived but nobody woke the current waker — the silent forever-hang",
          },
          {
            t: "Spurious wakeup",
            d: "Polled without progress possible — explicitly legal; re-register and return Pending",
          },
          {
            t: "Task budget",
            d: "Tokio's per-tick allowance of resource ops that forces always-ready tasks off the worker",
          },
        ],
        why: "Spurious-versus-lost is the asymmetry the whole model balances on, and stale wakers plus budget exhaustion account for most real-world 'async is broken' tickets. Terms you can define are hangs you can diagnose.",
      },
    ],
    quiz: {
      id: "r06q",
      questions: [
        {
          q: "A hand-written poll returns Poll::Pending without storing the waker or arranging any notification. What has it just done?",
          opts: [
            "Nothing wrong — executors re-poll all pending tasks periodically",
            "Broken the poll contract: no wake will ever come, so the task sleeps forever with no error",
            "Caused a panic the next time the future is polled",
          ],
          a: 1,
          why: "Executors are event-driven, not spin loops — a wake is the only 'try again' signal that exists. The bug produces no panic and no log line, which is exactly what makes lost wakes the deadliest failure mode in async code.",
        },
        {
          q: "Your code runs `let f = send_keepalive(peer);` and then never awaits f. What happened on the network?",
          opts: [
            "The keepalive was sent — async fns start executing when called, like JS promises",
            "Nothing: calling an async fn only constructs the state machine; no body code runs until it's first polled",
            "The keepalive is sent when f goes out of scope and is dropped",
          ],
          a: 1,
          why: "Rust futures are lazy — f is an inert enum sitting in its Start state. Dropping it just discards the value. This laziness is what makes select!'s cancel-by-drop semantics (R03) coherent.",
        },
        {
          q: "Precisely what does Pin<&mut F> guarantee about a !Unpin future F?",
          opts: [
            "F is stored on the heap",
            "F's address will never change again before it's dropped, so pointers into its own state stay valid",
            "F can be safely sent to another thread",
          ],
          a: 1,
          why: "Pin says nothing about heap versus stack (pin! pins to the stack) and nothing about Send. Its single promise is 'no more moves' — which is exactly what a state machine holding references into its own locals needs to be sound.",
        },
        {
          q: "A Delay future stores the waker only on its first poll. Unit tests pass, but inside tokio::select! it hangs. Why?",
          opts: [
            "select! disables wakers on losing branches",
            "Later polls can deliver a different waker; waking the stale first one notifies a dead or wrong task handle, so the real task never runs",
            "The Mutex around the shared state deadlocks under select!",
          ],
          a: 1,
          why: "The contract's fine print: wake the waker from the most recent poll. block_on hands you the same waker forever, so the bug hides in tests; combinators and work-stealing runtimes hand you fresh ones. Clone and store on every pending poll.",
        },
        {
          q: "Under tokio, what actually wakes a task that's awaiting recv_from on an idle UDP socket?",
          opts: [
            "A background thread that re-polls every pending future in a loop",
            "The IO driver: an epoll/kqueue readiness event for that socket, mapped to the waker poll_recv registered, whose wake() requeues the task",
            "The kernel invokes the task's poll function directly via a callback",
          ],
          a: 1,
          why: "Nobody polls speculatively and the kernel never calls your code. The driver parks in the OS readiness wait, translates 'fd readable' into wake() on the registered waker, and the executor takes it from there — the exact chain in the sequence lab.",
        },
        {
          q: "Your future is woken and polled, but the condition it's waiting for still isn't true. The correct behavior is:",
          opts: [
            "Panic — a wake without readiness violates the poll contract",
            "Re-check, stash the current waker again, and return Pending — spurious wakeups are explicitly allowed",
            "Return Poll::Ready with a default value so the task can't hang",
          ],
          a: 1,
          why: "The contract demands at least the necessary wake, not at most. Spurious wakes cost a wasted poll; treating them as errors (or faking readiness) turns a harmless inefficiency into corruption. Only lost wakes are bugs.",
        },
        {
          q: "A flood test keeps your socket permanently readable and the receive task hot on one worker. Which statement is true?",
          opts: [
            "Async tasks are preemptively time-sliced, so sibling tasks are unaffected",
            "Tokio's budget forces Pending on resource polls, but pure-CPU stretches like a decrypt loop burn no budget — so hot paths still need yield_now (or spawn_blocking)",
            "The OS scheduler migrates the starved tasks to another core automatically",
          ],
          a: 1,
          why: "Scheduling is cooperative: only awaits that return Pending yield the worker. The budget automates that for tokio resources (~128 ops per tick), but CPU work between awaits is invisible to it — and the starved sibling is usually your timer task, missing rekey deadlines exactly when traffic peaks.",
        },
      ],
    },
  },
];
