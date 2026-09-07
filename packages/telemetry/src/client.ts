import {
  TelemetryApiError,
  TelemetryConfigurationError,
  TelemetryError,
  TelemetryNetworkError,
  TelemetryValidationError,
} from "./errors";
import type {
  Heartbeat,
  OperationalData,
  OperationalValue,
  SubmissionResult,
  TelemetryClient,
  TelemetryEvent,
  TelemetryOptions,
  UsageRecord,
} from "./types";

const DEFAULT_API_URL = "https://pokanop.com/api/v1";
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_FLUSH_INTERVAL_MS = 1_000;
const API_BATCH_LIMIT = 500;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_INITIAL_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 5_000;
const TIMESTAMP_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const PII_KEYS = new Set([
  "address",
  "cardnumber",
  "creditcard",
  "dateofbirth",
  "dob",
  "email",
  "emailaddress",
  "firstname",
  "fullname",
  "ipaddress",
  "lastname",
  "password",
  "passwd",
  "phone",
  "phonenumber",
  "postaladdress",
  "postalcode",
  "socialsecuritynumber",
  "ssn",
  "streetaddress",
  "zipcode",
]);

interface Environment {
  POKANOP_TOKEN?: string;
  POKANOP_TELEMETRY?: string;
}

interface RetryConfiguration {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

interface Deferred<T> {
  resolve(value: T): void;
  reject(reason: unknown): void;
}

interface QueueEntry<T> extends Deferred<SubmissionResult> {
  value: T;
}

type Endpoint = "events" | "heartbeats" | "usage";

function environment(): Environment {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  const env = runtime.process?.env;
  return {
    ...(env?.POKANOP_TOKEN === undefined ? {} : { POKANOP_TOKEN: env.POKANOP_TOKEN }),
    ...(env?.POKANOP_TELEMETRY === undefined ? {} : { POKANOP_TELEMETRY: env.POKANOP_TELEMETRY }),
  };
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function validateOperationalValue(
  value: OperationalValue,
  path: string,
  ancestors: Set<object>
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TelemetryValidationError(`${path} must contain only finite numbers`);
    }
    return;
  }
  if (ancestors.has(value)) {
    throw new TelemetryValidationError(`${path} must not contain circular references`);
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      validateOperationalValue(item, `${path}[${index}]`, ancestors);
    });
  } else {
    for (const [key, item] of Object.entries(value)) {
      const itemPath = `${path}.${key}`;
      if (PII_KEYS.has(normalizedKey(key))) {
        throw new TelemetryValidationError(
          `${itemPath} is an end-user PII field and cannot be sent as telemetry`
        );
      }
      validateOperationalValue(item, itemPath, ancestors);
    }
  }
  ancestors.delete(value);
}

function validateOperationalData(value: OperationalData | undefined, path: string): void {
  if (value !== undefined) validateOperationalValue(value, path, new Set());
}

function requireShortName(value: string, path: string, maxLength: number): void {
  if (value.trim().length === 0 || value.length > maxLength) {
    throw new TelemetryValidationError(`${path} must contain 1-${maxLength} characters`);
  }
}

function requireTimestamp(value: string | undefined, path: string, required = false): void {
  if (value === undefined) {
    if (required) throw new TelemetryValidationError(`${path} is required`);
    return;
  }
  if (!TIMESTAMP_WITH_OFFSET.test(value) || Number.isNaN(Date.parse(value))) {
    throw new TelemetryValidationError(`${path} must be an ISO 8601 timestamp`);
  }
}

function validateEvent(event: TelemetryEvent): void {
  requireShortName(event.type, "event.type", 160);
  if (event.projectRef !== undefined) requireShortName(event.projectRef, "event.projectRef", 160);
  if (event.level !== undefined) requireShortName(event.level, "event.level", 40);
  requireTimestamp(event.at, "event.at");
  validateOperationalData(event.payload, "event.payload");
}

function validateHeartbeat(heartbeat: Heartbeat): void {
  requireShortName(heartbeat.source, "heartbeat.source", 160);
  if (heartbeat.status !== undefined && !["ok", "degraded", "failing"].includes(heartbeat.status)) {
    throw new TelemetryValidationError("heartbeat.status must be ok, degraded, or failing");
  }
  requireTimestamp(heartbeat.at, "heartbeat.at");
  validateOperationalData(heartbeat.meta, "heartbeat.meta");
}

