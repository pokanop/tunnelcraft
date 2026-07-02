import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { createSession, destroySession, makeAuth, createResetToken, consumeResetToken, createVerifyToken, consumeVerifyToken } from "./sessions.js";
import { sendResetMail, sendVerifyMail } from "./mail.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { q, dbHealthy, closeDb, tx, backupTo, schemaVersion } from "./db.js";
import { log, requestLogger } from "./logger.js";
import { describeDevice } from "./devices.js";
import { oauthProviders, beginOAuth, finishOAuth } from "./oauth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const PROD = process.env.NODE_ENV === "production";

let shuttingDown = false;
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(requestLogger());
if (!PROD) app.use(cors());

/* ---------- tiny in-memory rate limit for auth routes ---------- */
const buckets = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ip + ":" + req.path;
    const now = Date.now();
    const b = buckets.get(key) || { n: 0, t: now };
    if (now - b.t > windowMs) { b.n = 0; b.t = now; }
    b.n++;
    buckets.set(key, b);
    if (b.n > max) return res.status(429).json({ error: "Too many attempts — try again in a minute" });
    next();
  };
}

/* ---------- helpers ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY = { les: {}, quiz: {}, ex: {}, cap: {}, rev: {}, notes: {}, marks: {}, meta: {} };
const LIMITS = { rev: 3000, notes: 500, noteLen: 4000 };

function mergeProgress(a, b) {
  const out = { les: {}, quiz: {}, ex: {}, cap: {}, rev: {}, notes: {}, marks: {}, meta: {} };
  for (const k of ["les", "ex", "cap", "marks"]) Object.assign(out[k], (a && a[k]) || {}, (b && b[k]) || {});
  const qa = (a && a.quiz) || {}, qb = (b && b.quiz) || {};
  for (const id of new Set([...Object.keys(qa), ...Object.keys(qb)])) out.quiz[id] = Math.max(qa[id] || 0, qb[id] || 0);
  const ra = (a && a.rev) || {}, rb = (b && b.rev) || {};
  for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    const x = ra[k], y = rb[k];
    out.rev[k] = !x ? y : !y ? x
      : x.box !== y.box ? (x.box < y.box ? x : y)
      : { box: x.box, due: Math.min(x.due, y.due), misses: Math.max(x.misses || 0, y.misses || 0) };
  }
  const na = (a && a.notes) || {}, nb = (b && b.notes) || {};
  for (const k of new Set([...Object.keys(na), ...Object.keys(nb)])) {
    const x = na[k], y = nb[k];
    out.notes[k] = !x ? y : !y ? x : (x.t || 0) >= (y.t || 0) ? x : y;
  }
  const ma = (a && a.meta) || {}, mb = (b && b.meta) || {};
  const finals = {};
  for (const k of new Set([...Object.keys(ma.finals || {}), ...Object.keys(mb.finals || {})]))
    finals[k] = Math.max((ma.finals || {})[k] || 0, (mb.finals || {})[k] || 0);
  out.meta = {
    streak: Math.max(ma.streak || 0, mb.streak || 0),
    bestStreak: Math.max(ma.bestStreak || 0, mb.bestStreak || 0),
    lastDay: (ma.lastDay || "") > (mb.lastDay || "") ? ma.lastDay || "" : mb.lastDay || "",
    last: (ma.lastT || 0) >= (mb.lastT || 0) ? ma.last || null : mb.last || null,
    lastT: Math.max(ma.lastT || 0, mb.lastT || 0),
    finals,
  };
  return out;
}
function sanitizeProgress(p) {
  if (!p || typeof p !== "object") return JSON.parse(JSON.stringify(EMPTY));
  const out = { les: {}, quiz: {}, ex: {}, cap: {}, rev: {}, notes: {}, marks: {}, meta: {} };
  const okId = (id) => typeof id === "string" && id.length <= 64;
  for (const k of ["les", "ex", "cap", "marks"]) {
    const src = p[k];
    if (src && typeof src === "object")
      for (const [id, v] of Object.entries(src)) if (okId(id) && v === true) out[k][id] = true;
  }
  if (p.quiz && typeof p.quiz === "object")
    for (const [id, v] of Object.entries(p.quiz)) {
      const n = Number(v);
      if (okId(id) && Number.isFinite(n)) out.quiz[id] = Math.max(0, Math.min(100, Math.round(n)));
    }
  if (p.rev && typeof p.rev === "object")
    for (const [id, c] of Object.entries(p.rev).slice(0, LIMITS.rev)) {
      if (!okId(id) || !c || typeof c !== "object") continue;
      const box = Math.max(0, Math.min(8, Math.round(Number(c.box) || 0)));
      const due = Number(c.due); const misses = Math.max(0, Math.min(999, Math.round(Number(c.misses) || 0)));
      if (Number.isFinite(due)) out.rev[id] = { box, due, misses };
    }
  if (p.notes && typeof p.notes === "object")
    for (const [id, n] of Object.entries(p.notes).slice(0, LIMITS.notes)) {
      if (!okId(id) || !n || typeof n !== "object" || typeof n.v !== "string") continue;
      out.notes[id] = { v: n.v.slice(0, LIMITS.noteLen), t: Number(n.t) || 0 };
    }
  if (p.meta && typeof p.meta === "object") {
    const m = p.meta;
    const finals = {};
    if (m.finals && typeof m.finals === "object")
      for (const [k, v] of Object.entries(m.finals)) if (okId(k) && Number.isFinite(Number(v))) finals[k] = Math.max(0, Math.min(100, Math.round(Number(v))));
    out.meta = {
      streak: Math.max(0, Math.min(100000, Math.round(Number(m.streak) || 0))),
      bestStreak: Math.max(0, Math.min(100000, Math.round(Number(m.bestStreak) || 0))),
      lastDay: typeof m.lastDay === "string" ? m.lastDay.slice(0, 10) : "",
      last: okId(m.last || "") ? m.last : null,
      lastT: Number(m.lastT) || 0,
      finals,
    };
  }
  return out;
}
function signToken(user, req) {
  return createSession(user.id, req ? req.headers["user-agent"] : "oauth");
}
function publicUser(u) {
  return { id: u.id, email: u.email, displayName: u.display_name || null, emailVerified: !!u.email_verified };
}
const auth = makeAuth(q.userById);

/* ---------- backup (admin) ----------
   Online, consistent snapshot via SQLite's backup API — safe while serving traffic.
   Guarded by BACKUP_TOKEN; unset means the endpoint is disabled. Writes into
   DATA_DIR/backups and prunes to the newest 10. Wire this to cron/systemd-timer:
   curl -H "Authorization: Bearer $BACKUP_TOKEN" -X POST localhost:4000/api/admin/backup */
