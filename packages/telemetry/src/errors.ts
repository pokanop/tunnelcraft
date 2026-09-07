export class TelemetryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TelemetryError";
  }
}

export class TelemetryConfigurationError extends TelemetryError {
  constructor(message: string) {
    super(message);
    this.name = "TelemetryConfigurationError";
  }
}

export class TelemetryValidationError extends TelemetryError {
  constructor(message: string) {
    super(message);
    this.name = "TelemetryValidationError";
  }
}

export class TelemetryNetworkError extends TelemetryError {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "TelemetryNetworkError";
  }
}

export class TelemetryApiError extends TelemetryError {
  readonly status: number;
  readonly code?: string;
  readonly correlationId?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    options: { code?: string; correlationId?: string; details?: unknown } = {}
  ) {
    super(message);
    this.name = "TelemetryApiError";
    this.status = status;
    if (options.code !== undefined) this.code = options.code;
    if (options.correlationId !== undefined) this.correlationId = options.correlationId;
    if (options.details !== undefined) this.details = options.details;
  }
}
