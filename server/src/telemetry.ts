import { log } from "./logger";
import { createTelemetry, type SubmissionResult, type TelemetryClient } from "@pokanop/telemetry";

const POKANOP_API_URL = "https://pokanop.com/api/v1";
const TELEMETRY_SOURCE = "tunnelcraft-server";
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

interface IntervalHandle {
  unref?: () => void;
}

interface TelemetryLifecycleOptions {
  token?: string;
  enabled?: boolean;
  release: string;
  client?: TelemetryClient;
  schedule?: (callback: () => void, milliseconds: number) => IntervalHandle;
  clearSchedule?: (handle: IntervalHandle) => void;
}

export interface TelemetryLifecycle {
  readonly enabled: boolean;
  close(): Promise<void>;
}

function logSubmission(kind: "event" | "heartbeat", result: SubmissionResult): void {
  if (result.disabled) return;
  log.info(
    { accepted: result.accepted, duplicates: result.duplicates, source: TELEMETRY_SOURCE },
    `Pokanop telemetry ${kind} accepted`
  );
}

function logFailure(kind: "close" | "event" | "heartbeat", error: unknown): void {
  log.warn(
    { err: error instanceof Error ? error.message : String(error), source: TELEMETRY_SOURCE },
    `Pokanop telemetry ${kind} failed`
  );
}

/**
 * Starts operational-only reporting. No token means no requests, timers, or queued work.
 * Payloads are deliberately limited to service identity and release state; no request,
 * account, record, or health data is available to this module.
 */
export function startTunnelcraftTelemetry(options: TelemetryLifecycleOptions): TelemetryLifecycle {
  const client =
    options.client ??
    createTelemetry({
      token: options.token,
      enabled: options.enabled,
      apiUrl: POKANOP_API_URL,
    });

  if (!client.enabled) {
    return {
      enabled: false,
      close: async () => undefined,
    };
  }

  const heartbeat = () => {
    void client
      .heartbeat({
        source: TELEMETRY_SOURCE,
        status: "ok",
        meta: { release: options.release },
      })
      .then((result) => logSubmission("heartbeat", result))
      .catch((error: unknown) => logFailure("heartbeat", error));
  };

  heartbeat();
  void client
    .event({
      type: "server.started",
      level: "info",
      at: new Date().toISOString(),
      payload: { release: options.release },
    })
    .then((result) => logSubmission("event", result))
    .catch((error: unknown) => logFailure("event", error));

  const schedule =
    options.schedule ?? ((callback, milliseconds) => setInterval(callback, milliseconds));
  const clearSchedule =
    options.clearSchedule ??
    ((handle: IntervalHandle) => clearInterval(handle as ReturnType<typeof setInterval>));
  const heartbeatInterval = schedule(heartbeat, HEARTBEAT_INTERVAL_MS);
  heartbeatInterval.unref?.();

  let closePromise: Promise<void> | undefined;
  return {
    enabled: true,
    close() {
      closePromise ??= (async () => {
        clearSchedule(heartbeatInterval);
        try {
          await client.close();
        } catch (error) {
          logFailure("close", error);
        }
      })();
      return closePromise;
    },
  };
}
