/* DB-backed sessions (Lucia-style, per Arctic's companion guidance).
   The bearer token is an opaque random secret; only its SHA-256 lands in the DB,
   so a database leak doesn't leak usable tokens. Sliding 30-day expiry. */
import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { q } from "./db";
import type { PublicUserRow, Query, SessionRow } from "./db";

const SESSION_DAYS = 30;

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}
function expiry(): string {
  return new Date(Date.now() + SESSION_DAYS * 86_400_000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
}

export function createSession(userId: number | bigint, userAgent: string | undefined): string {
  const secret = crypto.randomBytes(32).toString("base64url");
  q.insertSession.run(sha256(secret), userId, expiry(), (userAgent || "").slice(0, 200));
  return secret; // the client stores THIS; we store only the hash
}

export function destroySession(secret: string): void {
  q.deleteSession.run(sha256(secret));
}

export function validateSession(secret: string): SessionRow | null {
  const row = q.sessionById.get(sha256(secret));
  if (!row) return null;
  if (new Date(row.expires_at + "Z") < new Date()) {
    q.deleteSession.run(row.id);
    return null;
  }
  q.touchSession.run(expiry(), row.id); // sliding expiry + last_seen
  return row;
}

/* Express middleware: Bearer <secret> → req.user, req.sessionId */
export function makeAuth(userById: Query<[id: number | bigint], PublicUserRow>): RequestHandler {
  return (req, res, next) => {
    const h = req.headers.authorization || "";
    const secret = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!secret) return res.status(401).json({ error: "Sign in required" });
    const sess = validateSession(secret);
    if (!sess) return res.status(401).json({ error: "Session expired — sign in again" });
    const user = userById.get(sess.user_id);
    if (!user) {
      q.deleteSession.run(sess.id);
      return res.status(401).json({ error: "Account no longer exists" });
    }
    req.user = user;
    req.sessionId = sess.id;
    next();
  };
}

/* Email-verification tokens: hash-at-rest, 24-hour TTL, single use, one live per user */
export function createVerifyToken(userId: number | bigint): string {
  q.deleteUserVerifies.run(userId);
  const secret = crypto.randomBytes(32).toString("base64url");
  const exp = new Date(Date.now() + 24 * 3600_000).toISOString().replace("T", " ").slice(0, 19);
  q.insertVerify.run(sha256(secret), userId, exp);
  return secret;
}
export function consumeVerifyToken(secret: string): number | null {
  const row = q.verifyById.get(sha256(secret));
  if (!row) return null;
  q.deleteVerify.run(row.id);
  return row.user_id;
}

/* Password-reset tokens: same hash-at-rest discipline, 30-minute TTL, single use */
export function createResetToken(userId: number | bigint): string {
  q.deleteUserResets.run(userId); // one live token per user
  const secret = crypto.randomBytes(32).toString("base64url");
  const exp = new Date(Date.now() + 30 * 60_000).toISOString().replace("T", " ").slice(0, 19);
  q.insertReset.run(sha256(secret), userId, exp);
  return secret;
}
export function consumeResetToken(secret: string): number | null {
  const row = q.resetById.get(sha256(secret));
  if (!row) return null;
  q.deleteReset.run(row.id);
  return row.user_id;
}

/* Periodic cleanup */
setInterval(() => {
  try {
    q.purgeExpired.run();
  } catch {
    /* noop */
  }
}, 6 * 3600_000).unref();