const BACKUP_TOKEN = process.env.BACKUP_TOKEN || null;
app.post("/api/admin/backup", rateLimit(4, 60_000), async (req, res) => {
  if (!BACKUP_TOKEN) return res.status(404).json({ error: "Backups are not enabled — set BACKUP_TOKEN" });
  const h = req.headers.authorization || "";
  if (h !== "Bearer " + BACKUP_TOKEN) return res.status(401).json({ error: "Invalid backup token" });
  const dir = path.join(process.env.DATA_DIR || path.join(__dirname, "..", "data"), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, "tunnelcraft-" + new Date().toISOString().replace(/[:.]/g, "-") + ".db");
  try {
    await backupTo(dest);
    const all = fs.readdirSync(dir).filter((f) => f.endsWith(".db")).sort();
    for (const f of all.slice(0, Math.max(0, all.length - 10))) fs.unlinkSync(path.join(dir, f));
    const size = fs.statSync(dest).size;
    req.log.info({ dest, size, kept: Math.min(all.length, 10) }, "backup: snapshot written");
    res.json({ ok: true, file: path.basename(dest), bytes: size });
  } catch (e) {
    req.log.error({ err: e.message }, "backup: failed");
    res.status(500).json({ error: "Backup failed: " + e.message });
  }
});

/* ---------- health ---------- */
const startedAt = Date.now();
app.get("/api/health/live", (req, res) => {
  res.json({ status: "ok", uptimeSec: Math.round((Date.now() - startedAt) / 1000) });
});
app.get("/api/health/ready", (req, res) => {
  try {
    dbHealthy();
    if (shuttingDown) return res.status(503).json({ status: "draining" });
    res.json({ status: "ok", db: "ok", uptimeSec: Math.round((Date.now() - startedAt) / 1000) });
  } catch (e) {
    req.log.error({ err: e.message }, "readiness probe failed");
    res.status(503).json({ status: "unavailable", db: "error" });
  }
});
app.get("/api/health", (req, res) => res.redirect(307, "/api/health/ready"));