function validateUsage(record: UsageRecord): void {
  requireShortName(record.metric, "usage.metric", 160);
  requireTimestamp(record.at, "usage.at", true);
  if (!Number.isFinite(record.quantity)) {
    throw new TelemetryValidationError("usage.quantity must be a finite number");
  }
  if (record.unit !== undefined) requireShortName(record.unit, "usage.unit", 80);
  for (const [key, value] of Object.entries(record.dimensions ?? {})) {
    if (typeof value === "string" && value.length > 500) {
      throw new TelemetryValidationError(`usage.dimensions.${key} must be at most 500 characters`);
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TelemetryValidationError(`usage.dimensions.${key} must be a finite number`);
    }
  }
}

function positiveInteger(value: number, name: string, maximum?: number): number {
  if (!Number.isInteger(value) || value < 1 || (maximum !== undefined && value > maximum)) {
    const range = maximum === undefined ? "a positive integer" : `between 1 and ${maximum}`;
    throw new TelemetryConfigurationError(`${name} must be ${range}`);
  }
  return value;
}

function nonNegativeNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TelemetryConfigurationError(`${name} must be a non-negative finite number`);
  }
  return value;
}

function idempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `telemetry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function apiError(response: Response): Promise<TelemetryApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const envelope = body as {
    error?: { code?: string; message?: string; correlationId?: string; details?: unknown };
  };
  const error = envelope?.error;
  return new TelemetryApiError(
    error?.message ?? `Telemetry API returned HTTP ${response.status}`,
    response.status,
    {
      ...(error?.code === undefined ? {} : { code: error.code }),
      ...(error?.correlationId === undefined ? {} : { correlationId: error.correlationId }),
      ...(error?.details === undefined ? {} : { details: error.details }),
    }
  );
}

async function submissionResult(response: Response): Promise<SubmissionResult> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new TelemetryApiError(
      "Telemetry API returned an invalid success response",
      response.status,
      {
        code: "INVALID_RESPONSE",
      }
    );
  }
  const result = body as { accepted?: unknown; duplicates?: unknown };
  if (
    !result ||
    typeof result !== "object" ||
    !Number.isInteger(result.accepted) ||
    !Number.isInteger(result.duplicates) ||
    (result.accepted as number) < 0 ||
    (result.duplicates as number) < 0
  ) {
    throw new TelemetryApiError(
      "Telemetry API returned an invalid success response",
      response.status,
      {
        code: "INVALID_RESPONSE",
      }
    );
  }
  return {
    accepted: result.accepted as number,
    duplicates: result.duplicates as number,
    disabled: false,
  };
}

class BatchQueue<T> {
  private readonly pending: Array<QueueEntry<T>> = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flushing: Promise<void> | undefined;

  constructor(
    private readonly maxSize: number,
    private readonly flushIntervalMs: number,
    private readonly send: (records: T[]) => Promise<SubmissionResult>
  ) {}

  enqueue(value: T): Promise<SubmissionResult> {
    const promise = new Promise<SubmissionResult>((resolve, reject) => {
      this.pending.push({ value, resolve, reject });
    });
    if (this.pending.length >= this.maxSize) {
      void this.flush().catch(() => undefined);
    } else {
      this.schedule();
    }
    return promise;
  }

  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.clearTimer();
    this.flushing = this.drain();
    try {
      await this.flushing;
    } finally {
      this.flushing = undefined;
      if (this.pending.length > 0) this.schedule();
    }
  }

  private async drain(): Promise<void> {
    let firstError: unknown;
    while (this.pending.length > 0) {
      const entries = this.pending.splice(0, this.maxSize);
      try {
        const result = await this.send(entries.map(({ value }) => value));
        for (const entry of entries) entry.resolve(result);
      } catch (error) {
        firstError ??= error;
        for (const entry of entries) entry.reject(error);
      }
    }
    if (firstError !== undefined) throw firstError;
  }

  private schedule(): void {
    if (this.timer !== undefined || this.flushing || this.pending.length === 0) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush().catch(() => undefined);
    }, this.flushIntervalMs);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  private clearTimer(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}

export class Telemetry implements TelemetryClient {
  readonly enabled: boolean;
  private readonly token: string | undefined;
  private readonly apiUrl: URL;
  private readonly fetchImplementation: typeof globalThis.fetch | undefined;
  private readonly retry: RetryConfiguration;
  private readonly events: BatchQueue<TelemetryEvent>;
  private readonly usageRecords: BatchQueue<UsageRecord>;
  private closed = false;

  constructor(options: TelemetryOptions = {}) {
    const env = environment();
    this.token = options.token?.trim() || env.POKANOP_TOKEN?.trim() || undefined;
    this.enabled =
      options.enabled !== false &&
      env.POKANOP_TELEMETRY?.trim().toLowerCase() !== "off" &&
      !!this.token;
    const apiUrl = options.apiUrl ?? DEFAULT_API_URL;
    try {
      this.apiUrl = new URL(apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`);
    } catch (error) {
      throw new TelemetryConfigurationError(`apiUrl is invalid: ${String(error)}`);
    }
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    if (this.enabled && !this.fetchImplementation) {
      throw new TelemetryConfigurationError(
        "A Fetch implementation is required when telemetry is enabled"
      );
    }

    const maxSize = positiveInteger(
      options.batch?.maxSize ?? DEFAULT_BATCH_SIZE,
      "batch.maxSize",
      API_BATCH_LIMIT
    );
    const flushIntervalMs = nonNegativeNumber(
      options.batch?.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
      "batch.flushIntervalMs"
    );
    const maxAttempts = positiveInteger(
      options.retry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      "retry.maxAttempts"
    );
    const initialDelayMs = nonNegativeNumber(
      options.retry?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS,
      "retry.initialDelayMs"
    );
    const maxDelayMs = nonNegativeNumber(
      options.retry?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
      "retry.maxDelayMs"
    );
    if (maxDelayMs < initialDelayMs) {
      throw new TelemetryConfigurationError(
        "retry.maxDelayMs must be at least retry.initialDelayMs"
      );
    }
    this.retry = { maxAttempts, initialDelayMs, maxDelayMs };
    this.events = new BatchQueue(maxSize, flushIntervalMs, (records) =>
      this.submit("events", { events: records })
    );
    this.usageRecords = new BatchQueue(maxSize, flushIntervalMs, (records) =>
      this.submit("usage", { records })
    );
  }

  heartbeat(heartbeat: Heartbeat): Promise<SubmissionResult> {
    this.assertOpen();
    if (!this.enabled) return Promise.resolve(this.disabledResult());
    validateHeartbeat(heartbeat);
    return this.submit("heartbeats", heartbeat);
  }

  event(event: TelemetryEvent): Promise<SubmissionResult> {
    this.assertOpen();
    if (!this.enabled) return Promise.resolve(this.disabledResult());
    validateEvent(event);
    return this.events.enqueue(event);
  }

  usage(record: UsageRecord): Promise<SubmissionResult> {
    this.assertOpen();
    if (!this.enabled) return Promise.resolve(this.disabledResult());
    validateUsage(record);
    return this.usageRecords.enqueue(record);
  }

  async flush(): Promise<void> {
    await Promise.all([this.events.flush(), this.usageRecords.flush()]);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.flush();
  }

  private assertOpen(): void {
    if (this.closed) throw new TelemetryError("Telemetry client is closed");
  }

  private disabledResult(): SubmissionResult {
    return { accepted: 0, duplicates: 0, disabled: true };
  }

  private async submit(endpoint: Endpoint, body: unknown): Promise<SubmissionResult> {
    if (!this.fetchImplementation || !this.token) return this.disabledResult();
    const key = idempotencyKey();
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImplementation(new URL(endpoint, this.apiUrl), {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${this.token}`,
            "content-type": "application/json",
            "idempotency-key": key,
          },
          body: JSON.stringify(body),
        });
      } catch (error) {
        lastError = new TelemetryNetworkError("Telemetry request failed", error);
        if (attempt === this.retry.maxAttempts) throw lastError;
        await delay(this.retryDelay(attempt));
        continue;
      }

      if (response.ok) return submissionResult(response);

      lastError = await apiError(response);
      if (!isRetryableStatus(response.status) || attempt === this.retry.maxAttempts) {
        throw lastError;
      }
      const serverDelay = retryAfterMs(response);
      await delay(Math.min(this.retry.maxDelayMs, serverDelay ?? this.retryDelay(attempt)));
    }

    throw lastError ?? new TelemetryNetworkError("Telemetry request failed", undefined);
  }

  private retryDelay(attempt: number): number {
    return Math.min(this.retry.maxDelayMs, this.retry.initialDelayMs * 2 ** (attempt - 1));
  }
}

export function createTelemetry(options: TelemetryOptions = {}): TelemetryClient {
  return new Telemetry(options);
}
