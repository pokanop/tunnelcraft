/* Built-in SQLite, runtime-adaptive — zero native dependencies.
   Under Bun this uses bun:sqlite; under Node (>= 22.5) node:sqlite.
   Both expose the same surface we use: prepare().get/.all/.run (run returns
   { changes, lastInsertRowid }), exec(), close().
   To swap in better-sqlite3, only this file changes. */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Logger } from "pino";

/* ---------- row types ---------- */
export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string | null;
  created_at: string;
  email_verified: number;
}
/** Projection returned by `q.userById` (no password hash, no created_at). */
export interface PublicUserRow {
  id: number;
  email: string;
  display_name: string | null;
  email_verified: number;
}
export interface SessionRow {
  id: string;
  user_id: number;
  created_at: string;
  expires_at: string;
  last_seen: string;
  user_agent: string | null;
}
/** Projection returned by `q.listSessions`. */
export interface SessionListRow {
  id: string;
  created_at: string;
  last_seen: string;
  user_agent: string | null;
}
/** Shared shape of reset_tokens and verify_tokens rows. */
export interface TokenRow {
  id: string;
  user_id: number;
  expires_at: string;
}
export interface ProgressRow {
  data: string;
  updated_at: string;
}
interface OauthAccountRow {
  user_id: number;
}

/* ---------- minimal structural driver surface ----------
   The intersection of bun:sqlite's Database and node:sqlite's DatabaseSync that
   this app relies on. Both classes satisfy these interfaces structurally. */
