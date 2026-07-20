/* Marketing landing — the front door for signed-out visitors.
   Signed-in visitors are bounced straight to their dashboard. */
import { Link, Navigate } from "@tanstack/react-router";
import { Reveal } from "../lib/reveal";
import { getToken } from "../lib/api";
import { TRACKS } from "../curriculum/tracks";
import { byId, grandTotals, totalHours } from "../lib/stats";
import { DiagramView } from "../lib/diagram";
import { Donate } from "../components/donate";
import { useApp } from "../App";

const trackMeta = (
  modIds: string[]
): { mods: number; lessons: number; labs: number; hrs: number } => {
  let lessons = 0;
  let labs = 0;
  let mins = 0;
  for (const id of modIds) {
    const m = byId[id];
    if (!m) continue;
    lessons += m.lessons.length;
    labs += (m.exercises ?? []).length;
    mins += parseInt((m.est || "").replace(/\D/g, ""), 10) || 0;
  }
  return { mods: modIds.length, lessons, labs, hrs: Math.round(mins / 60) };
};

export function LandingPage() {
  const { prog, go } = useApp();
  if (getToken()) return <Navigate to="/dashboard" replace />;
  const totals = grandTotals(prog);
  const started = totals.done > 0;

  return (
    <div className="landing">
      {/* ---------- hero ---------- */}
      <section className="hero land-hero">
        <div className="wrap">
          <p className="eyebrow">TUNNELCRAFT // FIELD MANUAL FOR TUNNEL ENGINEERS</p>
          <h1 className="h1">
            From first packet to <em>production tunnel.</em>
          </h1>
          <p className="sub">
            The complete path from networking zero to shipping a real cross-platform VPN client:
            layers, subnets, TCP internals, routing, and DNS — then Rust, WireGuard, NAT traversal,
            and platform internals. Taught with hands-on labs, timed finals, and diagrams that make
            the wire visible.
          </p>
          <div className="hand" aria-hidden="true">
            <span className="hs">01 HANDSHAKE INITIATION →</span>
            <span className="hs h2s">← 02 HANDSHAKE RESPONSE</span>
            <span className="hs h3s">03 TRANSPORT DATA ⇄</span>
          </div>
          <div className="land-cta">
            <button className="btn" onClick={() => go({ v: "home" })}>
              {started ? "RESUME TRAINING →" : "START LEARNING →"}
            </button>
            <button className="btn ghost" onClick={() => go({ v: "auth" })}>
              CREATE AN ACCOUNT
            </button>
          </div>
          <p className="land-fine">
            Free and open source. No sign-up required — progress lives on this device until you
            create an account, then follows you everywhere.
          </p>
          <div className="stats" style={{ marginTop: 30 }}>
            <div className="stat">
              <b>{totals.lessons}</b>
              <span>lessons</span>
            </div>
            <div className="stat">
              <b>{totals.labs}</b>
              <span>hands-on labs</span>
            </div>
            <div className="stat">
              <b>{totals.quizzes}</b>
              <span>checkpoints</span>
            </div>
            <div className="stat">
              <b>4</b>
              <span>timed finals</span>
            </div>
            <div className="stat">
              <b>~{totalHours}h</b>
              <span>total path</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- live diagram showcase ---------- */}
      <section className="land-sec">
        <div className="wrap">
          <p className="gridttl">// SEE THE WIRE</p>
          <h2 className="land-h2">Every concept, drawn — not described.</h2>
          <p className="sub land-sub">
            Lessons teach with live, themed diagrams: encapsulation layouts, handshakes, state
            machines, and topologies you can actually read. Here's what a WireGuard-tunneled web
            request really looks like on the wire:
          </p>
          <DiagramView
            d={{
              kind: "packet",
              title: "A tunneled request, on the wire",
              segs: [
                { label: "Ethernet", tone: "l2" },
                { label: "IP", sub: "you → VPN server", tone: "l3" },
                { label: "UDP", sub: ":51820", tone: "l4" },
                { label: "WG header", tone: "acc" },
                {
                  label: "encrypted",
                  sub: "ChaCha20-Poly1305",
                  tone: "acc",
                  inner: [
                    { label: "IP", sub: "you → site", tone: "l3" },
                    { label: "TCP", sub: ":443", tone: "l4" },
                    { label: "TLS", tone: "l6" },
                    { label: "HTTP", tone: "l7" },
                  ],
                },
              ],
              caption:
                "The inner packet is a complete, routable IP packet — the tunnel just wraps it.",
            }}
          />
          <DiagramView
            d={{
              kind: "seq",
              title: "The WireGuard handshake",
              actors: [
                { id: "i", label: "INITIATOR", sub: "your device", tone: "acc" },
                { id: "r", label: "RESPONDER", sub: "VPN server", tone: "l3" },
              ],
              steps: [
                { from: "i", to: "r", label: "01 handshake initiation", tone: "acc" },
                { from: "r", to: "i", label: "02 handshake response", tone: "l3" },
                { note: "session keys derived — 1-RTT" },
                { from: "i", to: "r", label: "03 transport data", tone: "ok" },
                { from: "r", to: "i", label: "03 transport data", tone: "ok" },
              ],
            }}
          />
        </div>
      </section>

      {/* ---------- tracks ---------- */}
      <section className="land-sec land-alt">
        <div className="wrap">
          <p className="gridttl">// THE PATH</p>
          <h2 className="land-h2">Four tracks. One skill set.</h2>
          <Reveal className="land-tracks" stagger>
            {TRACKS.map((tr) => {
              const meta = trackMeta(tr.modules);
              return (
                <Link
                  key={tr.id}
                  to="/tracks/$trackId"
                  params={{ trackId: tr.id }}
                  className="land-track"
                >
                  <span className="land-track-code">{tr.code}</span>
                  <span className="land-track-ttl">{tr.title}</span>
                  <span className="land-track-blurb">{tr.blurb}</span>
                  <span className="land-track-meta">
                    {meta.mods} modules · {meta.lessons} lessons · {meta.labs} labs · ~{meta.hrs}h
                  </span>
                  <span className="land-track-go">VIEW SYLLABUS →</span>
                </Link>
              );
            })}
          </Reveal>
        </div>
      </section>

      {/* ---------- features ---------- */}
      <section className="land-sec">
        <div className="wrap">
          <p className="gridttl">// BUILT FOR RETENTION</p>
          <h2 className="land-h2">Not a video course. A training system.</h2>
          <Reveal className="land-feats" stagger>
            <div className="land-feat">
              <span className="land-feat-k">#</span>
              <b>Hands-on labs</b>
              <p>
                Packet hex decodes, Wireshark-style capture analysis, infinite CIDR & VLSM drills,
                port drills, code fill-ins, and sequence builders — 62 labs that make you do the
                work.
              </p>
            </div>
            <div className="land-feat">
              <span className="land-feat-k">▣</span>
              <b>Timed finals & certificates</b>
              <p>
                Each track ends in a certification-style exam: 24 questions drawn fresh each
                sitting, 30 minutes, pass at 75%. Pass and print your certificate.
              </p>
            </div>
            <div className="land-feat">
              <span className="land-feat-k">↻</span>
              <b>Spaced-repetition review</b>
              <p>
                Every miss lands in a Leitner review deck. Clear your due cards daily and weak spots
                become strengths instead of blind spots.
              </p>
            </div>
            <div className="land-feat">
              <span className="land-feat-k">⌕</span>
              <b>Instant search</b>
              <p>
                Full-text search across every lesson, lab, and quiz — ranked, snippeted, and
                keyboard-first. Press <code className="ic">/</code> anywhere.
              </p>
            </div>
            <div className="land-feat">
              <span className="land-feat-k">⚡</span>
              <b>Streaks, notes & bookmarks</b>
              <p>
                A daily streak keeps momentum, per-lesson field notes and bookmarks keep context,
                and lesson-precise resume drops you exactly where you left off.
              </p>
            </div>
            <div className="land-feat">
              <span className="land-feat-k">⇄</span>
              <b>Sync everywhere</b>
              <p>
                Progress syncs to your account on every change and merges cleanly across devices.
                Optional study reminders when a day is about to slip.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- glossary + rust teaser ---------- */}
      <section className="land-sec land-alt">
        <Reveal className="wrap land-duo">
          <div>
            <p className="gridttl">// FIELD GLOSSARY</p>
            <h3 className="land-h3">225 terms, deep-linked</h3>
            <p className="sub land-sub">
              Every term links back to the module that teaches it. ARP to zero trust, wakers to WFP.
            </p>
            <button className="btn ghost" onClick={() => go({ v: "glossary" })}>
              BROWSE THE GLOSSARY →
            </button>
          </div>
          <div>
            <p className="gridttl">// RUNNABLE RUST</p>
            <h3 className="land-h3">One-click playground</h3>
            <p className="sub land-sub">
              Self-contained Rust examples carry a "run on playground" link — read the theory, then
              execute it.
            </p>
            <button className="btn ghost" onClick={() => go({ v: "home" })}>
              SEE THE CURRICULUM →
            </button>
          </div>
        </Reveal>
      </section>

      {/* ---------- final CTA ---------- */}
      <section className="land-sec land-final">
        <div className="wrap">
          <h2 className="land-h2">Begin transmission.</h2>
          <p className="sub land-sub">
            Free and open source — no sign-up required. Your first packet is one click away.
          </p>
          <div className="land-cta">
            <button className="btn" onClick={() => go({ v: "home" })}>
              START LEARNING →
            </button>
            <button className="btn ghost" onClick={() => go({ v: "auth" })}>
              SIGN IN
            </button>
          </div>
          <Donate variant="buttons" />
        </div>
      </section>
    </div>
  );
}
