import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";

/* Banner shown under the header while the signed-in user's email is unverified.
   Soft gate: the app stays fully usable; this just nags politely and offers resend. */
export function VerifyBanner({ user, onVerified }) {
  const [state, setState] = useState("idle"); // idle | sending | sent | verifying | done | error
  const [note, setNote] = useState("");

  /* If the page loaded from a #verify=<token> link, consume it */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.location.hash.match(/^#verify=([A-Za-z0-9_-]+)/);
    if (!m) return;
    history.replaceState(null, "", window.location.pathname);
    setState("verifying");
    api.verifyEmail(m[1])
      .then(() => { setState("done"); onVerified(); })
      .catch((e) => { setState("error"); setNote(e.message || "Verification failed"); });
  }, []);

  if (!user && state === "idle") return null;
  if (user && user.emailVerified && state !== "done" && state !== "verifying" && state !== "error") return null;

  const resend = () => {
    setState("sending");
    api.resendVerification()
      .then((r) => { setState("sent"); setNote(r.message || "Sent"); })
      .catch((e) => { setState("error"); setNote(e.message || "Could not send"); });
  };

  return (
    <div className={"verifybar" + (state === "done" ? " ok" : "")} role="status">
      {state === "verifying" && <span>Verifying your email…</span>}
      {state === "done" && <span>✓ Email verified — you're all set.</span>}
      {state === "error" && <span>✗ {note} </span>}
      {(state === "idle" || state === "sending" || state === "sent" || state === "error") && user && !user.emailVerified && (
        <>
          <span>Verify {user.email} to secure your account.</span>
          {state === "sent"
            ? <span className="verify-note">{note}</span>
            : <button className="verify-resend" disabled={state === "sending"} onClick={resend}>
                {state === "sending" ? "SENDING…" : "RESEND EMAIL"}
              </button>}
        </>
      )}
    </div>
  );
}
