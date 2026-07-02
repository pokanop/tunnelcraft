import express from "express";
import type { Request, RequestHandler } from "express";
import cors from "cors";
import { compareSync, hashSync } from "bcryptjs";
import {
  createSession,
  makeAuth,
  createResetToken,
  consumeResetToken,
  createVerifyToken,
  consumeVerifyToken,
} from "./sessions";
import { sendResetMail, sendVerifyMail } from "./mail";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { q, dbHealthy, closeDb, tx, backupTo, schemaVersion } from "./db";
import type { PublicUserRow } from "./db";
import { log, requestLogger } from "./logger";
import { describeDevice } from "./devices";
import { oauthProviders, beginOAuth, finishOAuth } from "./oauth";
import { EMPTY, mergeProgress, sanitizeProgress } from "./progress";
import type { Progress } from "./progress";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const PROD = process.env.NODE_ENV === "production";

let shuttingDown = false;
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(requestLogger());
if (!PROD) app.use(cors());

/* ---------- tiny in-memory rate limit for auth routes ---------- */
const buckets = new Map<string, { n: number; t: number }>();
function rateLimit(max: number, windowMs: number): RequestHandler {
  return (req, res, next) => {
    const key = (req.ip ?? "") + ":" + req.path;
    const now = Date.now();
    const b = buckets.get(key) || { n: 0, t: now };
    if (now - b.t > windowMs) {
      b.n = 0;
      b.t = now;
    }
    b.n++;
    buckets.set(key, b);
    if (b.n > max)
      return res.status(429).json({ error: "Too many attempts — try again in a minute" });
    next();
  };
}

/* ---------- helpers ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Untrusted request body as a bag of unknowns (express types it `any`). */
function bodyOf(req: Request): Record<string, unknown> {
  const b: unknown = req.body;
  return typeof b === "object" && b !== null ? (b as Record<string, unknown>) : {};
}

/** Unwrap req.user/req.sessionId behind the auth middleware — they are always
    set there; throwing (→ 500) only happens if a route forgets `auth`. */
function authed(req: Request): { user: PublicUserRow; sessionId: string } {
  const { user, sessionId } = req;
  if (!user || !sessionId) throw new Error("authed() called outside the auth middleware");
  return { user, sessionId };
}

function signToken(user: PublicUserRow, req?: Request): string {
  return createSession(user.id, req ? req.headers["user-agent"] : "oauth");
}
function publicUser(u: PublicUserRow) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name || null,
    emailVerified: !!u.email_verified,
  };
}
const auth = makeAuth(q.userById);

/* ---------- backup (admin) ----------
   Online, consistent snapshot via SQLite's backup API — safe while serving traffic.
   Guarded by BACKUP_TOKEN; unset means the endpoint is disabled. Writes into
   DATA_DIR/backups and prunes to the newest 10. Wire this to cron/systemd-timer:
   curl -H "Authorization: Bearer $BACKUP_TOKEN" -X POST localhost:4000/api/admin/backup */
const BACKUP_TOKEN = process.env.BACKUP_TOKEN || null;
app.post("/api/admin/backup", rateLimit(4, 60_000), async (req, res) => {
  if (!BACKUP_TOKEN)
    return res.status(404).json({ error: "Backups are not enabled — set BACKUP_TOKEN" });
  const h = req.headers.authorization || "";
  if (h !== "Bearer " + BACKUP_TOKEN)
    return res.status(401).json({ error: "Invalid backup token" });
  const dir = path.join(process.env.DATA_DIR || path.join(moduleDir, "..", "data"), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(
    dir,
    "tunnelcraft-" + new Date().toISOString().replace(/[:.]/g, "-") + ".db"
  );
  try {
    await backupTo(dest);
    const all = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".db"))
      .toSorted();
    for (const f of all.slice(0, Math.max(0, all.length - 10))) fs.unlinkSync(path.join(dir, f));
    const size = fs.statSync(dest).size;
    req.log.info({ dest, size, kept: Math.min(all.length, 10) }, "backup: snapshot written");
    res.json({ ok: true, file: path.basename(dest), bytes: size });
  } catch (e) {
    req.log.error({ err: errMsg(e) }, "backup: failed");
    res.status(500).json({ error: "Backup failed: " + errMsg(e) });
  }
});

/* ---------- health ---------- */
const startedAt = Date.now();
app.get("/api/health/live", (_req, res) => {
  res.json({ status: "ok", uptimeSec: Math.round((Date.now() - startedAt) / 1000) });
});
app.get("/api/health/ready", (req, res) => {
  try {
    dbHealthy();
    if (shuttingDown) return res.status(503).json({ status: "draining" });
    res.json({ status: "ok", db: "ok", uptimeSec: Math.round((Date.now() - startedAt) / 1000) });
  } catch (e) {
    req.log.error({ err: errMsg(e) }, "readiness probe failed");
    res.status(503).json({ status: "unavailable", db: "error" });
  }
});
app.get("/api/health", (_req, res) => res.redirect(307, "/api/health/ready"));

