/* Structured logging (pino): JSON lines to stdout, one child logger per subsystem.
   LOG_LEVEL env controls verbosity (default info; set debug for development).
   Pipe through `npx pino-pretty` locally if you want human-readable output. */
import pino from "pino";
import crypto from "node:crypto";

export const log = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "tunnelcraft" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    // never let secrets ride a log line, even by accident
    paths: ["req.headers.authorization", "password", "newPassword", "currentPassword", "token"],
    censor: "[redacted]",
  },
});

/* Request middleware: assigns a request ID, logs completion with latency.
   Health probes log at debug so they don't drown the stream. */
export function requestLogger() {
  return (req, res, next) => {
    req.id = req.headers["x-request-id"] || crypto.randomBytes(6).toString("hex");
    req.log = log.child({ reqId: req.id });
    res.setHeader("x-request-id", req.id);
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const level = req.path.startsWith("/api/health")
        ? "debug"
        : res.statusCode >= 500
          ? "error"
          : res.statusCode >= 400
            ? "warn"
            : "info";
      req.log[level](
        {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Math.round(ms * 10) / 10,
          ip: req.ip,
        },
        "request"
      );
    });
    next();
  };
}
