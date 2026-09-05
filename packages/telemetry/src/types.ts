export type OperationalPrimitive = string | number | boolean | null;

export type OperationalValue =
  | OperationalPrimitive
  | OperationalValue[]
  | { [key: string]: OperationalValue };

/**
 * Operational metadata only. Do not include end-user identifiers, contact data,
 * credentials, payment data, message contents, or other personal information.
 */
export type OperationalData = Record<string, OperationalValue>;

export interface TelemetryEvent {
  type: string;
  at?: string;
  projectRef?: string;
  level?: string;
  payload?: OperationalData;
}

export interface Heartbeat {
  source: string;
  status?: "ok" | "degraded" | "failing";
  at?: string;
  meta?: OperationalData;
}

export interface UsageRecord {
  metric: string;
  quantity: number;
  at: string;
  unit?: string;
  dimensions?: Record<string, string | number | boolean>;
}

export interface SubmissionResult {
  accepted: number;
  duplicates: number;
  disabled: boolean;
}

export interface BatchOptions {
  /** Records sent in one request. Must be between 1 and the API limit of 500. */
  maxSize?: number | undefined;
  /** Maximum time a record waits for a batch before it is sent. */
  flushIntervalMs?: number | undefined;
}

export interface RetryOptions {
  /** Total attempts, including the initial request. */
  maxAttempts?: number | undefined;
  initialDelayMs?: number | undefined;
  maxDelayMs?: number | undefined;
}

export interface TelemetryOptions {
  /** Telemetry token. Defaults to `POKANOP_TOKEN`. */
  token?: string | undefined;
  /** API root ending in `/api/v1`. Defaults to Pokanop Cloud. */
  apiUrl?: string | undefined;
  /** Explicit local switch. `POKANOP_TELEMETRY=off` always takes precedence. */
  enabled?: boolean | undefined;
  batch?: BatchOptions | undefined;
  retry?: RetryOptions | undefined;
  /** Custom Fetch implementation, useful for runtimes without global Fetch. */
  fetch?: typeof globalThis.fetch | undefined;
}

export interface TelemetryClient {
  readonly enabled: boolean;
  heartbeat(heartbeat: Heartbeat): Promise<SubmissionResult>;
  event(event: TelemetryEvent): Promise<SubmissionResult>;
  usage(record: UsageRecord): Promise<SubmissionResult>;
  /** Immediately sends all queued event and usage records. */
  flush(): Promise<void>;
  /** Flushes queued records and prevents new submissions. */
  close(): Promise<void>;
}
