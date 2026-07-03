/* App header: brand, primary nav, sync state, and a mobile menu
   that absorbs the nav + settings below 920px. */
import { useEffect, useState } from "react";
import { Logo, Wordmark } from "./brand";
import type { PublicUser } from "../lib/api";
import type { Route } from "../lib/nav";
import type { ThemeMode } from "../lib/theme";

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" />
    <path d="M10.6 10.6 L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const MenuIcon = ({ open }: { open: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    {open ? (
      <path
        d="M4 4 L14 14 M14 4 L4 14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    ) : (
      <path
        d="M2.5 5 H15.5 M2.5 9 H15.5 M2.5 13 H15.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    )}
  </svg>
);

export interface HeaderProps {
  user: PublicUser | null;
  pct: number;
  syncLabel: string;
  saving: boolean;
  due: number;
  streak: number;
  bestStreak: number;
  theme: ThemeMode;
  cycleTheme: () => void;
  onBrand: () => void;
  onSearch: () => void;
  go: (r: Route) => void;
}

export function Header(props: HeaderProps) {
  const { user, pct, syncLabel, saving, due, streak, bestStreak, theme, cycleTheme } = props;
  const [menu, setMenu] = useState(false);

  /* close the menu on Escape and whenever we navigate */
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const nav = (r: Route) => {
    setMenu(false);
    props.go(r);
  };

  const themeLabel = theme === "system" ? "◐ SYSTEM" : theme === "light" ? "○ LIGHT" : "● DARK";
  const acctLabel = user ? (user.displayName || user.email).toUpperCase() : "SIGN IN";
  const acctRoute: Route = user ? { v: "account" } : { v: "auth" };

  return (
    <header className="hdr">
      <div className="hdr-in">
        <button
          className="brand"
          onClick={() => {
            setMenu(false);
            props.onBrand();
          }}
          aria-label="TUNNELCRAFT home"
        >
          <Logo />
          <Wordmark tagline={false} />
        </button>

        <nav className="nav" aria-label="Primary">
          <button className="navlink" onClick={() => nav({ v: "home" })}>
            CURRICULUM
          </button>
          <button
            className="navlink reviewbtn"
            onClick={() => nav({ v: "review" })}
            aria-label={due > 0 ? "Review mode — " + due + " cards due" : "Review mode"}
          >
            REVIEW
            {due > 0 && (
              <span className="duebadge" aria-hidden="true">
                {due}
              </span>
            )}
          </button>
          <button className="navlink" onClick={() => nav({ v: "glossary" })}>
            GLOSSARY
          </button>
        </nav>

        <div className="hdr-right">
          <div className="sync" title={syncLabel}>
            <span className="sync-t">{syncLabel}</span>
            <div className={"syncbar" + (saving ? " saving" : "")}>
              <i style={{ width: pct + "%" }} />
            </div>
          </div>
          {streak > 0 && (
            <span
              className="streakchip"
              title={"Daily streak: " + streak + " (best " + bestStreak + ")"}
            >
              <span className="zap">⚡</span>
              {streak}
            </span>
          )}
          <button
            className="acct searchbtn"
            onClick={() => {
              setMenu(false);
              props.onSearch();
            }}
            aria-label="Search the curriculum (slash or Ctrl+K)"
            title="Search — press / or Ctrl+K"
          >
            <SearchIcon />
            <span className="lbl">SEARCH</span>
          </button>
          <button
            className="acct themebtn-ico"
            onClick={cycleTheme}
            title={"Theme: " + theme + " — click to cycle system → light → dark"}
            aria-label={"Theme: " + theme + ", click to cycle"}
          >
            {theme === "system" ? "◐" : theme === "light" ? "○" : "●"}
          </button>
          <button
            className="acct acct-user"
            onClick={() => nav(acctRoute)}
            title={user ? "Account & sessions" : "Sign in"}
          >
            <span className="trunc">{acctLabel}</span>
          </button>
          <button
            className="menubtn"
            onClick={() => setMenu(!menu)}
            aria-expanded={menu}
            aria-controls="mnav"
            aria-label={menu ? "Close menu" : "Open menu"}
          >
            <MenuIcon open={menu} />
          </button>
        </div>

        <div id="mnav" className={"mnav" + (menu ? " open" : "")}>
          <button className="mnav-link" onClick={() => nav({ v: "home" })}>
            CURRICULUM <span aria-hidden="true">→</span>
          </button>
          <button className="mnav-link" onClick={() => nav({ v: "review" })}>
            <span>
              REVIEW
              {due > 0 && (
                <span className="duebadge" aria-hidden="true">
                  {due}
                </span>
              )}
            </span>
            <span aria-hidden="true">→</span>
          </button>
          <button className="mnav-link" onClick={() => nav({ v: "glossary" })}>
            GLOSSARY <span aria-hidden="true">→</span>
          </button>
          <button className="mnav-link" onClick={() => nav(acctRoute)}>
            {user ? "ACCOUNT — " + acctLabel : "SIGN IN"} <span aria-hidden="true">→</span>
          </button>
          <div className="mnav-foot">
            <div className="mnav-sync">
              <span className="sync-t">{syncLabel}</span>
              <div className={"syncbar" + (saving ? " saving" : "")}>
                <i style={{ width: pct + "%" }} />
              </div>
            </div>
            <button className="acct themebtn" onClick={cycleTheme}>
              {themeLabel}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
