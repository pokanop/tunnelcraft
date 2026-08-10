/* Black-box API tests: spawn the real server against a temp SQLite DB,
   exercise auth, sessions, and progress-merge over HTTP, then tear down. */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
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
  role: "user" | "admin";
}
interface AuthResponse {
  token: string;
  user: PublicUser;
}
interface ProgressResponse {
  data: Progress;
  updatedAt: string | null;
}
interface AdminUser {
  id: number;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  remind: boolean;
  role: "user" | "admin";
  createdAt: string;
}
interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
}
interface AdminUserResponse {
  user: AdminUser;
}

interface ApiOptions {
  token?: string;
  body?: unknown;
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
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

/* Admin user management — exercises the server-side authz guard (401/403),
   the list/search API, promote/demote, last-admin lockout (409), self-action
   refusal (403), and the delete cascade. The first admin has to be seeded out
   of band (the migration only back-fills role='user'); we do that here by
   writing directly to the shared temp DB, exactly as promote-admin.ts does in
   production. WAL mode makes this cross-process write safe. */
describe("admin user management", () => {
  const adminEmail = "admin-root@example.com";
  let adminToken = "";
  let adminId = 0;

  /* All admin-test fixtures are seeded directly against the temp DB rather than
     through /api/auth/register+login. Two reasons: (1) it mirrors how the first
     admin is actually promoted in production (out-of-band — see
     promote-admin.ts); (2) the global /api/auth/register and /api/auth/login
     rate-limit buckets (10/15 per min/IP) are already nearly spent by the auth
     + password-reset describes above, so HTTP signups here would 429. WAL mode
     + busy_timeout make these cross-process writes safe alongside the server. */
  async function openDb() {
    const { Database } = await import("bun:sqlite");
    const conn = new Database(path.join(dataDir, "tunnelcraft.db"));
    conn.exec("PRAGMA busy_timeout = 5000");
    return conn;
  }

  /** Insert (or reset) a user with a known password + role and mint a live
      session token for them, returning { id, token }. Idempotent on email. */
  async function seedUser(
    email: string,
    role: "user" | "admin",
    displayName: string | null = null
  ): Promise<{ id: number; token: string }> {
    const { hashSync } = await import("bcryptjs");
    const conn = await openDb();
    try {
      const existing = conn.prepare("SELECT id FROM users WHERE email = ?").get(email) as
        | { id: number }
        | undefined;
      let id = existing?.id;
      const hash = hashSync("a valid admin pass", 10);
      if (id === undefined) {
        const r = conn
          .prepare(
            "INSERT INTO users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)"
          )
          .run(email, hash, displayName, role);
        id = Number(r.lastInsertRowid);
      } else {
        conn
          .prepare("UPDATE users SET password_hash = ?, display_name = ?, role = ? WHERE id = ?")
          .run(hash, displayName, role, id);
      }
      const secret = crypto.randomBytes(32).toString("base64url");
      const exp = new Date(Date.now() + 30 * 86_400_000)
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);
      conn
        .prepare("INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)")
        .run(sha256(secret), id, exp, "admin-test");
      return { id: id!, token: secret };
    } finally {
      conn.close();
    }
  }

  async function setRoleInDb(email: string, role: "user" | "admin"): Promise<void> {
    const conn = await openDb();
    try {
      conn.prepare("UPDATE users SET role = ? WHERE email = ?").run(role, email);
    } finally {
      conn.close();
    }
  }

  async function adminCountInDb(): Promise<number> {
    const conn = await openDb();
    try {
      const row = conn.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as {
        n: number;
      };
      return row.n;
    } finally {
      conn.close();
    }
  }

  before(async () => {
    const admin = await seedUser(adminEmail, "admin");
    adminId = admin.id;
    adminToken = admin.token;
  });

  test("unauthenticated admin requests get 401, non-admin gets 403", async () => {
    assert.equal((await api("GET", "/api/admin/users")).status, 401);
    const civilian = (await seedUser("civilian@example.com", "user")).token;
    assert.equal((await api("GET", "/api/admin/users", { token: civilian })).status, 403);
    assert.equal(
      (
        await api("PATCH", "/api/admin/users/" + adminId, {
          token: civilian,
          body: { role: "admin" },
        })
      ).status,
      403
    );
    assert.equal(
      (
        await api("DELETE", "/api/admin/users/" + adminId, {
          token: civilian,
          body: { confirm: "DELETE" },
        })
      ).status,
      403
    );
  });

  test("/api/me exposes role for admins and regular users", async () => {
    const me = await api<{ user: PublicUser }>("GET", "/api/me", { token: adminToken });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.role, "admin");
    const civilianTok = (await seedUser("rolecheck@example.com", "user")).token;
    const them = await api<{ user: PublicUser }>("GET", "/api/me", { token: civilianTok });
    assert.equal(them.status, 200);
    assert.equal(them.json.user.role, "user");
  });

