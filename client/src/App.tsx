/* App shell: header, footer, search overlay, auth/sync state.
   Views render into the router outlet; app-wide state travels via AppContext. */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { Header } from "./components/header";
import { SearchOverlay } from "./components/search";
import { VerifyBanner } from "./components/verify";
import { Donate } from "./components/donate";
import { deckStats, recordReview } from "./lib/review";
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
import { emptyProgress, touchActivity } from "./lib/progress";
import type { Progress } from "./lib/progress";
import { useTheme } from "./lib/theme";
import { routeToPath } from "./lib/nav";
import type { Route } from "./lib/nav";
import { grandTotals } from "./lib/stats";
import type { SearchResult } from "./lib/search";

export type { Route } from "./lib/nav";

type SyncState = "local" | "saving" | "synced" | "offline";

/* ---------- app-wide context ---------- */
export interface AppState {
  prog: Progress;
  update: (fn: (p: Progress) => void) => void;
  user: PublicUser | null;
  sync: SyncState;
  go: (r: Route) => void;
  onAuthed: (u: PublicUser) => Promise<void>;
  signOut: () => void;
  onDeleted: () => void;
  reviewAnswer: (key: string, correct: boolean) => void;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside AppContext");
  return ctx;
}

/* ---------- shell ---------- */
export default function App() {
  const navigate = useNavigate();
  const [prog, setProg] = useState<Progress>(EMPTY_PROGRESS);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [sync, setSync] = useState<SyncState>("local");
  const [resetArm, setResetArm] = useState(false);
  const [theme, cycleTheme] = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const progRef = useRef<Progress>(prog);
  progRef.current = prog;

  const go = (r: Route) => {
    navigate({ to: routeToPath(r) });
    window.scrollTo(0, 0);
  };

  /* boot: local first, then session restore + server merge */
  useEffect(() => {
    if (
      window.location.hash.startsWith("#reset=") ||
      window.location.hash.startsWith("#oauth_error=")
    ) {
      navigate({ to: "/auth" });
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
      touchActivity(next.meta); // any progress write counts toward the daily streak
      saveLocal(next);
      return next;
    });
    pushSoon();
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
    go({ v: "dashboard" });
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
    go({ v: "landing" });
  };
  const onDeleted = () => {
    setToken(null);
    setUser(null);
    setSync("local");
    const empty = emptyProgress();
    setProg(empty);
    saveLocal(empty);
    go({ v: "landing" });
  };

  const totals = grandTotals(prog);
  const pct = totals.pct;
  const started = totals.done > 0;

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

  const syncLabel = user
    ? sync === "saving"
      ? "SAVING…"
      : sync === "offline"
        ? "OFFLINE · COPY SAFE"
        : "SYNCED " + pct + "%"
    : "LOCAL · " + pct + "%";

  const state: AppState = {
    prog,
    update,
    user,
    sync,
    go,
    onAuthed,
    signOut,
    onDeleted,
    reviewAnswer,
  };

  return (
    <AppContext.Provider value={state}>
      <div className="tc">
        <a className="skiplink" href="#main">
          Skip to content
        </a>
        <Header
          user={user}
          pct={pct}
          syncLabel={syncLabel}
          saving={sync === "saving"}
          due={due}
          streak={prog.meta.streak ?? 0}
          bestStreak={prog.meta.bestStreak ?? prog.meta.streak ?? 0}
          theme={theme}
          cycleTheme={cycleTheme}
          onBrand={() => go(user ? { v: "dashboard" } : started ? { v: "home" } : { v: "landing" })}
          onSearch={() => setSearchOpen(true)}
          go={go}
        />

        <VerifyBanner
          user={user}
          onVerified={() => setUser((u) => (u ? { ...u, emailVerified: true } : u))}
        />

        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onJump={jumpTo} />

        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>

        <div className="wrap">
          <footer className="footer">
            <span>
              TUNNELCRAFT ·{" "}
              {user
                ? "progress synced to your account"
                : "guest progress on this device — sign in to sync"}{" "}
              · {totals.done}/{totals.total} units complete
            </span>
            <Donate variant="links" />
            <button className="reset" onClick={doReset}>
              {resetArm ? "TAP AGAIN TO WIPE PROGRESS" : "RESET PROGRESS"}
            </button>
          </footer>
        </div>
      </div>
    </AppContext.Provider>
  );
}
