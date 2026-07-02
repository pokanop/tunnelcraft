# TUNNELCRAFT

A full-stack learning platform for networking, Rust, and VPN engineering — from first
packet to production tunnel client.

**29 modules · 118 lessons · 33 hands-on labs · 28 quiz checkpoints (~49 h)** across four tracks:

| Track                      | Modules               | Covers                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Network Fundamentals   | N01–N13 (12)          | Layers & addressing, Ethernet/switching/VLANs/ARP, IP/ICMP/IPv6, subnetting mastery, UDP/TCP, TCP internals (windows, congestion control, states), routing/OSPF/BGP, NAT, DNS + DNS deep dive, TLS/DTLS/HTTP/QUIC, the troubleshooting toolbelt, security fundamentals & zero trust                                                 |
| 2 · Rust for Systems       | R01–R05 (5)           | Ownership & types, idiomatic Rust (type-driven design, traits, error craft, zero-cost habits), async/Tokio, network programming, professional tooling (workspaces, testing, CI gates, tracing)                                                                                                                                      |
| 3 · Tunnel Engineering     | T01–T04 (4)           | TUN/TAP packet I/O, Noise & AEAD crypto, WireGuard/boringtun in practice, NAT traversal (STUN/ICE/DERP)                                                                                                                                                                                                                             |
| 4 · Shipping a Real Client | S01–S03 + P01–P04 (7) | Cross-platform engineering; platform internals in depth — Apple Network Extension (packet tunnel, content filters, transparent proxy), Windows (wintun, WFP, routing/NRPT), Linux & Android (tun offloads, policy routing, VpnService); proxies, PAC & split-tunnel strategy; architecture of a production client; capstone roadmap |

Track 1 is designed to take a beginner to certifiable-professional territory
(CompTIA Network+ / CCNA-level concepts), and every module cross-references the
engineering tracks so the fundamentals land as _reasons_, not trivia.

Interactive labs: sequence ordering, code fill-in, an infinite CIDR-subnetting trainer,
term-matching drills, an infinite well-known-ports drill, and quizzes with explanations
(70% to pass). Progress is tracked per lesson/lab/quiz.

**Search:** full-text search across every lesson, lab, and quiz — open with the header
button, `/`, or `Ctrl/Cmd-K`. Results are ranked (title > module > body), snippeted with
match highlighting, fully keyboard-navigable (arrows/Enter/Esc), and jump straight to
the right module _and_ tab. The index is built at load from the same data the views
render, so it can never drift from the content.

**Review mode:** every quiz question you miss becomes a spaced-repetition card on a
Leitner schedule (due immediately, then 1 → 3 → 7 → 21 days as you answer correctly;
a wrong answer sends the card back to the start; five consecutive rights graduate it).
The header's REVIEW button shows a due-count badge, and the deck syncs across devices —
the server-side merge keeps the more demanding version of each card, so cramming on
one device never erases a miss recorded on another.

## Stack