  test("admin can list users; response never leaks password_hash", async () => {
    const { status, json } = await api<AdminUsersResponse>("GET", "/api/admin/users", {
      token: adminToken,
    });
    assert.equal(status, 200);
    assert.ok(json.total >= 1);
    assert.ok(json.users.length >= 1);
    for (const u of json.users) {
      assert.equal("password_hash" in u, false, "password_hash must never appear in user rows");
      assert.ok(u.role === "user" || u.role === "admin");
    }
  });

  test("search filters by email (case-insensitive)", async () => {
    await seedUser("admin-zeta@example.com", "user");
    const { status, json } = await api<AdminUsersResponse>("GET", "/api/admin/users?q=ZETA", {
      token: adminToken,
    });
    assert.equal(status, 200);
    assert.ok(json.users.some((u) => u.email === "admin-zeta@example.com"));
    assert.equal(
      json.users.some((u) => u.email === adminEmail),
      false
    );
  });

  test("promote + demote a second user when more than one admin exists", async () => {
    const seeded = await seedUser("promoteme@example.com", "user", "Promo");
    const id = seeded.id;
    const listed = (
      await api<AdminUsersResponse>("GET", "/api/admin/users?q=promoteme", { token: adminToken })
    ).json.users;
    const subject = listed[0];
    assert.ok(subject, "seeded user should appear in the list");
    assert.equal(subject.role, "user");

    const promoted = await api<AdminUserResponse>("PATCH", "/api/admin/users/" + id, {
      token: adminToken,
      body: { role: "admin" },
    });
    assert.equal(promoted.status, 200);
    assert.equal(promoted.json.user.role, "admin");

    // now two admins exist, demote should succeed
    const demoted = await api<AdminUserResponse>("PATCH", "/api/admin/users/" + id, {
      token: adminToken,
      body: { role: "user" },
    });
    assert.equal(demoted.status, 200);
    assert.equal(demoted.json.user.role, "user");
  });

  test("PATCH validates body: empty, bad role, and 404 on unknown user", async () => {
    const seeded = await seedUser("validate@example.com", "user");
    const id = seeded.id;

    assert.equal(
      (await api("PATCH", "/api/admin/users/" + id, { token: adminToken, body: {} })).status,
      400
    );
    assert.equal(
      (
        await api("PATCH", "/api/admin/users/" + id, {
          token: adminToken,
          body: { role: "superuser" },
        })
      ).status,
      400
    );
    assert.equal(
      (
        await api("PATCH", "/api/admin/users/9999999", {
          token: adminToken,
          body: { role: "admin" },
        })
      ).status,
      404
    );
  });

