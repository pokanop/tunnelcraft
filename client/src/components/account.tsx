import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { PublicUser, SessionInfo } from "../lib/api";

/* Account panel: active sessions, password management, danger zone.
   Rendered when the user taps their name in the header. */
interface AccountViewProps {
  user: PublicUser;
  onSignOut: () => void;
  onDeleted: () => void;
  onBack: () => void;
}

export function AccountView({ user, onSignOut, onDeleted, onBack }: AccountViewProps) {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [delPw, setDelPw] = useState("");
  const [delArm, setDelArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [remind, setRemind] = useState(!!user.remind);

  const refresh = () =>
    api
      .sessions()
      .then((r) => setSessions(r.sessions))
      .catch(() => setSessions([]));
  useEffect(() => {
    refresh();
  }, []);

  const run = async (fn: () => Promise<void>, okMsg?: string) => {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      await fn();
      if (okMsg) setMsg(okMsg);
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const changePw = () =>
    run(async () => {
      await api.changePassword(curPw, newPw);
      setCurPw("");
      setNewPw("");
      refresh();
    }, "Password updated — every other device was signed out");

  const logoutAll = () =>
    run(async () => {
      await api.logoutAll();
      onSignOut();
    });

  const deleteAcct = () => {
    if (!delArm) {
      setDelArm(true);
      setTimeout(() => setDelArm(false), 5000);
      return;
    }
    run(async () => {
      await api.deleteAccount(delPw);
      onDeleted();
    });
  };

  return (
    <div className="wrap">
      <button className="back" onClick={onBack}>
        ← BACK TO COURSE
      </button>
      <div className="authcard acctcard">
        <div className="eyebrow">ACCOUNT</div>
        <h2 className="authttl">{user.displayName || user.email}</h2>
        <p className="authsub">
          {user.email}{" "}
          {user.emailVerified ? (
            <span className="vbadge ok">✓ VERIFIED</span>
          ) : (
            <span className="vbadge">UNVERIFIED</span>
          )}
        </p>

        <div className="acctsec">
          <div className="acctsec-t">ACTIVE SESSIONS</div>
          {sessions === null ? (
            <p className="authsub">Loading…</p>
          ) : (
            <ul className="sesslist">
              {sessions.map((s) => (
                <li className="sessrow" key={s.handle}>
                  <div className="sess-info">
                    <div className="sess-ua" title={s.userAgent}>
                      {s.current ? "● THIS DEVICE — " : ""}
                      {s.device}
                    </div>
                    <div className="sess-meta">
                      last seen {s.lastSeen} · signed in {s.createdAt}
                    </div>
                  </div>
                  {!s.current && (
                    <button
                      className="sess-revoke"
                      disabled={busy}
                      aria-label={"Sign out " + s.device + ", last seen " + s.lastSeen}
                      onClick={() =>
                        run(async () => {
                          await api.revokeSession(s.handle);
                          refresh();
                        }, "Signed out " + s.device)
                      }
                    >
                      SIGN OUT
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="authactions">
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api.logout();
                  onSignOut();
                })
              }
            >
              SIGN OUT
            </button>
            <button className="btn ghost" disabled={busy} onClick={logoutAll}>
              SIGN OUT EVERYWHERE
            </button>
          </div>
        </div>

        <div className="acctsec">
          <div className="acctsec-t">PASSWORD</div>
          <div className="authfields">
            <div className="fld">
              <label>current password (leave blank if you only use social login)</label>
              <input
                type="password"
                value={curPw}
                autoComplete="current-password"
                onChange={(e) => setCurPw(e.target.value)}
              />
            </div>
            <div className="fld">
              <label>new password — 8+ characters</label>
              <input
                type="password"
                value={newPw}
                autoComplete="new-password"
                onChange={(e) => setNewPw(e.target.value)}
              />
            </div>
          </div>
          <button className="btn" disabled={busy || newPw.length < 8} onClick={changePw}>
            UPDATE PASSWORD
          </button>
        </div>

        <div className="acctsec">
          <div className="acctsec-t">STUDY REMINDERS</div>
          <p className="authsub">
            Get one email on any day you haven't trained — streaks live and die by showing up.
            {!user.emailVerified && " Verify your email above to enable."}
          </p>
          <button
            className="btn ghost"
            disabled={busy || !user.emailVerified}
            aria-pressed={remind}
            onClick={() =>
              run(
                async () => {
                  const r = await api.setReminders(!remind);
                  setRemind(r.remind);
                },
                remind ? "Reminders off" : "Reminders on — we'll nudge you on days with no activity"
              )
            }
          >
            {remind ? "● REMINDERS ON — TURN OFF" : "○ REMINDERS OFF — TURN ON"}
          </button>
        </div>

        <div className="acctsec danger">
          <div className="acctsec-t">DANGER ZONE</div>
          <p className="authsub">
            Deleting your account permanently removes your progress and sign-ins. This cannot be
            undone.
          </p>
          <div className="authfields">
            <div className="fld">
              <label>password (blank for social-only accounts)</label>
              <input type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} />
            </div>
          </div>
          <button className="btn ghost dangerbtn" disabled={busy} onClick={deleteAcct}>
            {delArm ? "TAP AGAIN TO PERMANENTLY DELETE" : "DELETE ACCOUNT"}
          </button>
        </div>

        {msg && (
          <div className="verdict good" role="status">
            ✓ {msg}
          </div>
        )}
        {err && (
          <div className="verdict badv" role="alert">
            ✗ {err}
          </div>
        )}
      </div>
    </div>
  );
}

/* Forgot/reset flows shared with the auth screen */
export function ForgotForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch {
      setSent(true); /* identical UX either way */
    } finally {
      setBusy(false);
    }
  };
  return sent ? (
    <p className="authsub" role="status">
      If that email has an account, a reset link is on its way. Open it on this device to set a new
      password.
    </p>
  ) : (
    <>
      <div className="authfields">
        <div className="fld">
          <label>email</label>
          <input
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <div className="authactions">
        <button className="btn" disabled={busy || !email.includes("@")} onClick={submit}>
          SEND RESET LINK
        </button>
        <button className="btn ghost" onClick={onDone}>
          BACK
        </button>
      </div>
    </>
  );
}

export function ResetForm({ token, onDone }: { token: string | null; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr("");
    setBusy(true);
    try {
      await api.resetPassword(token, pw);
      setOk(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  return ok ? (
    <>
      <p className="authsub" role="status">
        Password updated — every existing session was signed out for safety. Sign in with your new
        password.
      </p>
      <button className="btn" onClick={onDone}>
        GO TO SIGN IN
      </button>
    </>
  ) : (
    <>
      <p className="authsub">Choose a new password. All existing sessions will be signed out.</p>
      <div className="authfields">
        <div className="fld">
          <label>new password — 8+ characters</label>
          <input
            type="password"
            value={pw}
            autoComplete="new-password"
            onChange={(e) => setPw(e.target.value)}
          />
        </div>
      </div>
      {err && (
        <div className="verdict badv" role="alert">
          ✗ {err}
        </div>
      )}
      <div className="authactions">
        <button className="btn" disabled={busy || pw.length < 8} onClick={submit}>
          SET NEW PASSWORD
        </button>
      </div>
    </>
  );
}