- **Client** — TypeScript, React 19 + Vite 8, single hand-rolled design system (no UI framework); accessible by construction — skip-to-content link, main landmark, aria-labeled interactive exercises, quiz feedback and lab verdicts announced via live regions, `prefers-reduced-motion` honored (animations disabled and the hero strip rests at readable contrast); light/dark/system theming with OS-preference tracking, persisted per device, flash-free via a pre-hydration snippet
- **Server** — TypeScript on Bun (run directly, no build step) + Express 5, SQLite via the built-in `bun:sqlite` (runtime-adaptive: falls back to `node:sqlite` under Node ≥ 22.5 — zero native deps either way)
- **Durability** — versioned schema migrations via `PRAGMA user_version` (each migration transactional, applied once, in order; pre-migration databases are detected and adopted in place). Multi-statement auth sequences (OAuth create-and-link, password reset/change with session revocation) run inside transactions, so a crash can never leave a half-applied state. Online backups via SQLite's backup API — consistent snapshots while serving traffic
- **Tooling** — strict TypeScript end to end (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) type-checked with `tsc`; linting and formatting by Oxc's [oxlint](https://oxc.rs/docs/guide/usage/linter) and oxfmt
- **Operations** — structured JSON logging via pino (request IDs honored from `x-request-id` and echoed back, per-request latency/status lines, secrets redacted, health probes at debug); liveness + readiness health endpoints with a real DB probe; graceful shutdown on SIGTERM/SIGINT that drains HTTP, flips readiness to 503, checkpoints the SQLite WAL, and closes the DB — with a hard timeout guard
- **Auth** — email/password (bcryptjs) plus social login via [Arctic](https://arcticjs.dev) (Google with PKCE, GitHub). OAuth identities auto-link to an existing account with the same verified email, so password and social sign-in coexist on one account
- **Email verification** — new password accounts get a 24-hour single-use verification link (soft gate: the app stays usable, a banner offers resend, rate-limited 3/min). OAuth sign-ins are auto-verified since Google/GitHub attest the email — which is also what makes auto-linking safe. Completing a password reset marks the mailbox verified too, and existing accounts are grandfathered as verified on migration
- **Sessions** — server-side sessions (Lucia-style): opaque 256-bit bearer secrets, only their SHA-256 stored, 30-day sliding expiry, per-device tracking. Enables real logout (revocation), sign-out-everywhere, an active-session list, password change (revokes other sessions), a forgot/reset flow (single-use 30-min tokens, all sessions revoked on reset, enumeration-safe responses), and account deletion (cascades sessions, OAuth links, and progress)
- **Progress** — guest mode stores progress in `localStorage`; signed-in progress syncs
  to the server (debounced ~800 ms) and is merged on login (lesson/lab unions, best quiz
  score wins), so nothing is ever lost switching devices or signing in late

## Run it (dev)

Requires [Bun](https://bun.sh) ≥ 1.2.

This is a Bun-workspaces monorepo (`client` + `server`) — one install, one `bun.lock`.

```sh
bun install     # installs everything (root, client, server)
bun run dev     # API on :4000 + UI on :5173 (proxies /api → :4000), both in one terminal
```

Open http://localhost:5173. (`bun run dev:server` / `bun run dev:client` still run each side alone; the server auto-restarts on change via `bun --watch`.)

Other root scripts: `bun test` (server API tests + client unit tests, one command across both workspaces), `bun run lint` / `lint:fix` (oxlint), `bun run format` / `format:check` (oxfmt), `bun run typecheck` (tsc, both workspaces), `bun run check` (all three), `bun run clean`.

## Run it (production)

```sh
bun install
bun run build                       # builds client → client/dist
bun run start
```

The server detects `client/dist` and serves the SPA and the API together on :4000.

Or with Docker:

```sh
docker compose up --build
```

## API

| Method | Path                                 | Body                              | Notes                                                                                                      |
| ------ | ------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/register`                 | `{email, password, displayName?}` | password ≥ 8 chars; returns `{token, user}`                                                                |
| POST   | `/api/auth/login`                    | `{email, password}`               | returns `{token, user}`                                                                                    |
| GET    | `/api/me`                            | —                                 | bearer auth                                                                                                |
| GET    | `/api/health/live`                   | —                                 | liveness: process is up                                                                                    |
| GET    | `/api/health/ready`                  | —                                 | readiness: DB probe passes; 503 while draining or if the DB fails                                          |
| GET    | `/api/auth/providers`                | —                                 | lists configured social providers                                                                          |
| GET    | `/api/auth/{google,github}`          | —                                 | redirects to the provider (state + PKCE)                                                                   |
| GET    | `/api/auth/{google,github}/callback` | —                                 | validates, links/creates the user, creates a session, returns to the app                                   |
| POST   | `/api/auth/verify-email`             | `{token}`                         | consumes a verification link (single-use, 24 h)                                                            |
| POST   | `/api/auth/resend-verification`      | —                                 | bearer auth; re-sends the link (3/min)                                                                     |
| POST   | `/api/auth/logout`                   | —                                 | revokes the current session                                                                                |
| POST   | `/api/auth/logout-all`               | —                                 | revokes every session for the account                                                                      |
| DELETE | `/api/auth/sessions/{handle}`        | —                                 | revokes one session by its opaque handle (owner-scoped)                                                    |
| GET    | `/api/auth/sessions`                 | —                                 | lists active sessions with parsed device names ("Chrome on Windows"), timestamps, and revocation handles   |
| POST   | `/api/auth/change-password`          | `{currentPassword, newPassword}`  | updates hash, revokes all other sessions                                                                   |
| POST   | `/api/auth/forgot-password`          | `{email}`                         | sends a reset link (dev transport logs it); identical response for unknown emails                          |
| POST   | `/api/auth/reset-password`           | `{token, newPassword}`            | single-use token, revokes all sessions                                                                     |
| DELETE | `/api/account`                       | `{password, confirm:"DELETE"}`    | permanent deletion, FK cascades                                                                            |
| POST   | `/api/admin/backup`                  | —                                 | `Authorization: Bearer $BACKUP_TOKEN`; writes a consistent snapshot to `DATA_DIR/backups`, keeps newest 10 |
| GET    | `/api/progress`                      | —                                 | bearer auth; `{data, updatedAt}`                                                                           |
| PUT    | `/api/progress`                      | `{data}`                          | bearer auth; server sanitizes + merges, returns merged                                                     |

Auth routes are rate-limited (in-memory). Progress payloads are validated and clamped
server-side; the merge is monotonic (you can't lose completed work by racing devices).

## Environment

| Var                                         | Default                 | Meaning                                                                                                         |
| ------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `PORT`                                      | `4000`                  | server port                                                                                                     |
| `DATA_DIR`                                  | `server/data`           | where `tunnelcraft.db` lives                                                                                    |
| `BASE_URL`                                  | `http://localhost:4000` | public origin for OAuth redirect URIs and reset links                                                           |
| `SMTP_HOST` (+ friends)                     | unset                   | reset emails log to the server console until a real transport is wired in `server/src/mail.ts`                  |
| `LOG_LEVEL`                                 | `info`                  | pino level (`debug` shows health probes and more); pipe through `npx pino-pretty` for human-readable dev output |
| `SHUTDOWN_TIMEOUT_MS`                       | `10000`                 | hard deadline for graceful drain before forced exit                                                             |
| `BACKUP_TOKEN`                              | unset                   | enables `POST /api/admin/backup` when set; unset disables the endpoint entirely                                 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | unset                   | enables "Continue with Google" (redirect URI: `BASE_URL/api/auth/google/callback`)                              |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | unset                   | enables "Continue with GitHub" (callback URL: `BASE_URL/api/auth/github/callback`)                              |

Social login is opt-in per provider: buttons appear automatically on the sign-in screen
for whichever providers have credentials set (`GET /api/auth/providers` reports them).
Create the apps at console.cloud.google.com and github.com/settings/developers, register
the callback URLs above, and set the env vars — no code changes needed.

## Schema changes & backups

**Adding a migration:** append an entry to `MIGRATIONS` in `server/src/db.ts` with the
next version number — never edit an existing entry, since deployed databases have
already applied it. Each migration runs in a transaction and stamps
`PRAGMA user_version`; fresh databases replay the whole history, existing ones apply
only what's new, and the startup log reports the resulting `schemaVersion`.

**Backups:** set `BACKUP_TOKEN` and hit `POST /api/admin/backup` from cron or a
systemd timer — it uses SQLite's online backup API, so snapshots are consistent even
under live writes (never copy the raw `.db` file of a running server; WAL state can
tear). Snapshots land in `DATA_DIR/backups/` with the newest 10 kept. Restore =
stop the server, replace `tunnelcraft.db` with a snapshot, start (migrations bring an
older snapshot forward automatically). Verify a snapshot anytime with
`sqlite3 backup.db "PRAGMA integrity_check"`. For off-host protection, sync the
backups directory to object storage, or point [Litestream](https://litestream.io) at
the live database for continuous replication.

## Layout

```
client/
  src/
    curriculum/     core.ts + net-a..d.ts, rust-idiom.ts, rust-extra.ts, platform-a/b.ts, tracks.ts (+ types.ts)
    components/     exercises.tsx (order/blank/cidr/checklist/quiz), extra.tsx (match, port drill), auth.tsx
    lib/            render.tsx (markdown-ish blocks, code highlighting, layer glyphs), api.ts
    App.tsx         routing, track home, module view, progress sync
server/
  src/db.ts         schema + prepared statements (swap in better-sqlite3 here if preferred)
  src/index.ts      auth, progress, static serving
```

Adding a module = one object in a curriculum file + its id in `tracks.ts`. The data
shape is validated by the smoke test pattern in the repo history: lessons are blocks
(`p`/`h`/`ul`/`code`/`note`/`tbl`), exercises are typed
(`order`/`blank`/`cidr`/`match`/`ports`/`check`), quizzes need `a` in range and a `why`.
