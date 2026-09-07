import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import {
  createTelemetry,
  TelemetryApiError,
  TelemetryError,
  TelemetryValidationError,
} from "./index";

function accepted(count: number): Response {
  return Response.json({ accepted: count, duplicates: 0 }, { status: 202 });
}

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of ["POKANOP_TOKEN", "POKANOP_TELEMETRY"]) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  mock.restore();
});

describe("vendored @pokanop/telemetry client", () => {
  it("is a silent no-op without POKANOP_TOKEN", async () => {
    process.env.POKANOP_TOKEN = "";
    const fetchMock = mock();
    const telemetry = createTelemetry({ fetch: fetchMock as unknown as typeof fetch });

    expect(telemetry.enabled).toBe(false);
    await expect(telemetry.heartbeat({ source: "doctopus-server" })).resolves.toEqual({
      accepted: 0,
      duplicates: 0,
      disabled: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("honors the POKANOP_TELEMETRY=off kill switch", async () => {
    process.env.POKANOP_TELEMETRY = "off";
    const fetchMock = mock();
    const telemetry = createTelemetry({
      token: "pk_t_test",
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(telemetry.enabled).toBe(false);
    await expect(telemetry.event({ type: "deploy.completed" })).resolves.toMatchObject({
      disabled: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is a no-op when telemetry is explicitly disabled", async () => {
    const fetchMock = mock();
    const telemetry = createTelemetry({
      token: "pk_t_test",
      enabled: false,
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(telemetry.event({ type: "deploy.completed" })).resolves.toEqual({
      accepted: 0,
      duplicates: 0,
      disabled: true,
    });
    await expect(
      telemetry.heartbeat({ source: "doctopus-server", status: "ok" })
    ).resolves.toMatchObject({ disabled: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("batches events and reuses the idempotency key while retrying", async () => {
    const fetchMock = mock()
      .mockResolvedValueOnce(Response.json({ error: { message: "busy" } }, { status: 503 }))
      .mockResolvedValueOnce(accepted(2));
    const telemetry = createTelemetry({
      token: "pk_t_test",
      fetch: fetchMock as unknown as typeof fetch,
      batch: { maxSize: 2, flushIntervalMs: 60_000 },
      retry: { maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0 },
    });

    const first = telemetry.event({
      type: "deploy.started",
      payload: { revision: "abc123" },
    });
    const second = telemetry.event({ type: "deploy.completed", level: "info" });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { accepted: 2, duplicates: 0, disabled: false },
      { accepted: 2, duplicates: 0, disabled: false },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0] ?? [];
    const [secondUrl, secondInit] = fetchMock.mock.calls[1] ?? [];
    expect(String(firstUrl)).toBe("https://pokanop.com/api/v1/events");
    expect(String(secondUrl)).toBe("https://pokanop.com/api/v1/events");
    expect(JSON.parse(String(firstInit?.body))).toEqual({
      events: [
        { type: "deploy.started", payload: { revision: "abc123" } },
        { type: "deploy.completed", level: "info" },
      ],
    });
    expect(new Headers(firstInit?.headers).get("idempotency-key")).toBe(
      new Headers(secondInit?.headers).get("idempotency-key")
    );
  });

  it("flushes partial event and usage batches on demand", async () => {
    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { events?: unknown[]; records?: unknown[] };
      return accepted(body.events?.length ?? body.records?.length ?? 0);
    });
    const telemetry = createTelemetry({
      token: "pk_t_test",
      fetch: fetchMock as unknown as typeof fetch,
      batch: { flushIntervalMs: 60_000 },
    });

    const event = telemetry.event({ type: "release.ready" });
    const usage = telemetry.usage({
      metric: "ai.tokens",
      quantity: 42,
      at: "2026-07-20T12:00:00.000Z",
      dimensions: { model: "example", cached: false },
    });
    await telemetry.flush();

    await expect(event).resolves.toMatchObject({ accepted: 1, disabled: false });
    await expect(usage).resolves.toMatchObject({ accepted: 1, disabled: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("unrefs flush timers so buffered telemetry does not hold Node open", async () => {
    const unref = mock();
    const timeout = { unref } as unknown as ReturnType<typeof setTimeout>;
    const timeoutSpy = spyOn(globalThis, "setTimeout").mockReturnValue(timeout);
    const fetchMock = mock().mockResolvedValue(accepted(1));
    try {
      const telemetry = createTelemetry({
        token: "pk_t_test",
        fetch: fetchMock as unknown as typeof fetch,
      });
      const pending = telemetry.event({ type: "release.ready" });

      expect(unref).toHaveBeenCalledTimes(1);
      await telemetry.flush();
      await expect(pending).resolves.toMatchObject({ accepted: 1 });
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it("posts heartbeats to the production v1 API with scoped authorization", async () => {
    const fetchMock = mock().mockResolvedValue(accepted(1));
    const telemetry = createTelemetry({
      token: "pk_t_test",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(
      telemetry.heartbeat({
        source: "doctopus-server",
        status: "ok",
        meta: { release: "abc123" },
      })
    ).resolves.toEqual({ accepted: 1, duplicates: 0, disabled: false });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(String(url)).toBe("https://pokanop.com/api/v1/heartbeats");
    expect(headers.get("authorization")).toBe("Bearer pk_t_test");
    expect(headers.get("idempotency-key")).toBeTruthy();
  });

  it("rejects nested end-user fields before any request is queued", () => {
    const telemetry = createTelemetry({ token: "pk_t_test" });

    expect(() =>
      telemetry.event({
        type: "server.started",
        payload: { context: { email_address: "person@example.test" } },
      })
    ).toThrowError(TelemetryValidationError);
  });

  it("rejects timestamps that differ from the server casing contract", () => {
    const telemetry = createTelemetry({ token: "pk_t_test" });

    expect(() =>
      telemetry.event({ type: "job.completed", at: "2026-07-20t12:00:00.000z" })
    ).toThrowError(TelemetryValidationError);
  });

  it("surfaces structured API errors without retrying client failures", async () => {
    const fetchMock = mock().mockResolvedValue(
      Response.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Request body is invalid",
            correlationId: "request-1",
            details: { field: "source" },
          },
        },
        { status: 400 }
      )
    );
    const telemetry = createTelemetry({
      token: "pk_t_test",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const request = telemetry.heartbeat({ source: "doctopus-server" });
    await expect(request).rejects.toBeInstanceOf(TelemetryApiError);
    await expect(request).rejects.toMatchObject({
      name: "TelemetryApiError",
      status: 400,
      code: "INVALID_REQUEST",
      correlationId: "request-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("wraps malformed success responses in a structured API error", async () => {
    const fetchMock = mock().mockResolvedValue(new Response(null, { status: 202 }));
    const telemetry = createTelemetry({
      token: "pk_t_test",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(telemetry.heartbeat({ source: "doctopus-server" })).rejects.toMatchObject({
      name: "TelemetryApiError",
      status: 202,
      code: "INVALID_RESPONSE",
    });
  });

  it("flushes queued events during close and rejects later submissions", async () => {
    const fetchMock = mock().mockResolvedValue(accepted(1));
    const telemetry = createTelemetry({
      token: "pk_t_test",
      fetch: fetchMock as unknown as typeof fetch,
      batch: { flushIntervalMs: 60_000 },
    });
    const event = telemetry.event({ type: "server.started" });

    await telemetry.close();

    await expect(event).resolves.toMatchObject({ accepted: 1, disabled: false });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://pokanop.com/api/v1/events");
    expect(() => telemetry.event({ type: "server.stopped" })).toThrowError(TelemetryError);
  });
});
