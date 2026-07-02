/* Black-box API tests: spawn the real server against a temp SQLite DB,
   exercise auth, sessions, and progress-merge over HTTP, then tear down. */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4100 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
let proc;
let dataDir;

async function api(method, p, { token, body } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, json };
}

before(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "tunnelcraft-test-"));
  proc = spawn(process.execPath, [path.join(__dirname, "..", "src", "index.js")], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, LOG_LEVEL: "silent" },
    stdio: "ignore",
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
    const { status, json } = await api("GET", "/api/health/live");
    assert.equal(status, 200);
    assert.equal(json.status, "ok");
  });
  test("readiness probes the DB", async () => {
    const { status, json } = await api("GET", "/api/health/ready");
    assert.equal(status, 200);
    assert.equal(json.db, "ok");
  });
});

describe("auth", () => {
  const email = "alice@example.com";
  const password = "correct horse battery";
  let token;

  test("register returns a token and user", async () => {
    const { status, json } = await api("POST", "/api/auth/register", {
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
    const { status, json } = await api("POST", "/api/auth/login", { body: { email, password } });
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
    const me = await api("GET", "/api/me", { token });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.email, email);
  });

  test("logout revokes the session", async () => {
    const { json } = await api("POST", "/api/auth/login", { body: { email, password } });
    const t = json.token;
    assert.equal((await api("GET", "/api/me", { token: t })).status, 200);
    assert.equal((await api("POST", "/api/auth/logout", { token: t })).status, 200);
    assert.equal((await api("GET", "/api/me", { token: t })).status, 401);
  });

  test("logout-all revokes every session but keeps none behind", async () => {
    const a = (await api("POST", "/api/auth/login", { body: { email, password } })).json.token;
    const b = (await api("POST", "/api/auth/login", { body: { email, password } })).json.token;
    assert.equal((await api("POST", "/api/auth/logout-all", { token: a })).status, 200);
    assert.equal((await api("GET", "/api/me", { token: a })).status, 401);
    assert.equal((await api("GET", "/api/me", { token: b })).status, 401);
  });

  test("unconfigured OAuth provider 404s; unknown provider 404s", async () => {
    assert.equal((await api("GET", "/api/auth/google")).status, 404);
    assert.equal((await api("GET", "/api/auth/notaprovider")).status, 404);
  });

  test("providers list is empty when no OAuth is configured", async () => {
    const { json } = await api("GET", "/api/auth/providers");
    assert.deepEqual(json.providers, []);
  });
});

describe("progress sync + merge", () => {
  let token;

  before(async () => {
    const { json } = await api("POST", "/api/auth/register", {
      body: { email: "sync@example.com", password: "another good pass" },
    });
    token = json.token;
  });

  test("fresh account has empty progress", async () => {
    const { status, json } = await api("GET", "/api/progress", { token });
    assert.equal(status, 200);
    assert.deepEqual(json.data.les, {});
    assert.equal(json.updatedAt, null);
  });

  test("lessons union across devices", async () => {
    await api("PUT", "/api/progress", { token, body: { data: { les: { "n01-1": true } } } });
    const { json } = await api("PUT", "/api/progress", {
      token,
      body: { data: { les: { "n01-2": true } } },
    });
    assert.deepEqual(json.data.les, { "n01-1": true, "n01-2": true });
  });

  test("best quiz score wins on merge", async () => {
    await api("PUT", "/api/progress", { token, body: { data: { quiz: { q1: 90 } } } });
    const { json } = await api("PUT", "/api/progress", {
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
    const { json } = await api("PUT", "/api/progress", {
      token,
      body: { data: { rev: { c1: { box: 1, due: 2000, misses: 2 } } } },
    });
    assert.equal(json.data.rev.c1.box, 1);
  });

  test("progress requires auth", async () => {
    assert.equal((await api("GET", "/api/progress")).status, 401);
  });

  test("malformed progress body is sanitized, not fatal", async () => {
    const { status, json } = await api("PUT", "/api/progress", {
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
    const reg = await api("POST", "/api/auth/register", {
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