/* ---------- auth routes ---------- */
app.post("/api/auth/register", rateLimit(10, 60_000), (req, res) => {
  const { email, password, displayName } = bodyOf(req);
  if (typeof email !== "string" || !EMAIL_RE.test(email))
    return res.status(400).json({ error: "Enter a valid email address" });
  if (typeof password !== "string" || password.length < 8)
    return res.status(400).json({ error: "Password needs at least 8 characters" });
  const em = email.trim().toLowerCase();
  if (q.userByEmail.get(em))
    return res.status(409).json({ error: "That email already has an account — sign in instead" });
  const hash = hashSync(password, 10);
  const name =
    typeof displayName === "string" && displayName.trim() ? displayName.trim().slice(0, 60) : null;
  const info = q.insertUser.run(em, hash, name);
  const user = q.userById.get(info.lastInsertRowid);
  if (!user) return res.status(500).json({ error: "Registration failed — try again" });
  sendVerifyMail(user.email, createVerifyToken(user.id)).catch(() => {});
  res.status(201).json({ token: signToken(user, req), user: publicUser(user) });
});

app.post("/api/auth/login", rateLimit(15, 60_000), (req, res) => {
  const { email, password } = bodyOf(req);
  const u = q.userByEmail.get((typeof email === "string" ? email : "").trim().toLowerCase());
  if (!u || !compareSync(typeof password === "string" ? password : "", u.password_hash)) {
    return res.status(401).json({ error: "Email or password is incorrect" });
  }
  res.json({ token: signToken(u, req), user: publicUser(u) });
});

app.get("/api/me", auth, (req, res) => res.json({ user: publicUser(authed(req).user) }));

/* ---------- email verification ---------- */
app.post("/api/auth/verify-email", rateLimit(10, 60_000), (req, res) => {
  const { token } = bodyOf(req);
  const userId = typeof token === "string" && token ? consumeVerifyToken(token) : null;
  if (!userId)
    return res
      .status(400)
      .json({ error: "Verification link is invalid or expired — request a new one" });
  q.setVerified.run(userId);
  res.json({ ok: true });
});
app.post("/api/auth/resend-verification", auth, rateLimit(3, 60_000), async (req, res) => {
  const { user } = authed(req);
  if (user.email_verified) return res.json({ ok: true, alreadyVerified: true });
  await sendVerifyMail(user.email, createVerifyToken(user.id)).catch(() => {});
  res.json({ ok: true, message: "Verification email sent — the link is valid for 24 hours" });
});

/* ---------- session management ---------- */
app.post("/api/auth/logout", auth, (req, res) => {
  q.deleteSession.run(authed(req).sessionId);
  res.json({ ok: true });
});
app.post("/api/auth/logout-all", auth, (req, res) => {
  q.deleteUserSessions.run(authed(req).user.id);
  res.json({ ok: true });
});
app.get("/api/auth/sessions", auth, (req, res) => {
  const { user, sessionId } = authed(req);
  const rows = q.listSessions.all(user.id).map((r) => ({
    handle: r.id.slice(0, 12), // opaque reference for revocation, not the secret
    current: r.id === sessionId,
    createdAt: r.created_at,
    lastSeen: r.last_seen,
    device: describeDevice(r.user_agent),
    userAgent: r.user_agent || "",
  }));
  res.json({ sessions: rows });
});
app.delete("/api/auth/sessions/:handle", auth, (req, res) => {
  const { user, sessionId } = authed(req);
  const handle = String(req.params.handle || "");
  if (!/^[0-9a-f]{12}$/.test(handle))
    return res.status(400).json({ error: "Bad session reference" });
  const target = q.listSessions.all(user.id).find((r) => r.id.startsWith(handle));
  if (!target)
    return res.status(404).json({ error: "Session not found — it may already be signed out" });
  q.deleteSession.run(target.id);
  res.json({ ok: true, revokedCurrent: target.id === sessionId });
});

app.post("/api/auth/change-password", auth, rateLimit(10, 60_000), (req, res) => {
  const { user, sessionId } = authed(req);
  const { currentPassword, newPassword } = bodyOf(req);
  if (typeof newPassword !== "string" || newPassword.length < 8)
    return res.status(400).json({ error: "New password needs at least 8 characters" });
  const u = q.userByEmail.get(user.email);
  if (!u) return res.status(401).json({ error: "Account no longer exists" });
  const hasPassword = u.password_hash !== "!oauth";
  if (
    hasPassword &&
    !compareSync(typeof currentPassword === "string" ? currentPassword : "", u.password_hash)
  )
    return res.status(401).json({ error: "Current password is incorrect" });
  tx(() => {
    q.setPassword.run(hashSync(newPassword, 10), u.id);
    q.deleteOtherSessions.run(u.id, sessionId); // revoke everywhere else
  });
  res.json({ ok: true, revokedOthers: true });
});

