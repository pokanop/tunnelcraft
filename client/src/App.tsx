import { useEffect, useRef, useState } from "react";
import { Blocks, LayerGlyph, LayerTags } from "./lib/render";
import { OrderEx, BlankEx, CidrTrainer, Checklist, Quiz } from "./components/exercises";
import { MatchEx, PortDrill } from "./components/extra";
import { AuthView } from "./components/auth";
import { AccountView } from "./components/account";
import { SearchOverlay } from "./components/search";
import { ReviewView } from "./components/review";
import { recordMiss, recordReview, deckStats } from "./lib/review";
import { VerifyBanner } from "./components/verify";
import { ALL_MODULES, TRACKS } from "./curriculum/tracks";
import {
  api,
  ApiError,
  getToken,
  setToken,
  EMPTY_PROGRESS,
  mergeProgress,
  loadLocal,
  saveLocal,
} from "./lib/api";
import type { PublicUser } from "./lib/api";
import { emptyProgress } from "./lib/progress";
import type { Progress } from "./lib/progress";
import { useTheme } from "./lib/theme";
import type { CheckExercise, Exercise, Lesson, Module } from "./curriculum/types";
import type { SearchResult } from "./lib/search";

export type Route =
  | { v: "home" }
  | { v: "auth" }
  | { v: "account" }
  | { v: "review" }
  | { v: "mod"; id: string; tab?: string };

type SyncState = "local" | "saving" | "synced" | "offline";

const byId: Record<string, Module> = Object.fromEntries(ALL_MODULES.map((m) => [m.id, m]));

/* ---------- shared stats ---------- */
function modStats(mod: Module, prog: Progress): { total: number; done: number; pct: number } {
  const lesDone = mod.lessons.filter((l) => prog.les[l.id]).length;
  const exDone = (mod.exercises ?? []).filter((e) => prog.ex[e.id]).length;
  const quizN = mod.quiz ? 1 : 0;
  const quizDone = mod.quiz && (prog.quiz[mod.id] ?? 0) >= 70 ? 1 : 0;
  const total = mod.lessons.length + (mod.exercises ?? []).length + quizN;
  const done = lesDone + exDone + quizDone;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}
const totalHours = Math.round(
  ALL_MODULES.reduce((a, m) => a + (parseInt((m.est || "").replace(/\D/g, ""), 10) || 0), 0) / 60
);

/* ---------- exercise dispatcher ---------- */
interface ExerciseViewProps {
  ex: Exercise;
  prog: Progress;
  exDone: (id: string) => void;
  capToggle: (ex: CheckExercise, i: number) => void;
}

function ExerciseView({ ex, prog, exDone, capToggle }: ExerciseViewProps) {
  const done = !!prog.ex[ex.id];
  const onDone = () => exDone(ex.id);
  switch (ex.type) {
    case "order":
      return <OrderEx ex={ex} done={done} onDone={onDone} />;
    case "blank":
      return <BlankEx ex={ex} done={done} onDone={onDone} />;
    case "cidr":
      return <CidrTrainer ex={ex} done={done} onDone={onDone} />;
    case "match":
      return <MatchEx ex={ex} done={done} onDone={onDone} />;
    case "ports":
      return <PortDrill ex={ex} done={done} onDone={onDone} />;
    case "check":
      return <Checklist ex={ex} cap={prog.cap} done={done} onToggle={capToggle} />;
    default:
      return null;
  }
}

/* ---------- module view ---------- */
interface ModTab {
  key: string;
  label: string | null;
  lesson?: Lesson;
}

interface ModuleViewProps {
  mod: Module;
  prog: Progress;
  update: (fn: (p: Progress) => void) => void;
  go: (r: Route) => void;
  mIdx: number;
  initialTab: string | undefined;
}