  test("admin can edit emailVerified and displayName on another user", async () => {
    const seeded = await seedUser("editable@example.com", "user", "Ed");
    const id = seeded.id;

    const patched = await api<AdminUserResponse>("PATCH", "/api/admin/users/" + id, {
      token: adminToken,
      body: { emailVerified: true, displayName: "Edited Name" },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.user.emailVerified, true);
    assert.equal(patched.json.user.displayName, "Edited Name");
  });

  test("an admin cannot change their own role", async () => {
    const me = await api<{ user: PublicUser }>("GET", "/api/me", { token: adminToken });
    const selfId = me.json.user.id;
    const r = await api("PATCH", "/api/admin/users/" + selfId, {
      token: adminToken,
      body: { role: "user" },
    });
    assert.equal(r.status, 403);
    // role unchanged
    const me2 = await api<{ user: PublicUser }>("GET", "/api/me", { token: adminToken });
    assert.equal(me2.json.user.role, "admin");
  });

  test("the last admin cannot demote themselves", async () => {
    // Make adminEmail the sole admin in the DB, then self-demote must be refused.
    const conn = await openDb();
    try {
      conn.prepare("UPDATE users SET role = 'user' WHERE email != ?").run(adminEmail);
    } finally {
      conn.close();
    }
    assert.equal(await adminCountInDb(), 1);
    const me = await api<{ user: PublicUser }>("GET", "/api/me", { token: adminToken });
    const self = await api("PATCH", "/api/admin/users/" + me.json.user.id, {
      token: adminToken,
      body: { role: "user" },
    });
    // Self-action guard fires first (§4.2); the lockout check (§4.1) is the
    // last line of defense in the concurrent case below.
    assert.equal(self.status, 403);
    assert.equal(await adminCountInDb(), 1);
  });

  test("cross-demotion can never reduce admins to zero (concurrent-request safety)", async () => {
    // Two admins each try to demote the OTHER at the same time. The invariant
    // under test: the admin count can reach 1 but NEVER 0.
    //
    // The PATCH handlers are synchronous, so Node admits them strictly
    // sequentially: the first demotion commits (2→1); the second actor's role
    // was just flipped, makeAuth re-fetches their row on the next request, and
    // requireAdmin rejects them with 403 before they reach the handler. (The
    // 409 "last admin" guard inside tx() is therefore a defensive last line
    // that is unreachable through the HTTP API in this sync model — it cannot
    // fire because any actor who could trigger it has already lost admin
    // status. It is retained per the Stage 1 design.)
    const b = await seedUser("promoteme@example.com", "admin");
    const idA = adminId;
    const idB = b.id;
    assert.equal(await adminCountInDb(), 2);

    const [r1, r2] = await Promise.all([
      api("PATCH", "/api/admin/users/" + idB, { token: adminToken, body: { role: "user" } }),
      api("PATCH", "/api/admin/users/" + idA, { token: b.token, body: { role: "user" } }),
    ]);
    const successes = [r1.status, r2.status].filter((s) => s === 200).length;
    assert.equal(successes, 1, "exactly one cross-demotion may succeed");
    assert.ok(
      [r1.status, r2.status].every((s) => s === 200 || s === 403 || s === 409),
      "the blocked attempt must be a clean 403 or 409"
    );
    assert.equal(await adminCountInDb(), 1, "the system must never reach zero admins");
    // restore adminEmail as a (the) admin for later tests
    await setRoleInDb(adminEmail, "admin");
  });

  test("delete requires confirm, refuses self, and cascades the account", async () => {
    // no confirm → 400
    const seeded = await seedUser("deletee@example.com", "user");
    const id = seeded.id;
    assert.equal(
      (await api("DELETE", "/api/admin/users/" + id, { token: adminToken, body: {} })).status,
      400
    );

    // self-delete → 403
    const me = await api<{ user: PublicUser }>("GET", "/api/me", { token: adminToken });
    assert.equal(
      (
        await api("DELETE", "/api/admin/users/" + me.json.user.id, {
          token: adminToken,
          body: { confirm: "DELETE" },
        })
      ).status,
      403
    );

    // real delete → 200, and the victim's session is gone (cascade)
    const del = await api("DELETE", "/api/admin/users/" + id, {
      token: adminToken,
      body: { confirm: "DELETE" },
    });
    assert.equal(del.status, 200);
    assert.equal((await api("GET", "/api/me", { token: seeded.token })).status, 401);
    const afterList = await api<AdminUsersResponse>("GET", "/api/admin/users?q=deletee", {
      token: adminToken,
    });
    assert.equal(
      afterList.json.users.some((u) => u.email === "deletee@example.com"),
      false
    );
  });

  test("deleting the last admin is refused (self-delete 403; lockout intact)", async () => {
    // deletee2 is the sole admin; it cannot delete itself (self → 403), and no
    // other admin exists to act — so the last-admin lockout holds. The
    // concurrent 409 path is covered by the demotion race above; the delete
    // equivalent is symmetric (same tx + countAdmins guard).
    const sole = await seedUser("deletee2@example.com", "admin");
    await setRoleInDb(adminEmail, "user"); // leave deletee2 as the only admin
    assert.equal(await adminCountInDb(), 1);

    const selfDel = await api("DELETE", "/api/admin/users/" + sole.id, {
      token: sole.token,
      body: { confirm: "DELETE" },
    });
    assert.equal(selfDel.status, 403);

    // restore admin-root for cleanliness; the last admin must still exist
    await setRoleInDb(adminEmail, "admin");
    const stillThere = await api<AdminUsersResponse>("GET", "/api/admin/users?q=deletee2", {
      token: adminToken,
    });
    assert.equal(stillThere.json.users.length, 1, "the last admin must still exist");
  });
});
