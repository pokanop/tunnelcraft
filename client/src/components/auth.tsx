import { useEffect, useState } from "react";
import { api, setToken } from "../lib/api";
import type { PublicUser } from "../lib/api";
import { ForgotForm, ResetForm } from "./account";

const PROVIDER_LABELS: Record<string, string> = {
  google: "CONTINUE WITH GOOGLE",
  github: "CONTINUE WITH GITHUB",
};

interface AuthViewProps {
  onAuthed: (user: PublicUser) => void;
  onBack: () => void;
}

type AuthMode = "login" | "register" | "forgot" | "reset";

export function AuthView({ onAuthed, onBack }: AuthViewProps) {
  const [mode, setMode] = useState<AuthMode>(() =>
    typeof window !== "undefined" && window.location.hash.startsWith("#reset=") ? "reset" : "login"
  );
  const [resetToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const m = window.location.hash.match(/^#reset=([A-Za-z0-9_-]+)/);
    if (m) history.replaceState(null, "", window.location.pathname);
    return m?.[1] ?? null;
  });
  const [providers, setProviders] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .providers()
      .then((r) => setProviders(r.providers ?? []))
      .catch(() => {});
    // finishOAuth redirects to /#oauth_error=... on failure — surface it here
    const m = window.location.hash.match(/oauth_error=([^&]+)/);
    const oauthErr = m?.[1];
    if (oauthErr !== undefined) {
      setErr(decodeURIComponent(oauthErr));
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const submit = async () => {
    setErr("");
    setBusy(true);
    try {
      const r =
        mode === "login"
          ? await api.login(email.trim(), pw)
          : await api.register(email.trim(), pw, name.trim());
      setToken(r.token);
      onAuthed(r.user);
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  const canGo = email.includes("@") && pw.length >= 8 && !busy;

  return (
    <div className="wrap">
      <button className="back" onClick={onBack}>
        ← BACK TO COURSE
      </button>
      <div className="authcard">
        <div className="eyebrow">
          {mode === "login"
            ? "WELCOME BACK"
            : mode === "register"
              ? "NEW OPERATOR"
              : "PASSWORD RESET"}
        </div>
        <h2 className="authttl">
          {mode === "login"
            ? "Sign in"
            : mode === "register"
              ? "Create your account"
              : mode === "forgot"
                ? "Reset your password"
                : "Set a new password"}
        </h2>
        <p className="authsub">
          Progress syncs to the server on every change and follows you across devices. Guest
          progress on this device is merged in when you sign in.
        </p>
        {mode === "forgot" && <ForgotForm onDone={() => setMode("login")} />}
        {mode === "reset" && <ResetForm token={resetToken} onDone={() => setMode("login")} />}
        {(mode === "login" || mode === "register") && providers.length > 0 && (
          <>
            <div className="socialrow">
              {providers.map((p) => (
                <a key={p} className="btn ghost socialbtn" href={"/api/auth/" + p}>
                  {PROVIDER_LABELS[p] || "CONTINUE WITH " + p.toUpperCase()}
                </a>
              ))}
            </div>
            <div className="authdivider">
              <span>OR USE EMAIL</span>
            </div>
          </>
        )}
        {(mode === "login" || mode === "register") && (
          <>
            <div className="authfields">
              {mode === "register" && (
                <div className="fld">
                  <label>display name (optional)</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="nickname"
                  />
                </div>
              )}
              <div className="fld">
                <label>email</label>
                <input
                  value={email}
                  type="email"
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="fld">
                <label>password — 8+ characters</label>
                <input
                  value={pw}
                  type="password"
                  onChange={(e) => setPw(e.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canGo) submit();
                  }}
                />
              </div>
            </div>
            {err && (
              <div className="verdict badv" role="alert">
                ✗ {err}
              </div>
            )}
            <div className="authactions">
              <button className="btn" disabled={!canGo} onClick={submit}>
                {busy ? "…" : mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  setErr("");
                  setMode(mode === "login" ? "register" : "login");
                }}
              >
                {mode === "login" ? "NEED AN ACCOUNT?" : "HAVE AN ACCOUNT?"}
              </button>
            </div>
            <button
              className="linkbtn"
              onClick={() => {
                setErr("");
                setMode("forgot");
              }}
            >
              FORGOT PASSWORD?
            </button>
          </>
        )}
      </div>
    </div>
  );
}
