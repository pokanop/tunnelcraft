import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { PublicUser } from "../lib/api";

/* Banner shown under the header while the signed-in user's email is unverified.
   Soft gate: the app stays fully usable; this just nags politely and offers resend. */
interface VerifyBannerProps {
  user: PublicUser | null;
  onVerified: () => void;
}

type VerifyState = "idle" | "sending" | "sent" | "verifying" | "done" | "error";

export function VerifyBanner({ user, onVerified }: VerifyBannerProps) {
  const [state, setState] = useState<VerifyState>("idle");
  const [note, setNote] = useState("");

  /* If the page loaded from a #verify=<token> link, consume it */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.location.hash.match(/^#verify=([A-Za-z0-9_-]+)/);
    const token = m?.[1];
    if (token === undefined) return;
    history.replaceState(null, "", window.location.pathname);
    setState("verifying");
    api
      .verifyEmail(token)
      .then(() => {
        setState("done");
        onVerified();
      })
      .catch((e: unknown) => {
        setState("error");
        setNote(e instanceof Error && e.message ? e.message : "Verification failed");
      });
  }, []);

  if (!user && state === "idle") return null;
  if (user && user.emailVerified && state !== "done" && state !== "verifying" && state !== "error")
    return null;

  const resend = () => {
    setState("sending");
    api
      .resendVerification()
      .then((r) => {
        setState("sent");
        setNote(r.message || "Sent");
      })
      .catch((e: unknown) => {
        setState("error");
        setNote(e instanceof Error && e.message ? e.message : "Could not send");
      });
  };

  return (
    <div className={"verifybar" + (state === "done" ? " ok" : "")} role="status">
      {state === "verifying" && <span>Verifying your email…</span>}
      {state === "done" && <span>✓ Email verified — you're all set.</span>}
      {state === "error" && <span>✗ {note} </span>}
      {(state === "idle" || state === "sending" || state === "sent" || state === "error") &&
        user &&
        !user.emailVerified && (
          <>
            <span>Verify {user.email} to secure your account.</span>
            {state === "sent" ? (
              <span className="verify-note">{note}</span>
            ) : (
              <button className="verify-resend" disabled={state === "sending"} onClick={resend}>
                {state === "sending" ? "SENDING…" : "RESEND EMAIL"}
              </button>
            )}
          </>
        )}
    </div>
  );
}
