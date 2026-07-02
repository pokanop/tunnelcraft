/* Social login via Arctic (Google + GitHub).
   Flow: GET /api/auth/:provider → redirect to provider with state (+PKCE for Google)
         GET /api/auth/:provider/callback → validate, fetch identity,
         link-or-create user by verified email, mint the same JWT as password login,
         then hand the token to the SPA via a tiny bridge page. */
import { Google, GitHub, generateState, generateCodeVerifier } from "arctic";
import { q, tx } from "./db.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";

function providers() {
  const p = {};
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
export const oauthProviders = providers();

/* Short-lived state store (state → {verifier, exp}); one server process, so in-memory is fine.
   Swap for a signed cookie or Redis if you ever run multiple instances. */
const pending = new Map();
const STATE_TTL = 10 * 60 * 1000;
function remember(state, verifier) {
  pending.set(state, { verifier, exp: Date.now() + STATE_TTL });
  for (const [k, v] of pending) if (v.exp < Date.now()) pending.delete(k);
}
function recall(state) {
  const v = pending.get(state);
  pending.delete(state);
  return v && v.exp >= Date.now() ? v : null;
}

export function beginOAuth(provider, res) {
  const client = oauthProviders[provider];
  if (!client)
    return res.status(404).json({ error: "This sign-in method isn't configured on the server" });
  const state = generateState();
  let url;
  if (provider === "google") {
    const verifier = generateCodeVerifier();
    remember(state, verifier);
    url = client.createAuthorizationURL(state, verifier, ["openid", "email", "profile"]);
  } else {
    remember(state, null);
    url = client.createAuthorizationURL(state, ["user:email"]);
  }
  res.redirect(url.toString());
}

async function fetchIdentity(provider, tokens) {
  const access = tokens.accessToken();
  if (provider === "google") {
    const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: "Bearer " + access },
    });
    if (!r.ok) throw new Error("userinfo failed");
    const u = await r.json();
    if (!u.email_verified) throw new Error("email not verified with Google");
    return { id: String(u.sub), email: u.email.toLowerCase(), name: u.name || null };
  }
  // github: profile + the verified primary email (may be private, so ask the emails API)
  const hdrs = { Authorization: "Bearer " + access, "User-Agent": "tunnelcraft" };
  const [pr, er] = await Promise.all([
    fetch("https://api.github.com/user", { headers: hdrs }),
    fetch("https://api.github.com/user/emails", { headers: hdrs }),
  ]);
  if (!pr.ok || !er.ok) throw new Error("github profile fetch failed");
  const profile = await pr.json();
  const emails = await er.json();
  const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);
  if (!primary) throw new Error("no verified email on the GitHub account");
  return {
    id: String(profile.id),
    email: primary.email.toLowerCase(),
    name: profile.name || profile.login || null,
  };
}

/* Returns the local user row for this identity: existing link → that user;
   else auto-link by verified email; else create a fresh passwordless user. */
function upsertUser(provider, identity) {
  return tx(() => {
    const linked = q.oauthAccount.get(provider, identity.id);
    if (linked) {
      q.setVerified.run(linked.user_id); // provider re-attested the mailbox
      return q.userById.get(linked.user_id);
    }
    let user = q.userByEmail.get(identity.email);
    if (!user) {
      const info = q.insertOauthUser.run(identity.email, identity.name);
      user = q.userById.get(info.lastInsertRowid);
    }
    q.linkOauth.run(provider, identity.id, user.id);
    q.setVerified.run(user.id); // Google/GitHub verified this email — auto-link is safe *because* of this
    return q.userById.get(user.id);
  }); // atomic: no crash window between user creation and its oauth link
}

export async function finishOAuth(provider, reqQuery, signToken, res) {
  const client = oauthProviders[provider];
  const fail = (msg) => res.redirect("/#oauth_error=" + encodeURIComponent(msg));
  if (!client) return fail("provider not configured");
  const { code, state } = reqQuery;
  if (!code || !state) return fail("missing code or state");
  const kept = recall(state);
  if (!kept) return fail("state expired or invalid — try again");
  try {
    const tokens =
      provider === "google"
        ? await client.validateAuthorizationCode(code, kept.verifier)
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
    fail(e.message || "sign-in failed");
  }
}