type SqlValue = string | number | bigint | null;
export interface SqlRunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}
interface SqlStatement {
  get(...params: SqlValue[]): unknown;
  all(...params: SqlValue[]): unknown[];
  run(...params: SqlValue[]): SqlRunResult;
}
export interface SqlDb {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  close(): void;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(moduleDir, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "tunnelcraft.db");
export const db: SqlDb =
  typeof Bun !== "undefined"
    ? new (await import("bun:sqlite")).Database(dbPath, { create: true })
    : new (await import("node:sqlite")).DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

/* ---------- versioned migrations ----------
   PRAGMA user_version tracks the applied schema version. Each migration runs
   exactly once, inside a transaction, in order. To change the schema: append a
   new entry to MIGRATIONS — never edit an existing one (existing databases have
   already applied it). Fresh databases simply replay the full history. */
interface Migration {
  version: number;
  name: string;
  sql: string;
  post?: (db: SqlDb) => void;
}
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial schema",
    sql: `
      CREATE TABLE users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name  TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE oauth_accounts (
        provider         TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (provider, provider_user_id)
      );
      CREATE TABLE sessions (
        id          TEXT PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at  TEXT NOT NULL,
        last_seen   TEXT NOT NULL DEFAULT (datetime('now')),
        user_agent  TEXT
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE TABLE reset_tokens (
        id          TEXT PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at  TEXT NOT NULL
      );
      CREATE TABLE progress (
        user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data       TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 2,
    name: "email verification",
    sql: `
      ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE verify_tokens (
        id          TEXT PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at  TEXT NOT NULL
      );
    `,
    // pre-verification accounts are grandfathered as verified
    post: (d) => d.exec("UPDATE users SET email_verified = 1"),
  },
];

function userVersion(): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  return row.user_version;
}

export function migrate(logger?: Logger): number {
  // Adopt databases created before this migration system existed: they already
  // have the full v2 schema but user_version 0. Detect and stamp them.
  let current = userVersion();
  if (current === 0) {
    const hasUsers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .get();
    if (hasUsers) {
      const hasVerified = db
        .prepare("SELECT 1 FROM pragma_table_info('users') WHERE name='email_verified'")
        .get();
      current = hasVerified ? 2 : 1;
      db.exec("PRAGMA user_version = " + current);
      if (logger)
        logger.info({ adoptedVersion: current }, "migrate: adopted pre-migration database");
    }
  }
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      if (m.post) m.post(db);
      db.exec("PRAGMA user_version = " + m.version);
      db.exec("COMMIT");
      if (logger) logger.info({ version: m.version, name: m.name }, "migrate: applied");
    } catch (e) {
      db.exec("ROLLBACK");
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error("migration v" + m.version + " (" + m.name + ") failed: " + msg, {
        cause: e,
      });
    }
  }
  return userVersion();
}
migrate();
export function schemaVersion(): number {
  return userVersion();
}

/* transaction helper: node:sqlite has no .transaction() like better-sqlite3,
   so wrap multi-statement sequences manually. Nested calls join the outer tx. */
let txDepth = 0;
export function tx<T>(fn: () => T): T {
  if (txDepth > 0) return fn();
  db.exec("BEGIN IMMEDIATE");
  txDepth++;
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    throw e;
  } finally {
    txDepth--;
  }
}

/* online backup: consistent snapshot while the app runs.
   VACUUM INTO is engine-level SQLite and behaves identically under Bun and Node
   (unlike the backup() helper, which is node:sqlite-only). Dest must not exist —
   callers use timestamped filenames. */
export async function backupTo(destPath: string): Promise<string> {
  db.prepare("VACUUM INTO ?").run(destPath);
  return destPath;
}

/* health probe: cheap real query, throws if the DB is broken */
export function dbHealthy(): boolean {
  db.prepare("SELECT 1 AS ok").get();
  return true;
}

/* graceful close: checkpoint the WAL so nothing is left to replay on next boot */
export function closeDb(): void {
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    /* best effort */
  }
  db.close();
}

/* ---------- typed query layer ----------
   Each prepared statement gets a precise (params, row) signature so callers get
   real row types back. `get` is normalized to `Row | undefined`: bun:sqlite
   returns null for "no row" while node:sqlite returns undefined. */
export interface Query<Params extends SqlValue[], Row> {
  get(...params: Params): Row | undefined;
  all(...params: Params): Row[];
  run(...params: Params): SqlRunResult;
}

function query<Params extends SqlValue[], Row = never>(sql: string): Query<Params, Row> {
  const stmt = db.prepare(sql);
  return {
    get: (...params: Params) => (stmt.get(...params) ?? undefined) as Row | undefined,
    all: (...params: Params) => stmt.all(...params) as Row[],
    run: (...params: Params) => stmt.run(...params),
  };
}

/** A user id: number from row reads, possibly bigint from lastInsertRowid. */
type UserId = number | bigint;

export const q = {
  setVerified: query<[userId: UserId]>("UPDATE users SET email_verified = 1 WHERE id = ?"),
  insertVerify: query<[id: string, userId: UserId, expiresAt: string]>(
    "INSERT INTO verify_tokens (id, user_id, expires_at) VALUES (?, ?, ?)"
  ),
  verifyById: query<[id: string], TokenRow>(
    "SELECT * FROM verify_tokens WHERE id = ? AND expires_at > datetime('now')"
  ),
  deleteVerify: query<[id: string]>("DELETE FROM verify_tokens WHERE id = ?"),
  deleteUserVerifies: query<[userId: UserId]>("DELETE FROM verify_tokens WHERE user_id = ?"),
  insertSession: query<[id: string, userId: UserId, expiresAt: string, userAgent: string]>(
    "INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)"
  ),
  sessionById: query<[id: string], SessionRow>("SELECT * FROM sessions WHERE id = ?"),
  touchSession: query<[expiresAt: string, id: string]>(
    "UPDATE sessions SET last_seen = datetime('now'), expires_at = ? WHERE id = ?"
  ),
  deleteSession: query<[id: string]>("DELETE FROM sessions WHERE id = ?"),
  deleteUserSessions: query<[userId: UserId]>("DELETE FROM sessions WHERE user_id = ?"),
  deleteOtherSessions: query<[userId: UserId, keepId: string]>(
    "DELETE FROM sessions WHERE user_id = ? AND id != ?"
  ),
  listSessions: query<[userId: UserId], SessionListRow>(
    "SELECT id, created_at, last_seen, user_agent FROM sessions WHERE user_id = ? ORDER BY last_seen DESC"
  ),
  purgeExpired: query<[]>("DELETE FROM sessions WHERE expires_at < datetime('now')"),
  setPassword: query<[passwordHash: string, userId: UserId]>(
    "UPDATE users SET password_hash = ? WHERE id = ?"
  ),
  deleteUser: query<[userId: UserId]>("DELETE FROM users WHERE id = ?"),
  insertReset: query<[id: string, userId: UserId, expiresAt: string]>(
    "INSERT INTO reset_tokens (id, user_id, expires_at) VALUES (?, ?, ?)"
  ),
  resetById: query<[id: string], TokenRow>(
    "SELECT * FROM reset_tokens WHERE id = ? AND expires_at > datetime('now')"
  ),
  deleteReset: query<[id: string]>("DELETE FROM reset_tokens WHERE id = ?"),
  deleteUserResets: query<[userId: UserId]>("DELETE FROM reset_tokens WHERE user_id = ?"),
  oauthAccount: query<[provider: string, providerUserId: string], OauthAccountRow>(
    "SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?"
  ),
  linkOauth: query<[provider: string, providerUserId: string, userId: UserId]>(
    "INSERT OR IGNORE INTO oauth_accounts (provider, provider_user_id, user_id) VALUES (?, ?, ?)"
  ),
  insertOauthUser: query<[email: string, displayName: string | null]>(
    "INSERT INTO users (email, password_hash, display_name) VALUES (?, '!oauth', ?)"
  ),
  userByEmail: query<[email: string], UserRow>("SELECT * FROM users WHERE email = ?"),
  userById: query<[id: UserId], PublicUserRow>(
    "SELECT id, email, display_name, email_verified FROM users WHERE id = ?"
  ),
  insertUser: query<[email: string, passwordHash: string, displayName: string | null]>(
    "INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)"
  ),
  getProgress: query<[userId: UserId], ProgressRow>(
    "SELECT data, updated_at FROM progress WHERE user_id = ?"
  ),
  upsertProgress: query<[userId: UserId, data: string]>(`
    INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')
  `),
};
