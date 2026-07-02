/* Social login via Arctic (Google + GitHub).
   Flow: GET /api/auth/:provider → redirect to provider with state (+PKCE for Google)
         GET /api/auth/:provider/callback → validate, fetch identity,
         link-or-create user by verified email, mint the same JWT as password login,
         then hand the token to the SPA via a tiny bridge page. */
import { Google, GitHub, generateState, generateCodeVerifier } from "arctic";
import type { OAuth2Tokens } from "arctic";
import type { Request, Response } from "express";
import { q, tx } from "./db";
import type { PublicUserRow } from "./db";

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";

function providers(): Record<string, Google | GitHub> {
  const p: Record<string, Google | GitHub> = {};
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    p.google = new Google(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      BASE_URL + "/api/auth/google/callback"
    );
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    p.github = new GitHub(
      process.env.GITHUB_CLIENT_ID,
      process.env.GITHUB_CLIENT_SECRET,
      BASE_URL + "/api/auth/github/callback"
    );
  }
  return p;
}
export const oauthProviders: Record<string, Google | GitHub> = providers();

/** What we need from a provider to link or create a local account. */
interface Identity {
  id: string;
  email: string;
  name: string | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/* Short-lived state store (state → {verifier, exp}); one server process, so in-memory is fine.
   Swap for a signed cookie or Redis if you ever run multiple instances. */
const pending = new Map<string, { verifier: string | null; exp: number }>();
const STATE_TTL = 10 * 60 * 1000;
function remember(state: string, verifier: string | null): void {
  pending.set(state, { verifier, exp: Date.now() + STATE_TTL });
  for (const [k, v] of pending) if (v.exp < Date.now()) pending.delete(k);
}
function recall(state: string): { verifier: string | null; exp: number } | null {
  const v = pending.get(state);
  pending.delete(state);
  return v && v.exp >= Date.now() ? v : null;
}

export function beginOAuth(provider: string, res: Response): void {
  const client = oauthProviders[provider];
  if (!client) {
    res.status(404).json({ error: "This sign-in method isn't configured on the server" });
    return;
  }
  const state = generateState();
  let url: URL;
  if (client instanceof Google) {
    const verifier = generateCodeVerifier();
    remember(state, verifier);
    url = client.createAuthorizationURL(state, verifier, ["openid", "email", "profile"]);
  } else {
    remember(state, null);
    url = client.createAuthorizationURL(state, ["user:email"]);
  }
  res.redirect(url.toString());
}

async function fetchIdentity(provider: string, tokens: OAuth2Tokens): Promise<Identity> {
  const access = tokens.accessToken();
  if (provider === "google") {
    const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: "Bearer " + access },
    });
    if (!r.ok) throw new Error("userinfo failed");
    const u: unknown = await r.json();
    if (!isRecord(u) || !u.email_verified) throw new Error("email not verified with Google");
    if (typeof u.email !== "string") throw new Error("userinfo failed");
    return {
      id: String(u.sub),
      email: u.email.toLowerCase(),
      name: typeof u.name === "string" && u.name ? u.name : null,
    };
  }
  // github: profile + the verified primary email (may be private, so ask the emails API)
  const hdrs = { Authorization: "Bearer " + access, "User-Agent": "tunnelcraft" };
  const [pr, er] = await Promise.all([
    fetch("https://api.github.com/user", { headers: hdrs }),
    fetch("https://api.github.com/user/emails", { headers: hdrs }),
  ]);
  if (!pr.ok || !er.ok) throw new Error("github profile fetch failed");
  const profile: unknown = await pr.json();
  const emailsJson: unknown = await er.json();
  if (!isRecord(profile) || !Array.isArray(emailsJson))
    throw new Error("github profile fetch failed");
  const emails = (emailsJson as unknown[]).filter(isRecord);
  const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
  if (!primary || typeof primary.email !== "string")
    throw new Error("no verified email on the GitHub account");
  const name =
    typeof profile.name === "string" && profile.name
      ? profile.name
      : typeof profile.login === "string" && profile.login
        ? profile.login
        : null;
  return { id: String(profile.id), email: primary.email.toLowerCase(), name };
}

/* Returns the local user row for this identity: existing link → that user;
   else auto-link by verified email; else create a fresh passwordless user. */
function upsertUser(provider: string, identity: Identity): PublicUserRow {
  return tx(() => {
    const linked = q.oauthAccount.get(provider, identity.id);
    if (linked) {
      q.setVerified.run(linked.user_id); // provider re-attested the mailbox
      const user = q.userById.get(linked.user_id);
      if (!user) throw new Error("linked user row missing");
      return user;
    }
    const existing = q.userByEmail.get(identity.email);
    const userId = existing
      ? existing.id
      : q.insertOauthUser.run(identity.email, identity.name).lastInsertRowid;
    q.linkOauth.run(provider, identity.id, userId);
    q.setVerified.run(userId); // Google/GitHub verified this email — auto-link is safe *because* of this
    const user = q.userById.get(userId);
    if (!user) throw new Error("oauth user row missing");
    return user;
  }); // atomic: no crash window between user creation and its oauth link
}

export async function finishOAuth(
  provider: string,
  reqQuery: Request["query"],
  signToken: (user: PublicUserRow) => string,
  res: Response
): Promise<void> {
  const client = oauthProviders[provider];
  const fail = (msg: string): void => res.redirect("/#oauth_error=" + encodeURIComponent(msg));
  if (!client) return fail("provider not configured");
  const code = typeof reqQuery.code === "string" ? reqQuery.code : "";
  const state = typeof reqQuery.state === "string" ? reqQuery.state : "";
  if (!code || !state) return fail("missing code or state");
  const kept = recall(state);
  if (!kept) return fail("state expired or invalid — try again");
  try {
    const tokens =
      client instanceof Google
        ? await client.validateAuthorizationCode(code, kept.verifier ?? "")
        : await client.validateAuthorizationCode(code);
    const identity = await fetchIdentity(provider, tokens);
    const user = upsertUser(provider, identity);
    const token = signToken(user);
    // Bridge page: store the token where the SPA's api client looks, then load the app.
    res
      .type("html")
      .send(
        "<!doctype html><meta charset='utf-8'><script>" +
          "localStorage.setItem('tunnelcraft:token'," +
          JSON.stringify(token) +
          ");" +
          "location.replace('/');" +
          "</script>Signing you in…"
      );
  } catch (e) {
    fail(e instanceof Error && e.message ? e.message : "sign-in failed");
  }
}