/* ---------- auth routes ---------- */
app.post("/api/auth/register", rateLimit(10, 60_000), (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!EMAIL_RE.test(email || "")) return res.status(400).json({ error: "Enter a valid email address" });
  if (typeof password !== "string" || password.length < 8) return res.status(400).json({ error: "Password needs at least 8 characters" });
  const em = email.trim().toLowerCase();
  if (q.userByEmail.get(em)) return res.status(409).json({ error: "That email already has an account — sign in instead" });
  const hash = bcrypt.hashSync(password, 10);
  const name = typeof displayName === "string" && displayName.trim() ? displayName.trim().slice(0, 60) : null;
  const info = q.insertUser.run(em, hash, name);
  const user = q.userById.get(info.lastInsertRowid);
  sendVerifyMail(user.email, createVerifyToken(user.id)).catch(() => {});
  res.status(201).json({ token: signToken(user, req), user: publicUser(user) });
});

app.post("/api/auth/login", rateLimit(15, 60_000), (req, res) => {
  const { email, password } = req.body || {};
  const u = q.userByEmail.get((email || "").trim().toLowerCase());
  if (!u || !bcrypt.compareSync(password || "", u.password_hash)) {
    return res.status(401).json({ error: "Email or password is incorrect" });
  }
  res.json({ token: signToken(u, req), user: publicUser(u) });
});

app.get("/api/me", auth, (req, res) => res.json({ user: publicUser(req.user) }));

/* ---------- email verification ---------- */
app.post("/api/auth/verify-email", rateLimit(10, 60_000), (req, res) => {
  const { token } = req.body || {};
  const userId = token ? consumeVerifyToken(token) : null;
  if (!userId) return res.status(400).json({ error: "Verification link is invalid or expired — request a new one" });
  q.setVerified.run(userId);
  res.json({ ok: true });
});
app.post("/api/auth/resend-verification", auth, rateLimit(3, 60_000), async (req, res) => {
  if (req.user.email_verified) return res.json({ ok: true, alreadyVerified: true });
  await sendVerifyMail(req.user.email, createVerifyToken(req.user.id)).catch(() => {});
  res.json({ ok: true, message: "Verification email sent — the link is valid for 24 hours" });
});

/* ---------- session management ---------- */
app.post("/api/auth/logout", auth, (req, res) => {
  q.deleteSession.run(req.sessionId);
  res.json({ ok: true });
});
app.post("/api/auth/logout-all", auth, (req, res) => {
  q.deleteUserSessions.run(req.user.id);
  res.json({ ok: true });
});
app.get("/api/auth/sessions", auth, (req, res) => {
  const rows = q.listSessions.all(req.user.id).map((r) => ({
    handle: r.id.slice(0, 12),           // opaque reference for revocation, not the secret
    current: r.id === req.sessionId,
    createdAt: r.created_at,
    lastSeen: r.last_seen,
    device: describeDevice(r.user_agent),
    userAgent: r.user_agent || "",
  }));
  res.json({ sessions: rows });
});
app.delete("/api/auth/sessions/:handle", auth, (req, res) => {
  const handle = String(req.params.handle || "");
  if (!/^[0-9a-f]{12}$/.test(handle)) return res.status(400).json({ error: "Bad session reference" });
  const target = q.listSessions.all(req.user.id).find((r) => r.id.startsWith(handle));
  if (!target) return res.status(404).json({ error: "Session not found — it may already be signed out" });
  q.deleteSession.run(target.id);
  res.json({ ok: true, revokedCurrent: target.id === req.sessionId });
});

app.post("/api/auth/change-password", auth, rateLimit(10, 60_000), (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof newPassword !== "string" || newPassword.length < 8)
    return res.status(400).json({ error: "New password needs at least 8 characters" });
  const u = q.userByEmail.get(req.user.email);
  const hasPassword = u.password_hash !== "!oauth";
  if (hasPassword && !bcrypt.compareSync(currentPassword || "", u.password_hash))
    return res.status(401).json({ error: "Current password is incorrect" });
  tx(() => {
    q.setPassword.run(bcrypt.hashSync(newPassword, 10), u.id);
    q.deleteOtherSessions.run(u.id, req.sessionId); // revoke everywhere else
  });
  res.json({ ok: true, revokedOthers: true });
});

