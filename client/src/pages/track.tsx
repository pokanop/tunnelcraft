/* Per-track page: syllabus, outcomes, progress, and the final exam. */
import { useEffect } from "react";
import { useParams } from "@tanstack/react-router";
import { LayerGlyph } from "../lib/render";
import { TRACKS } from "../curriculum/tracks";
import { EXAM_LEN, EXAM_MINUTES, EXAM_PASS } from "../lib/exam";
import { byId, modStats } from "../lib/stats";
import { useApp } from "../App";

const OUTCOMES: Record<string, string[]> = {
  net: [
    "Read a packet capture and narrate exactly what happened, layer by layer",
    "Subnet any address space by hand — CIDR, VLSM, and IPv6 included",
    "Explain TCP internals: windows, congestion control, and the state machine",
    "Reason about routing (OSPF/BGP), NAT, DNS, TLS/QUIC, and cloud networks",
    "Operate at CompTIA Network+ / CCNA-level concept fluency",
  ],
  rust: [
    "Write idiomatic, type-driven Rust with confident error handling",
    "Build async network services on Tokio — and explain how futures work under the hood",
    "Cross the unsafe/FFI boundary correctly: aliasing, Send/Sync, atomics, the C ABI",
    "Ship with professional tooling: workspaces, tests, CI gates, tracing",
  ],
  tunnel: [
    "Move packets through TUN/TAP devices from your own code",
    "Explain Noise, AEAD crypto, and the WireGuard handshake end to end",
    "Drive boringtun in practice and debug real tunnel traffic",
    "Traverse NATs with STUN/ICE and relay through DERP when you can't",
  ],
  ship: [
    "Design a production VPN client architecture that survives real networks",
    "Master platform internals: Network Extension, wintun/WFP, policy routing, VpnService",
    "Handle proxies, PAC files, and split-tunnel strategy correctly",
    "Ship cross-platform with a capstone roadmap to follow",
  ],
};

export function TrackPage() {
  const { prog, go } = useApp();
  const params = useParams({ strict: false }) as { trackId?: string };
  const track = TRACKS.find((t) => t.id === params.trackId);
  useEffect(() => {
    if (!track) go({ v: "home" });
  }, [track]);
  if (!track) return null;

  const mods = track.modules.flatMap((id) => byId[id] ?? []);
  const t = mods.reduce(
    (a, m) => {
      const s = modStats(m, prog);
      a.t += s.total;
      a.d += s.done;
      a.lessons += m.lessons.length;
      a.labs += (m.exercises ?? []).length;
      a.mins += parseInt((m.est || "").replace(/\D/g, ""), 10) || 0;
      return a;
    },
    { t: 0, d: 0, lessons: 0, labs: 0, mins: 0 }
  );
  const tpct = t.t ? Math.round((t.d / t.t) * 100) : 0;
  const final = prog.meta.finals?.[track.id];
  const certified = final !== undefined && final >= EXAM_PASS;
  const firstUnfinished = mods.find((m) => modStats(m, prog).pct < 100) ?? mods[0];

  return (
    <div className="wrap">
      <div className="modhead">
        <button className="back" onClick={() => go({ v: "home" })}>
          ← all tracks
        </button>
        <p className="eyebrow">{track.code} // SYLLABUS</p>
        <h1 className="maph1">{track.title}</h1>
        <p className="sub mapsub">{track.blurb}</p>
        <div className="stats" style={{ marginTop: 18 }}>
          <div className="stat">
            <b>{mods.length}</b>
            <span>modules</span>
          </div>
          <div className="stat">
            <b>{t.lessons}</b>
            <span>lessons</span>
          </div>
          <div className="stat">
            <b>{t.labs}</b>
            <span>labs</span>
          </div>
          <div className="stat">
            <b>~{Math.round(t.mins / 60)}h</b>
            <span>est. time</span>
          </div>
          <div className="stat">
            <b>{tpct}%</b>
            <span>complete</span>
          </div>
        </div>
        <div className="land-cta" style={{ marginTop: 20 }}>
          {firstUnfinished && (
            <button className="btn" onClick={() => go({ v: "mod", id: firstUnfinished.id })}>
              {tpct > 0 ? "CONTINUE THIS TRACK →" : "START THIS TRACK →"}
            </button>
          )}
          <button className="btn ghost" onClick={() => go({ v: "exam", track: track.id })}>
            {certified ? "✓ CERTIFIED — RETAKE FINAL" : "SIT THE FINAL →"}
          </button>
        </div>
      </div>

      {OUTCOMES[track.id] && (
        <section className="trackout">
          <p className="gridttl">// WHAT YOU'LL BE ABLE TO DO</p>
          <ul className="trackout-list">
            {OUTCOMES[track.id]!.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <p className="gridttl">// MODULES, IN ORDER</p>
        <div className="syllist">
          {mods.map((m, i) => {
            const s = modStats(m, prog);
            const full = s.pct === 100;
            return (
              <button key={m.id} className="sylrow" onClick={() => go({ v: "mod", id: m.id })}>
                <span className="sylnum">{String(i + 1).padStart(2, "0")}</span>
                <LayerGlyph on={m.layers} />
                <span className="sylbody">
                  <span className={"card-code" + (full ? " done" : "")}>
                    {full ? "✓ " + m.code : m.code}
                  </span>
                  <span className="sylttl">{m.title}</span>
                  <span className="syltag">{m.tag}</span>
                </span>
                <span className="sylmeta">
                  <span>{m.est}</span>
                  <span>
                    {m.lessons.length} lessons
                    {(m.exercises ?? []).length ? " · " + (m.exercises ?? []).length + " labs" : ""}
                    {m.quiz ? " · quiz" : ""}
                  </span>
                  <span className="minibar">
                    <i style={{ width: s.pct + "%" }} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="trackexam" style={{ marginTop: 26 }}>
        <span className="trackexam-t">
          FINAL EXAM · {EXAM_LEN} QUESTIONS · {EXAM_MINUTES} MIN · PASS {EXAM_PASS}%
        </span>
        <span className={"trackexam-s" + (certified ? " certok" : "")}>
          {certified
            ? "✓ CERTIFIED — BEST " + final + "%"
            : final !== undefined
              ? "BEST " + final + "%"
              : "NOT ATTEMPTED"}
        </span>
        <button
          className="btn ghost trackexam-btn"
          onClick={() => go({ v: "exam", track: track.id })}
        >
          {certified ? "RETAKE →" : final !== undefined ? "TRY AGAIN →" : "SIT THE EXAM →"}
        </button>
      </section>
    </div>
  );
}
