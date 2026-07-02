/* Shared shapes for the entire curriculum. Every module data file declares
   `satisfies readonly Module[]`, so a typo in a lesson block or a quiz answer
   index is a compile error, not a runtime surprise. */

/** OSI layer tags plus the two non-layer tracks (Rust, cross-platform). */
export type LayerTag = "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7" | "RS" | "XP";

export type CodeLang = "rust" | "sh" | "text" | "javascript" | "swift";

export interface CodeSpec {
  lang: CodeLang;
  title?: string;
  body: string;
  /** Self-contained runnable snippet — renders a "run on play.rust-lang.org" link (rust only). */
  run?: boolean;
}

/** One renderable unit of lesson prose — a discriminated-by-key union. */
export type Block =
  | { p: string }
  | { h: string }
  | { ul: string[] }
  | { code: CodeSpec }
  | { note: string; label?: string }
  | { tbl: { head: string[]; rows: string[][] } };

export interface Lesson {
  id: string;
  title: string;
  est: string;
  blocks: Block[];
}

interface ExerciseBase {
  id: string;
  title: string;
  kind: string;
  prompt: string;
  why?: string;
}

/** Tap the items into the correct sequence. */
export interface OrderExercise extends ExerciseBase {
  type: "order";
  items: string[];
}

/** Match each term (t) to its description (d). */
export interface MatchExercise extends ExerciseBase {
  type: "match";
  pairs: { t: string; d: string }[];
}

/** Fill each §n§ hole in the code with one of the offered options. */
export interface BlankExercise extends ExerciseBase {
  type: "blank";
  code: string;
  blanks: { opts: string[]; a: number }[];
}

/** Self-tracked checklist (capstone ladder). */
export interface CheckExercise extends ExerciseBase {
  type: "check";
  items: string[];
}

/** Infinite generated CIDR drill. */
export interface CidrExercise extends ExerciseBase {
  type: "cidr";
}

/** Infinite well-known-port drill. */
export interface PortsExercise extends ExerciseBase {
  type: "ports";
}

/** One question over a hex dump; span highlights bytes [start, end) while active. */
export interface HexQuestion {
  q: string;
  opts: string[];
  a: number;
  span?: [number, number];
  why: string;
}

/** Decode an authored packet hex dump byte by byte. */
export interface HexExercise extends ExerciseBase {
  type: "hex";
  /** Hex byte pairs separated by whitespace; offsets start at 0. */
  bytes: string;
  questions: HexQuestion[];
}

export interface PcapPacket {
  no: number;
  time: string;
  src: string;
  dst: string;
  proto: string;
  info: string;
}

/** Wireshark-style packet list plus analysis questions. */
export interface PcapExercise extends ExerciseBase {
  type: "pcap";
  packets: PcapPacket[];
  questions: Question[];
}

/** Infinite generated VLSM subnet-design drill. */
export interface VlsmExercise extends ExerciseBase {
  type: "vlsm";
}

export type Exercise =
  | OrderExercise
  | MatchExercise
  | BlankExercise
  | CheckExercise
  | CidrExercise
  | PortsExercise
  | HexExercise
  | PcapExercise
  | VlsmExercise;

export interface Question {
  q: string;
  opts: string[];
  /** Index into opts of the correct answer. */
  a: number;
  why: string;
}

export interface Quiz {
  id: string;
  questions: Question[];
}

export interface Module {
  id: string;
  code: string;
  title: string;
  layers: LayerTag[];
  est: string;
  tag: string;
  lessons: Lesson[];
  exercises?: Exercise[];
  quiz?: Quiz;
}

export interface Track {
  id: string;
  code: string;
  title: string;
  blurb: string;
  modules: string[];
}
