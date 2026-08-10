/* Black-box API tests: spawn the real server against a temp SQLite DB,
   exercise auth, sessions, and progress-merge over HTTP, then tear down. */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Progress } from "../src/progress";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4100 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess | undefined;
let dataDir = "";
/* Captured server stdout so tests can recover one-time tokens from the dev
   mail transport (which logs reset/verify links at info level). Production
   redacts secrets, but the mail subsystem logs the full link by design — it's
   the only black-box way to observe a hash-at-rest token. */
let serverLog = "";

/* Response shapes the assertions below reach into. */
interface PublicUser {
  id: number;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
}
interface AuthResponse {
  token: string;
  user: PublicUser;
}
interface ProgressResponse {
  data: Progress;
  updatedAt: string | null;
}

interface ApiOptions {
  token?: string;
  body?: unknown;
}

async function api<T = unknown>(
  method: string,
  p: string,
  { token, body }: ApiOptions = {}
): Promise<{ status: number; json: T }> {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, json: json as T };
}

/* Recover the most recent one-time token of a given kind from the captured
   server log. The dev mail transport logs JSON lines like
   {"sub":"mail","kind":"reset","link":".../#reset=TOKEN",...}.
   `fromOffset` restricts the search to log appended after that character
   index, so callers that request a fresh token can't accidentally pick up a
   stale line left by an earlier test. */
function tokenFromLog(kind: "reset" | "verify", fromOffset = 0): string | null {
  const lines = serverLog.slice(fromOffset).split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || !line.includes(`"kind":"${kind}"`)) continue;
    try {
      const o = JSON.parse(line) as { link?: string };
      if (typeof o.link === "string") {
        const m = o.link.match(new RegExp(`#${kind}=([A-Za-z0-9_-]+)`));
        const tok = m?.[1];
        if (tok) return tok;
      }
    } catch {
      /* not a JSON log line */
    }
  }
  return null;
}

/* Register a fresh password account. Each reset-flow test uses its own account
   so token and password state never leaks between them — the suite is fully
   order-independent. */
async function registerAccount(email: string, password: string): Promise<void> {
  const { status } = await api("POST", "/api/auth/register", { body: { email, password } });
  assert.equal(status, 201);
}

/* Request a reset link for `email` and recover the one-time token the dev mail
   transport logs for it. Throws if the line never appears (the async transport
   is given a short polling window to flush). */