function ModuleView({ mod, prog, update, go, mIdx, initialTab }: ModuleViewProps) {
  const tabs: ModTab[] = [
    ...mod.lessons.map((l) => ({ key: l.id, label: null, lesson: l })),
    ...(mod.exercises && mod.exercises.length ? [{ key: "lab", label: "LAB" }] : []),
    ...(mod.quiz ? [{ key: "quiz", label: "QUIZ" }] : []),
  ];
  // Every module has at least one lesson, so tabs is never empty.
  const validTab = (t: string | undefined) =>
    t && tabs.some((x) => x.key === t) ? t : tabs[0]!.key;
  const [tab, setTab] = useState<string>(validTab(initialTab));
  useEffect(() => {
    setTab(validTab(initialTab));
    window.scrollTo(0, 0);
  }, [mod.id, initialTab]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  const tIdx = tabs.findIndex((t) => t.key === tab);
  const cur = tabs[tIdx];
  const curLesson = cur?.lesson;
  const prevTab = tIdx > 0 ? tabs[tIdx - 1] : undefined;
  const nextTab = tIdx >= 0 ? tabs[tIdx + 1] : undefined;
  const prevMod = mIdx > 0 ? ALL_MODULES[mIdx - 1] : undefined;
  const nextMod = ALL_MODULES[mIdx + 1];
  const exsDone =
    mod.exercises && mod.exercises.length ? mod.exercises.every((e) => prog.ex[e.id]) : true;
  const quizDone = mod.quiz ? (prog.quiz[mod.id] ?? 0) >= 70 : true;

  const chipDone = (t: ModTab): boolean => {
    if (t.lesson) return !!prog.les[t.lesson.id];
    if (t.key === "lab") return exsDone && (mod.exercises?.length ?? 0) > 0;
    if (t.key === "quiz") return quizDone && !!mod.quiz;
    return false;
  };
  const chipLabel = (t: ModTab, i: number): string => {
    if (t.lesson) return (chipDone(t) ? "✓ " : "") + (i + 1) + ". " + t.lesson.title;
    return (chipDone(t) ? "✓ " : "") + (t.label ?? "");
  };

  const markDone = (lid: string) => {
    update((p) => {
      p.les[lid] = true;
    });
    const nt = tabs[tIdx + 1];
    if (nt) setTab(nt.key);
  };
  const exDone = (eid: string) =>
    update((p) => {
      p.ex[eid] = true;
    });
  const capToggle = (ex: CheckExercise, i: number) =>
    update((p) => {
      const k = ex.id + ":" + i;
      p.cap[k] = !p.cap[k];
      p.ex[ex.id] = ex.items.every((_, j) => p.cap[ex.id + ":" + j]);
    });
  const quizScore = (pct: number) =>
    update((p) => {
      p.quiz[mod.id] = Math.max(p.quiz[mod.id] ?? 0, pct);
    });
  const quizMiss = (modId: string, qIndex: number) =>
    update((p) => {
      recordMiss(p.rev, modId, qIndex);
    });

  return (
    <div className="wrap">
      <div className="modhead">
        <button className="back" onClick={() => go({ v: "home" })}>
          ← all modules
        </button>
        <div className="modhead-row">
          <LayerGlyph on={mod.layers} size="lg" />
          <div>
            <div className="modcode">
              {mod.code} · {mod.est}
            </div>
            <h2 className="modtitle">{mod.title}</h2>
            <p className="modtag">{mod.tag}</p>
            <LayerTags on={mod.layers} />
          </div>
        </div>
      </div>

      <div className="chips" role="tablist">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === tab}
            className={"chip" + (t.key === tab ? " on" : "") + (chipDone(t) ? " donechip" : "")}
            onClick={() => setTab(t.key)}
          >
            {chipLabel(t, i)}
          </button>
        ))}
      </div>

      {curLesson && (
        <article className="lesson">
          <div className="lesson-est">
            {curLesson.est} · lesson {tIdx + 1} of {mod.lessons.length}
          </div>
          <h3 className="lesson-ttl">{curLesson.title}</h3>
          <Blocks blocks={curLesson.blocks} />
          <div className="exrow">
            {prog.les[curLesson.id] ? (
              <button className="btn okbtn">✓ COMPLETED</button>
            ) : (
              <button className="btn" onClick={() => markDone(curLesson.id)}>
                MARK COMPLETE →
              </button>
            )}
          </div>
        </article>
      )}

      {cur?.key === "lab" &&
        (mod.exercises ?? []).map((ex) => (
          <ExerciseView key={ex.id} ex={ex} prog={prog} exDone={exDone} capToggle={capToggle} />
        ))}

      {cur?.key === "quiz" && (
        <Quiz mod={mod} best={prog.quiz[mod.id]} onScore={quizScore} onMiss={quizMiss} />
      )}

      <div className="navrow">
        <button
          className="btn ghost"
          disabled={tIdx === 0 && mIdx === 0}
          onClick={() => {
            if (prevTab) setTab(prevTab.key);
            else if (prevMod) go({ v: "mod", id: prevMod.id });
          }}
        >
          ← PREV
        </button>
        {nextTab ? (
          <button className="btn ghost" onClick={() => setTab(nextTab.key)}>
            NEXT →
          </button>
        ) : nextMod ? (
          <button className="btn" onClick={() => go({ v: "mod", id: nextMod.id })}>
            NEXT MODULE: {nextMod.code} →
          </button>
        ) : (
          <button className="btn" onClick={() => go({ v: "home" })}>
            FINISH — BACK TO MAP
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- home (track-sectioned) ---------- */
function Home({ prog, go }: { prog: Progress; go: (r: Route) => void }) {
  const totals = ALL_MODULES.reduce(
    (a, m) => {
      const s = modStats(m, prog);
      a.total += s.total;
      a.done += s.done;
      a.lessons += m.lessons.length;
      a.labs += (m.exercises ?? []).length;
      a.quizzes += m.quiz ? 1 : 0;
      return a;
    },
    { total: 0, done: 0, lessons: 0, labs: 0, quizzes: 0 }
  );

  const firstIncomplete = (): string => {
    for (const m of ALL_MODULES) {
      const s = modStats(m, prog);
      if (s.done < s.total) return m.id;
    }
    // The curriculum is never empty.
    return ALL_MODULES[0]!.id;
  };
  const started = totals.done > 0;
  const finished = totals.done >= totals.total;

  return (
    <div className="wrap">
      <section className="hero">
        <p className="eyebrow">TUNNELCRAFT // FIELD MANUAL</p>
        <h1 className="h1">
          From first packet to <em>production tunnel.</em>
        </h1>
        <p className="sub">
          Four tracks, one skill set. Track 1 takes you from zero to certifiable network
          professional — layers, Ethernet, IP, subnetting, TCP internals, routing, DNS, TLS,
          tooling, security. Tracks 2–4 turn that into engineering: Rust, WireGuard, NAT traversal,
          and the architecture of a real cross-platform client — Flows, engines, carriages, config
          brokers, and posture.
        </p>
        <div className="hand" aria-hidden="true">
          <span className="hs">01 HANDSHAKE INITIATION →</span>
          <span className="hs h2s">← 02 HANDSHAKE RESPONSE</span>
          <span className="hs h3s">03 TRANSPORT DATA ⇄</span>
        </div>
        <button className="btn" onClick={() => go({ v: "mod", id: firstIncomplete() })}>
          {finished ? "REVISIT THE MAP" : started ? "RESUME TRAINING →" : "BEGIN TRANSMISSION →"}
        </button>
        <div className="stats" style={{ marginTop: 28 }}>
          <div className="stat">
            <b>{ALL_MODULES.length}</b>
            <span>modules</span>
          </div>
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
            <b>~{totalHours}h</b>
            <span>total path</span>
          </div>
        </div>
      </section>

      {TRACKS.map((tr) => {
        const mods = tr.modules.flatMap((id) => byId[id] ?? []);
        const t = mods.reduce(
          (a, m) => {
            const s = modStats(m, prog);
            a.t += s.total;
            a.d += s.done;
            return a;
          },
          { t: 0, d: 0 }
        );
        const tpct = t.t ? Math.round((t.d / t.t) * 100) : 0;
        return (
          <section key={tr.id} className="trackblock">
            <div className="trackhead">
              <div>
                <p className="gridttl">
                  // {tr.code} — {tr.title.toUpperCase()}
                </p>
                <p className="trackblurb">{tr.blurb}</p>
              </div>
              <div className="trackpct">{tpct}%</div>
            </div>
            <div className="grid">
              {mods.map((m) => {
                const s = modStats(m, prog);
                const full = s.pct === 100;
                return (
                  <button key={m.id} className="card" onClick={() => go({ v: "mod", id: m.id })}>
                    <LayerGlyph on={m.layers} />
                    <div className="card-body">
                      <div className={"card-code" + (full ? " done" : "")}>
                        {full ? "✓ " + m.code : m.code}
                        <span style={{ float: "right", color: "var(--dim)", fontWeight: 400 }}>
                          {m.est}
                        </span>
                      </div>
                      <div className="card-title">{m.title}</div>
                      <div className="card-tag">{m.tag}</div>
                      <div className="card-meta">
                        {m.lessons.length} lessons
                        {(m.exercises ?? []).length
                          ? " · " +
                            (m.exercises ?? []).length +
                            " lab" +
                            ((m.exercises ?? []).length > 1 ? "s" : "")
                          : ""}
                        {m.quiz ? " · quiz" : ""}
                      </div>
                      <div className="minibar">
                        <i style={{ width: s.pct + "%" }} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- app shell: auth + sync ---------- */
export default function App() {
  const [route, setRoute] = useState<Route>({ v: "home" });
  const [prog, setProg] = useState<Progress>(EMPTY_PROGRESS);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [sync, setSync] = useState<SyncState>("local");
  const [resetArm, setResetArm] = useState(false);
  const [theme, cycleTheme] = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const progRef = useRef<Progress>(prog);
  progRef.current = prog;

  /* boot: local first, then session restore + server merge */
  useEffect(() => {
    if (
      window.location.hash.startsWith("#reset=") ||
      window.location.hash.startsWith("#oauth_error=")
    ) {
      setRoute({ v: "auth" });
    }
    const local = loadLocal();
    setProg(local);
    if (!getToken()) return;
    (async () => {
      try {
        const me = await api.me();
        setUser(me.user);
        const srv = await api.getProgress();
        const merged = mergeProgress(loadLocal(), srv.data || EMPTY_PROGRESS);
        setProg(merged);
        saveLocal(merged);
        await api.putProgress(merged);
        setSync("synced");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setToken(null);
          setSync("local");
        } else setSync("offline");
      }
    })();
  }, []);

  const pushSoon = () => {
    if (!getToken()) return;
    setSync("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await api.putProgress(progRef.current);
        setSync("synced");
      } catch (e) {
        const unauthorized = e instanceof ApiError && e.status === 401;
        setSync(unauthorized ? "local" : "offline");
        if (unauthorized) setToken(null);
      }
    }, 800);
  };

  const update = (fn: (p: Progress) => void) => {
    setProg((old) => {
      // Deep-clone of our own JSON-serializable state.
      const next = JSON.parse(JSON.stringify(old)) as Progress;
      fn(next);
      saveLocal(next);
      return next;
    });
    pushSoon();
  };

  const go = (r: Route) => {
    setRoute(r);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(
        (document.activeElement && document.activeElement.tagName) || ""
      );
      if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* search result → module view on the right tab (lesson id, "lab", or "quiz") */
  const jumpTo = (r: SearchResult) => go({ v: "mod", id: r.modId, tab: r.tab });

  /* review answers reschedule cards in the Leitner deck */
  const reviewAnswer = (key: string, correct: boolean) =>
    update((p) => {
      recordReview(p.rev, key, correct);
    });
  const due = deckStats(prog.rev).due;

  const onAuthed = async (u: PublicUser) => {
    setUser(u);
    go({ v: "home" });
    try {
      const srv = await api.getProgress();
      const merged = mergeProgress(progRef.current, srv.data || EMPTY_PROGRESS);
      setProg(merged);
      saveLocal(merged);
      await api.putProgress(merged);
      setSync("synced");
    } catch {
      setSync("offline");
    }
  };

  const signOut = () => {
    api.logout().catch(() => {}); // best-effort server revoke; token cleared regardless
    setToken(null);
    setUser(null);
    setSync("local");
    go({ v: "home" });
  };
  const onDeleted = () => {
    setToken(null);
    setUser(null);
    setSync("local");
    const empty = emptyProgress();
    setProg(empty);
    saveLocal(empty);
    go({ v: "home" });
  };

  const totals = ALL_MODULES.reduce(
    (a, m) => {
      const s = modStats(m, prog);
      a.t += s.total;
      a.d += s.done;
      return a;
    },
    { t: 0, d: 0 }
  );
  const pct = totals.t ? Math.round((totals.d / totals.t) * 100) : 0;

  const doReset = () => {
    if (!resetArm) {
      setResetArm(true);
      setTimeout(() => setResetArm(false), 4000);
      return;
    }
    const empty = emptyProgress();
    setProg(empty);
    saveLocal(empty);
    if (getToken()) api.putProgress(empty).catch(() => {});
    setResetArm(false);
    go({ v: "home" });
  };

  const curMod = route.v === "mod" ? ALL_MODULES.find((m) => m.id === route.id) : undefined;
  const mIdx = curMod ? ALL_MODULES.indexOf(curMod) : -1;
  const syncLabel = user
    ? sync === "saving"
      ? "SAVING…"
      : sync === "offline"
        ? "OFFLINE — LOCAL COPY SAFE"
        : "SYNCED " + pct + "%"
    : "GUEST · LOCAL " + pct + "%";

  return (
    <div className="tc">
      <a className="skiplink" href="#main">
        Skip to content
      </a>
      <header className="hdr">
        <div className="hdr-in">
          <button className="wordmark" onClick={() => go({ v: "home" })}>
            TUNNEL<span className="tx">CRAFT</span>
            <small>NETWORKING · RUST · VPN ENGINEERING</small>
          </button>
          <div className="hdr-right">
            <div className="sync">
              <span className="sync-t">{syncLabel}</span>
              <div className="syncbar">
                <i style={{ width: pct + "%" }} />
              </div>
            </div>
            <button
              className="acct"
              onClick={() => setSearchOpen(true)}
              aria-label="Search the curriculum (slash or Ctrl+K)"
            >
              ⌕ SEARCH
            </button>
            <button
              className="acct reviewbtn"
              onClick={() => go({ v: "review" })}
              aria-label={due > 0 ? "Review mode — " + due + " cards due" : "Review mode"}
            >
              REVIEW
              {due > 0 && (
                <span className="duebadge" aria-hidden="true">
                  {due}
                </span>
              )}
            </button>
            <button
              className="acct themebtn"
              onClick={cycleTheme}
              title="Theme: cycles system → light → dark"
            >
              {theme === "system" ? "◐ SYSTEM" : theme === "light" ? "○ LIGHT" : "● DARK"}
            </button>
            {user ? (
              <button
                className="acct"
                onClick={() => go({ v: "account" })}
                title="Account & sessions"
              >
                {(user.displayName || user.email).toUpperCase()}
              </button>
            ) : (
              <button className="acct" onClick={() => go({ v: "auth" })}>
                SIGN IN
              </button>
            )}
          </div>
        </div>
      </header>

      <VerifyBanner
        user={user}
        onVerified={() => setUser((u) => (u ? { ...u, emailVerified: true } : u))}
      />

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onJump={jumpTo} />

      <main id="main" tabIndex={-1}>
        {route.v === "home" && <Home prog={prog} go={go} />}
        {route.v === "auth" && <AuthView onAuthed={onAuthed} onBack={() => go({ v: "home" })} />}
        {route.v === "account" && user && (
          <AccountView
            user={user}
            onSignOut={signOut}
            onDeleted={onDeleted}
            onBack={() => go({ v: "home" })}
          />
        )}
        {route.v === "review" && (
          <ReviewView byId={byId} prog={prog} onAnswer={reviewAnswer} go={go} />
        )}
        {route.v === "mod" && curMod && (
          <ModuleView
            mod={curMod}
            mIdx={mIdx}
            prog={prog}
            update={update}
            go={go}
            initialTab={route.tab}
          />
        )}
      </main>

      <div className="wrap">
        <footer className="footer">
          <span>
            TUNNELCRAFT ·{" "}
            {user
              ? "progress synced to your account"
              : "guest progress on this device — sign in to sync"}{" "}
            · {totals.d}/{totals.t} units complete
          </span>
          <button className="reset" onClick={doReset}>
            {resetArm ? "TAP AGAIN TO WIPE PROGRESS" : "RESET PROGRESS"}
          </button>
        </footer>
      </div>
    </div>
  );
}
