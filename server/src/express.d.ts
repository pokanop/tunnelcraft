/* Request augmentation (the passport/pino-http pattern): fields our middleware
   attaches to every Express request.
   - `id` and `log` are set unconditionally by requestLogger() in logger.ts.
   - `user` and `sessionId` are only present behind the auth middleware from
     sessions.ts, so they stay optional; authed handlers unwrap them via the
     `authed()` helper in index.ts. */
import type { Logger } from "pino";
import type { PublicUserRow } from "./db";

declare global {
  namespace Express {
    interface Request {
      /** Request ID (from x-request-id or freshly minted). Set by requestLogger(). */
      id: string;
      /** Per-request child logger. Set by requestLogger(). */
      log: Logger;
      /** Authenticated user — set by the auth middleware (makeAuth). */
      user?: PublicUserRow;
      /** Hashed session id backing this request — set by the auth middleware. */
      sessionId?: string;
    }
  }
}