app.post("/api/auth/forgot-password", rateLimit(5, 60_000), async (req, res) => {
  const u = q.userByEmail.get(((req.body || {}).email || "").trim().toLowerCase());
  if (u) await sendResetMail(u.email, createResetToken(u.id));
  // identical response either way — no account enumeration
  res.json({ ok: true, message: "If that email has an account, a reset link is on its way" });
});
app.post("/api/auth/reset-password", rateLimit(10, 60_000), (req, res) => {
  const { token, newPassword } = req.body || {};
  if (typeof newPassword !== "string" || newPassword.length < 8)
    return res.status(400).json({ error: "Password needs at least 8 characters" });
  const userId = token ? consumeResetToken(token) : null;
  if (!userId) return res.status(400).json({ error: "Reset link is invalid or expired — request a new one" });
  tx(() => {
    q.setPassword.run(bcrypt.hashSync(newPassword, 10), userId);
    q.setVerified.run(userId);                      // completing a reset proves mailbox control
    q.deleteUserSessions.run(userId);               // stolen sessions die with the reset
  }); // atomic: a crash can't leave the new password live with old sessions valid
  res.json({ ok: true });
});

app.delete("/api/account", auth, rateLimit(5, 60_000), (req, res) => {
  const { password, confirm } = req.body || {};
  if (confirm !== "DELETE") return res.status(400).json({ error: 'Send confirm: "DELETE" to proceed' });
  const u = q.userByEmail.get(req.user.email);
  if (u.password_hash !== "!oauth" && !bcrypt.compareSync(password || "", u.password_hash))
    return res.status(401).json({ error: "Password is incorrect" });
  q.deleteUser.run(u.id);   // sessions, oauth links, progress cascade via FKs
  res.json({ ok: true });
});

/* ---------- social login (Arctic: Google + GitHub) ---------- */
app.get("/api/auth/providers", (req, res) => res.json({ providers: Object.keys(oauthProviders) }));
app.get("/api/auth/:provider(google|github)", rateLimit(20, 60_000), (req, res) => {
  beginOAuth(req.params.provider, res);
});
app.get("/api/auth/:provider(google|github)/callback", rateLimit(20, 60_000), (req, res) => {
  finishOAuth(req.params.provider, req.query, signToken, res);
});

/* ---------- progress routes ---------- */
app.get("/api/progress", auth, (req, res) => {
  const row = q.getProgress.get(req.user.id);
  res.json({ data: row ? JSON.parse(row.data) : { ...EMPTY }, updatedAt: row ? row.updated_at : null });
});

app.put("/api/progress", auth, (req, res) => {
  const incoming = sanitizeProgress(req.body && req.body.data);
  const row = q.getProgress.get(req.user.id);
  const existing = row ? JSON.parse(row.data) : { ...EMPTY };
  const merged = mergeProgress(existing, incoming);
  q.upsertProgress.run(req.user.id, JSON.stringify(merged));
  res.json({ data: merged });
});

/* ---------- static client in production ---------- */
const dist = path.join(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
}

const server = app.listen(PORT, () => {
  log.info({ port: Number(PORT), servingClient: fs.existsSync(dist), pid: process.pid, schemaVersion: schemaVersion() }, "tunnelcraft server listening");
});

/* ---------- graceful shutdown ----------
   SIGTERM/SIGINT: stop accepting connections, flip readiness to 503 (draining),
   let in-flight requests finish, checkpoint + close the DB, then exit.
   A hard timeout guards against a wedged connection holding the process open. */
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10_000);

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "shutdown: draining connections");
  const deadline = setTimeout(() => {
    log.warn({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, "shutdown: timeout reached, forcing exit");
    try { closeDb(); log.info("shutdown: db closed (forced path)"); } catch (e) { log.error({ err: e.message }, "shutdown: db close failed"); }
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
      log.error({ err: e.message }, "shutdown: db close failed");
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
process.on("uncaughtException", (e) => { log.fatal({ err: e.message, stack: e.stack }, "uncaught exception"); shutdown("uncaughtException"); });
process.on("unhandledRejection", (e) => { log.error({ err: String(e && e.message || e) }, "unhandled rejection"); });