app.post("/api/auth/forgot-password", rateLimit(5, 60_000), async (req, res) => {
  const { email } = bodyOf(req);
  const u = q.userByEmail.get((typeof email === "string" ? email : "").trim().toLowerCase());
  if (u) await sendResetMail(u.email, createResetToken(u.id));
  // identical response either way — no account enumeration
  res.json({ ok: true, message: "If that email has an account, a reset link is on its way" });
});
app.post("/api/auth/reset-password", rateLimit(10, 60_000), (req, res) => {
  const { token, newPassword } = bodyOf(req);
  if (typeof newPassword !== "string" || newPassword.length < 8)
    return res.status(400).json({ error: "Password needs at least 8 characters" });
  const userId = typeof token === "string" && token ? consumeResetToken(token) : null;
  if (!userId)
    return res.status(400).json({ error: "Reset link is invalid or expired — request a new one" });
  tx(() => {
    q.setPassword.run(hashSync(newPassword, 10), userId);
    q.setVerified.run(userId); // completing a reset proves mailbox control
    q.deleteUserSessions.run(userId); // stolen sessions die with the reset
  }); // atomic: a crash can't leave the new password live with old sessions valid
  res.json({ ok: true });
});

app.delete("/api/account", auth, rateLimit(5, 60_000), (req, res) => {
  const { user } = authed(req);
  const { password, confirm } = bodyOf(req);
  if (confirm !== "DELETE")
    return res.status(400).json({ error: 'Send confirm: "DELETE" to proceed' });
  const u = q.userByEmail.get(user.email);
  if (!u) return res.status(401).json({ error: "Account no longer exists" });
  if (
    u.password_hash !== "!oauth" &&
    !compareSync(typeof password === "string" ? password : "", u.password_hash)
  )
    return res.status(401).json({ error: "Password is incorrect" });
  q.deleteUser.run(u.id); // sessions, oauth links, progress cascade via FKs
  res.json({ ok: true });
});

/* ---------- social login (Arctic: Google + GitHub) ---------- */
app.get("/api/auth/providers", (_req, res) => res.json({ providers: Object.keys(oauthProviders) }));
app.get("/api/auth/:provider", rateLimit(20, 60_000), (req, res) => {
  const { provider } = req.params;
  beginOAuth(typeof provider === "string" ? provider : "", res);
});
app.get("/api/auth/:provider/callback", rateLimit(20, 60_000), (req, res) => {
  const { provider } = req.params;
  finishOAuth(typeof provider === "string" ? provider : "", req.query, signToken, res);
});

/* ---------- progress routes ---------- */
app.get("/api/progress", auth, (req, res) => {
  const row = q.getProgress.get(authed(req).user.id);
  res.json({
    // stored blobs were sanitized on the way in, so parsing straight to Progress is safe
    data: row ? (JSON.parse(row.data) as Progress) : { ...EMPTY },
    updatedAt: row ? row.updated_at : null,
  });
});

app.put("/api/progress", auth, (req, res) => {
  const { user } = authed(req);
  const incoming = sanitizeProgress(bodyOf(req).data);
  const row = q.getProgress.get(user.id);
  const existing = row ? (JSON.parse(row.data) as Progress) : { ...EMPTY };
  const merged = mergeProgress(existing, incoming);
  q.upsertProgress.run(user.id, JSON.stringify(merged));
  res.json({ data: merged });
});

/* ---------- static client in production ---------- */
const dist = path.join(moduleDir, "..", "..", "client", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const server = app.listen(PORT, () => {
  log.info(
    {
      port: PORT,
      servingClient: fs.existsSync(dist),
      pid: process.pid,
      schemaVersion: schemaVersion(),
    },
    "tunnelcraft server listening"
  );
});

/* ---------- graceful shutdown ----------
   SIGTERM/SIGINT: stop accepting connections, flip readiness to 503 (draining),
   let in-flight requests finish, checkpoint + close the DB, then exit.
   A hard timeout guards against a wedged connection holding the process open. */
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10_000);

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "shutdown: draining connections");
  const deadline = setTimeout(() => {
    log.warn({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, "shutdown: timeout reached, forcing exit");
    try {
      closeDb();
      log.info("shutdown: db closed (forced path)");
    } catch (e) {
      log.error({ err: errMsg(e) }, "shutdown: db close failed");
    }
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  deadline.unref();

  server.close((err) => {
    if (err) log.error({ err: err.message }, "shutdown: server close error");
    else log.info("shutdown: http drained");
    try {
      closeDb();
      log.info("shutdown: db checkpointed and closed");
    } catch (e) {
      log.error({ err: errMsg(e) }, "shutdown: db close failed");
    }
    clearTimeout(deadline);
    log.info("shutdown: complete");
    process.exit(err ? 1 : 0);
  });
  // stop keep-alive sockets from pinning the drain
  if (server.closeIdleConnections) server.closeIdleConnections();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (e) => {
  log.fatal({ err: e.message, stack: e.stack }, "uncaught exception");
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (e) => {
  log.error({ err: errMsg(e) }, "unhandled rejection");
});
