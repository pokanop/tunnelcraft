/* Module view: lessons, labs, quiz — tabs are URL-addressable (/m/:id/:tab). */
import { useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { Blocks, LayerGlyph, LayerTags } from "../lib/render";
import { OrderEx, BlankEx, CidrTrainer, Checklist, Quiz } from "../components/exercises";
import { MatchEx, PortDrill } from "../components/extra";
import { HexEx, PcapEx, VlsmEx } from "../components/labs";
import { recordMiss, recordMissCard } from "../lib/review";
import type { MissFn } from "../lib/review";
import { ALL_MODULES } from "../curriculum/tracks";
import { byId } from "../lib/stats";
import { useApp } from "../App";
import type { CheckExercise, Exercise, Lesson, Module } from "../curriculum/types";
import type { Progress } from "../lib/progress";

/* ---------- exercise dispatcher ---------- */
interface ExerciseViewProps {
  ex: Exercise;
  prog: Progress;
  exDone: (id: string) => void;
  capToggle: (ex: CheckExercise, i: number) => void;
  miss: MissFn;
}

function ExerciseView({ ex, prog, exDone, capToggle, miss }: ExerciseViewProps) {
  const done = !!prog.ex[ex.id];
  const onDone = () => exDone(ex.id);
  switch (ex.type) {
    case "order":
      return <OrderEx ex={ex} done={done} onDone={onDone} />;
    case "blank":
      return <BlankEx ex={ex} done={done} onDone={onDone} />;
    case "cidr":
      return <CidrTrainer ex={ex} done={done} onDone={onDone} miss={miss} />;
    case "match":
      return <MatchEx ex={ex} done={done} onDone={onDone} />;
    case "ports":
      return <PortDrill ex={ex} done={done} onDone={onDone} miss={miss} />;
    case "hex":
      return <HexEx ex={ex} done={done} onDone={onDone} miss={miss} />;
    case "pcap":
      return <PcapEx ex={ex} done={done} onDone={onDone} miss={miss} />;
    case "vlsm":
      return <VlsmEx ex={ex} done={done} onDone={onDone} miss={miss} />;
    case "check":
      return <Checklist ex={ex} cap={prog.cap} done={done} onToggle={capToggle} />;
    default:
      return null;
  }
}

/* ---------- per-lesson field notes (debounced into the progress blob) ---------- */
function LessonNotes({
  lessonId,
  note,
  save,
}: {
  lessonId: string;
  note: string;
  save: (v: string) => void;
}) {
  const [val, setVal] = useState(note);
  const [open, setOpen] = useState(note !== "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    setVal(note);
    setOpen(note !== "");
    return () => clearTimeout(timer.current);
  }, [lessonId]);
  const onChange = (v: string) => {
    setVal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(v), 600);
  };
  return (
    <div className="notesbox">
      <button className="notestoggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        ✎ FIELD NOTES {open ? "▾" : "▸"}
        {!open && val.trim() ? <span className="notesdot" aria-hidden="true" /> : null}
      </button>
      {open && (
        <textarea
          className="notesarea"
          placeholder="Your notes on this lesson — saved with your progress…"
          value={val}
          rows={4}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => save(val)}
        />
      )}
    </div>
  );
}

/* ---------- module view ---------- */
interface ModTab {
  key: string;
  label: string | null;
  lesson?: Lesson;
}

function ModuleView({
  mod,
  mIdx,
  initialTab,
}: {
  mod: Module;
  mIdx: number;
  initialTab: string | undefined;
}) {
  const { prog, update, go } = useApp();
  const tabs: ModTab[] = [
    ...mod.lessons.map((l) => ({ key: l.id, label: null, lesson: l })),
    ...(mod.exercises && mod.exercises.length ? [{ key: "lab", label: "LAB" }] : []),
    ...(mod.quiz ? [{ key: "quiz", label: "QUIZ" }] : []),
  ];
  // Every module has at least one lesson, so tabs is never empty.
  const tab = initialTab && tabs.some((x) => x.key === initialTab) ? initialTab : tabs[0]!.key;
  const setTab = (k: string) => go({ v: "mod", id: mod.id, tab: k });
  const chipsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [mod.id, tab]);
  /* keep the active chip visible in the scrollable tab strip */
  useEffect(() => {
    const el = chipsRef.current?.querySelector<HTMLElement>(".chip.on");
    if (!el || !chipsRef.current) return;
    const c = chipsRef.current;
    const target = el.offsetLeft - c.clientWidth / 2 + el.offsetWidth / 2;
    c.scrollTo({ left: target, behavior: "smooth" });
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
  const drillMiss: MissFn = (key, q, src) =>
    update((p) => {
      recordMissCard(p.rev, key, q, src);
    });
  const markToggle = (lid: string) =>
    update((p) => {
      if (p.marks[lid]) delete p.marks[lid];
      else p.marks[lid] = true;
    });
  const saveNote = (lid: string, v: string) =>
    update((p) => {
      if (v.trim()) p.notes[lid] = { v, t: Date.now() };
      else delete p.notes[lid];
    });

  /* remember the exact spot for lesson-precise resume */
  useEffect(() => {
    update((p) => {
      p.meta.last = mod.id + ":" + tab;
    });
  }, [mod.id, tab]);

  return (
    <div className="wrap wrap-lesson">
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

      <div className="chips" role="tablist" ref={chipsRef}>
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
            <span>
              {curLesson.est} · lesson {tIdx + 1} of {mod.lessons.length}
            </span>
            <span className="lesson-tools">
              <button
                className={"lessontool" + (prog.marks[curLesson.id] ? " markon" : "")}
                onClick={() => markToggle(curLesson.id)}
                aria-pressed={!!prog.marks[curLesson.id]}
                title={prog.marks[curLesson.id] ? "Remove bookmark" : "Bookmark this lesson"}
              >
                {prog.marks[curLesson.id] ? "★ BOOKMARKED" : "☆ BOOKMARK"}
              </button>
              <button
                className="lessontool"
                onClick={() => window.print()}
                title="Print or save this lesson as PDF"
              >
                ⎙ PRINT
              </button>
            </span>
          </div>
          <h3 className="lesson-ttl">{curLesson.title}</h3>
          <Blocks blocks={curLesson.blocks} />
          <LessonNotes
            lessonId={curLesson.id}
            note={prog.notes[curLesson.id]?.v ?? ""}
            save={(v) => saveNote(curLesson.id, v)}
          />
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
          <ExerciseView
            key={ex.id}
            ex={ex}
            prog={prog}
            exDone={exDone}
            capToggle={capToggle}
            miss={drillMiss}
          />
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

export function ModulePage() {
  const { go } = useApp();
  const params = useParams({ strict: false }) as { modId?: string; tab?: string };
  const mod = params.modId ? byId[params.modId] : undefined;
  useEffect(() => {
    if (!mod) go({ v: "home" });
  }, [mod]);
  if (!mod) return null;
  const mIdx = ALL_MODULES.indexOf(mod);
  return <ModuleView mod={mod} mIdx={mIdx} initialTab={params.tab} />;
}
