/* Uses Node's built-in SQLite (node:sqlite, Node >= 22.5) — zero native dependencies.
   To swap in better-sqlite3, only this file changes. */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "tunnelcraft.db"));
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

/* ---------- versioned migrations ----------
   PRAGMA user_version tracks the applied schema version. Each migration runs
   exactly once, inside a transaction, in order. To change the schema: append a
   new entry to MIGRATIONS — never edit an existing one (existing databases have
   already applied it). Fresh databases simply replay the full history. */
const MIGRATIONS = [
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
    post: (db) => db.exec("UPDATE users SET email_verified = 1"),
  },
];

export function migrate(logger) {
  // Adopt databases created before this migration system existed: they already
  // have the full v2 schema but user_version 0. Detect and stamp them.
  let current = db.prepare("PRAGMA user_version").get().user_version;
  if (current === 0) {
    const hasUsers = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (hasUsers) {
      const hasVerified = db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name='email_verified'").get();
      current = hasVerified ? 2 : 1;
      db.exec("PRAGMA user_version = " + current);
      if (logger) logger.info({ adoptedVersion: current }, "migrate: adopted pre-migration database");
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
      throw new Error("migration v" + m.version + " (" + m.name + ") failed: " + e.message);
    }
  }
  return db.prepare("PRAGMA user_version").get().user_version;
}
migrate();
export function schemaVersion() {
  return db.prepare("PRAGMA user_version").get().user_version;
}

/* transaction helper: node:sqlite has no .transaction() like better-sqlite3,
   so wrap multi-statement sequences manually. Nested calls join the outer tx. */
let txDepth = 0;
export function tx(fn) {
  if (txDepth > 0) return fn();
  db.exec("BEGIN IMMEDIATE");
  txDepth++;
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch { /* already rolled back */ }
    throw e;
  } finally {
    txDepth--;
  }
}

/* online backup: consistent snapshot via SQLite's backup API while the app runs */
export async function backupTo(destPath) {
  const { backup } = await import("node:sqlite");
  await backup(db, destPath);
  return destPath;
}

/* health probe: cheap real query, throws if the DB is broken */
export function dbHealthy() {
  db.prepare("SELECT 1 AS ok").get();
  return true;
}

/* graceful close: checkpoint the WAL so nothing is left to replay on next boot */
export function closeDb() {
  try { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch { /* best effort */ }
  db.close();
}

export const q = {
  setVerified: db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?"),
  insertVerify: db.prepare("INSERT INTO verify_tokens (id, user_id, expires_at) VALUES (?, ?, ?)"),
  verifyById: db.prepare("SELECT * FROM verify_tokens WHERE id = ? AND expires_at > datetime('now')"),
  deleteVerify: db.prepare("DELETE FROM verify_tokens WHERE id = ?"),
  deleteUserVerifies: db.prepare("DELETE FROM verify_tokens WHERE user_id = ?"),
  insertSession: db.prepare("INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)"),
  sessionById: db.prepare("SELECT * FROM sessions WHERE id = ?"),
  touchSession: db.prepare("UPDATE sessions SET last_seen = datetime('now'), expires_at = ? WHERE id = ?"),
  deleteSession: db.prepare("DELETE FROM sessions WHERE id = ?"),
  deleteUserSessions: db.prepare("DELETE FROM sessions WHERE user_id = ?"),
  deleteOtherSessions: db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?"),
  listSessions: db.prepare("SELECT id, created_at, last_seen, user_agent FROM sessions WHERE user_id = ? ORDER BY last_seen DESC"),
  purgeExpired: db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),
  setPassword: db.prepare("UPDATE users SET password_hash = ? WHERE id = ?"),
  deleteUser: db.prepare("DELETE FROM users WHERE id = ?"),
  insertReset: db.prepare("INSERT INTO reset_tokens (id, user_id, expires_at) VALUES (?, ?, ?)"),
  resetById: db.prepare("SELECT * FROM reset_tokens WHERE id = ? AND expires_at > datetime('now')"),
  deleteReset: db.prepare("DELETE FROM reset_tokens WHERE id = ?"),
  deleteUserResets: db.prepare("DELETE FROM reset_tokens WHERE user_id = ?"),
  oauthAccount: db.prepare("SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?"),
  linkOauth: db.prepare("INSERT OR IGNORE INTO oauth_accounts (provider, provider_user_id, user_id) VALUES (?, ?, ?)"),
  insertOauthUser: db.prepare("INSERT INTO users (email, password_hash, display_name) VALUES (?, '!oauth', ?)"),
  userByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  userById: db.prepare("SELECT id, email, display_name, email_verified FROM users WHERE id = ?"),
  insertUser: db.prepare("INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)"),
  getProgress: db.prepare("SELECT data, updated_at FROM progress WHERE user_id = ?"),
  upsertProgress: db.prepare(`
    INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')
  `),
};