async function mintResetToken(email: string): Promise<string> {
  const logFrom = serverLog.length;
  await api("POST", "/api/auth/forgot-password", { body: { email } });
  for (let i = 0; i < 20; i++) {
    const tok = tokenFromLog("reset", logFrom);
    if (tok) return tok;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("reset token never appeared in server log");
}

before(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "tunnelcraft-test-"));
  proc = spawn(process.execPath, [path.join(moduleDir, "..", "src", "index.ts")], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, LOG_LEVEL: "info" },
    stdio: ["ignore", "pipe", "ignore"],
  });
  proc.stdout?.on("data", (chunk: Buffer) => {
    serverLog += chunk.toString();
  });
  // Wait for readiness
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/api/health/ready`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not become ready");
});

after(() => {
  proc?.kill("SIGTERM");
  rmSync(dataDir, { recursive: true, force: true });
});

describe("health", () => {
  test("liveness", async () => {
    const { status, json } = await api<{ status: string }>("GET", "/api/health/live");
    assert.equal(status, 200);
    assert.equal(json.status, "ok");
  });
  test("readiness probes the DB", async () => {
    const { status, json } = await api<{ db: string }>("GET", "/api/health/ready");
    assert.equal(status, 200);
    assert.equal(json.db, "ok");
  });
});

describe("auth", () => {
  const email = "alice@example.com";
  const password = "correct horse battery";
  let token = "";

  test("register returns a token and user", async () => {
    const { status, json } = await api<AuthResponse>("POST", "/api/auth/register", {
      body: { email, password, displayName: "Alice" },
    });
    assert.equal(status, 201);
    assert.ok(json.token);
    assert.equal(json.user.email, email);
    assert.equal(json.user.emailVerified, false);
    token = json.token;
  });

  test("duplicate email is rejected", async () => {
    const { status } = await api("POST", "/api/auth/register", { body: { email, password } });
    assert.ok(status >= 400);
  });

  test("short password is rejected", async () => {
    const { status } = await api("POST", "/api/auth/register", {
      body: { email: "bob@example.com", password: "short" },
    });
    assert.equal(status, 400);
  });

  test("login works with correct credentials", async () => {
    const { status, json } = await api<AuthResponse>("POST", "/api/auth/login", {
      body: { email, password },
    });
    assert.equal(status, 200);
    assert.ok(json.token);
  });

  test("login rejects a wrong password", async () => {
    const { status } = await api("POST", "/api/auth/login", {
      body: { email, password: "wrong password 123" },
    });
    assert.equal(status, 401);
  });

  test("/api/me requires a bearer token", async () => {
    const anon = await api("GET", "/api/me");
    assert.equal(anon.status, 401);
    const me = await api<{ user: PublicUser }>("GET", "/api/me", { token });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.email, email);
  });

  test("logout revokes the session", async () => {
    const { json } = await api<AuthResponse>("POST", "/api/auth/login", {
      body: { email, password },
    });
    const t = json.token;
    assert.equal((await api("GET", "/api/me", { token: t })).status, 200);
    assert.equal((await api("POST", "/api/auth/logout", { token: t })).status, 200);
    assert.equal((await api("GET", "/api/me", { token: t })).status, 401);
  });

  test("logout-all revokes every session but keeps none behind", async () => {
    const a = (await api<AuthResponse>("POST", "/api/auth/login", { body: { email, password } }))
      .json.token;
    const b = (await api<AuthResponse>("POST", "/api/auth/login", { body: { email, password } }))
      .json.token;
    assert.equal((await api("POST", "/api/auth/logout-all", { token: a })).status, 200);
    assert.equal((await api("GET", "/api/me", { token: a })).status, 401);
    assert.equal((await api("GET", "/api/me", { token: b })).status, 401);
  });

  test("unconfigured OAuth provider 404s; unknown provider 404s", async () => {
    assert.equal((await api("GET", "/api/auth/google")).status, 404);
    assert.equal((await api("GET", "/api/auth/notaprovider")).status, 404);
  });

  test("providers list is empty when no OAuth is configured", async () => {
    const { json } = await api<{ providers: string[] }>("GET", "/api/auth/providers");
    assert.deepEqual(json.providers, []);
  });
});

describe("progress sync + merge", () => {
  let token = "";

  before(async () => {
    const { json } = await api<AuthResponse>("POST", "/api/auth/register", {
      body: { email: "sync@example.com", password: "another good pass" },
    });
    token = json.token;
  });

  test("fresh account has empty progress", async () => {
    const { status, json } = await api<ProgressResponse>("GET", "/api/progress", { token });
    assert.equal(status, 200);
    assert.deepEqual(json.data.les, {});
    assert.equal(json.updatedAt, null);
  });

  test("lessons union across devices", async () => {
    await api("PUT", "/api/progress", { token, body: { data: { les: { "n01-1": true } } } });
    const { json } = await api<ProgressResponse>("PUT", "/api/progress", {
      token,
      body: { data: { les: { "n01-2": true } } },
    });
    assert.deepEqual(json.data.les, { "n01-1": true, "n01-2": true });
  });

  test("best quiz score wins on merge", async () => {
    await api("PUT", "/api/progress", { token, body: { data: { quiz: { q1: 90 } } } });
    const { json } = await api<ProgressResponse>("PUT", "/api/progress", {
      token,
      body: { data: { quiz: { q1: 60 } } },
    });
    assert.equal(json.data.quiz.q1, 90);
  });

  test("review cards keep the more demanding (lower box) version", async () => {
    await api("PUT", "/api/progress", {
      token,
      body: { data: { rev: { c1: { box: 3, due: 1000, misses: 1 } } } },
    });
    const { json } = await api<ProgressResponse>("PUT", "/api/progress", {
      token,
      body: { data: { rev: { c1: { box: 1, due: 2000, misses: 2 } } } },
    });
    assert.equal(json.data.rev.c1?.box, 1);
  });

  test("progress requires auth", async () => {
    assert.equal((await api("GET", "/api/progress")).status, 401);
  });

  test("malformed progress body is sanitized, not fatal", async () => {
    const { status, json } = await api<ProgressResponse>("PUT", "/api/progress", {
      token,
      body: { data: "not an object" },
    });
    assert.equal(status, 200);
    assert.ok(json.data.les); // still a valid shape, prior data intact
    assert.deepEqual(json.data.les, { "n01-1": true, "n01-2": true });
  });
});

describe("account deletion", () => {
  test("cascades sessions and progress", async () => {
    const reg = await api<AuthResponse>("POST", "/api/auth/register", {
      body: { email: "gone@example.com", password: "delete me please" },
    });
    const token = reg.json.token;
    await api("PUT", "/api/progress", { token, body: { data: { les: { x: true } } } });
    const del = await api("DELETE", "/api/account", {
      token,
      body: { password: "delete me please", confirm: "DELETE" },
    });
    assert.equal(del.status, 200);
    assert.equal((await api("GET", "/api/me", { token })).status, 401);
  });
});

describe("password reset flow", () => {
  // NOTE: forgot-password is rate-limited to 5 requests/min/IP. The tests below
  // stay within that budget (2 + 1 + 1 + 1 = 5 across the suite). Each test
  // owns its own account so token/password state can't leak between them.

  test("forgot-password is enumeration-safe (identical response for known vs unknown email)", async () => {
    const email = "enum@example.com";
    await registerAccount(email, "a strong password");
    const known = await api<{ message: string }>("POST", "/api/auth/forgot-password", {
      body: { email },
    });
    const unknown = await api<{ message: string }>("POST", "/api/auth/forgot-password", {
      body: { email: "nobody@example.com" },
    });
    assert.equal(known.status, 200);
    assert.equal(known.json.message, unknown.json.message);
  });

  test("reset-password rejects an unknown or expired token", async () => {
    const { status, json } = await api<{ error?: string }>("POST", "/api/auth/reset-password", {
      body: { token: "not-a-real-token", newPassword: "a valid new password" },
    });
    assert.equal(status, 400);
    assert.match(json.error ?? "", /invalid or expired/i);
  });

  test("reset-password rejects a too-short password without burning the token", async () => {
    const email = "shortpw@example.com";
    await registerAccount(email, "a strong password");
    const token = await mintResetToken(email);

    const bad = await api("POST", "/api/auth/reset-password", {
      body: { token, newPassword: "short" },
    });
    assert.equal(bad.status, 400);

    // length validation runs before consumeResetToken, so the token must still
    // be usable — asserted directly here, not via a later test.
    const ok = await api("POST", "/api/auth/reset-password", {
      body: { token, newPassword: "a valid new password" },
    });
    assert.equal(ok.status, 200);
  });

  test("reset-password sets a new password, revokes prior sessions, marks email verified", async () => {
    const email = "revoke@example.com";
    const oldPassword = "the original password";
    const newPassword = "a brand new password";
    await registerAccount(email, oldPassword);

    // establish a session the reset should destroy
    const sess = await api<AuthResponse>("POST", "/api/auth/login", {
      body: { email, password: oldPassword },
    });
    assert.equal(sess.status, 200);

    const token = await mintResetToken(email);
    const reset = await api("POST", "/api/auth/reset-password", {
      body: { token, newPassword },
    });
    assert.equal(reset.status, 200);

    // pre-reset session is dead
    assert.equal((await api("GET", "/api/me", { token: sess.json.token })).status, 401);
    // old password no longer works
    assert.equal(
      (await api("POST", "/api/auth/login", { body: { email, password: oldPassword } })).status,
      401
    );
    // new password works, and completing a reset proves mailbox control → verified
    const fresh = await api<AuthResponse>("POST", "/api/auth/login", {
      body: { email, password: newPassword },
    });
    assert.equal(fresh.status, 200);
    assert.equal(fresh.json.user.emailVerified, true);
  });

  test("the reset token is single-use — a second consume fails", async () => {
    const email = "singleuse@example.com";
    await registerAccount(email, "a strong password");
    const token = await mintResetToken(email);

    const first = await api("POST", "/api/auth/reset-password", {
      body: { token, newPassword: "first new password" },
    });
    assert.equal(first.status, 200);

    const second = await api("POST", "/api/auth/reset-password", {
      body: { token, newPassword: "second new password" },
    });
    assert.equal(second.status, 400);
  });
});
