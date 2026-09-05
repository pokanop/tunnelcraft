import { describe, expect, it, mock } from "bun:test";
import type { TelemetryClient } from "@pokanop/telemetry";
import { startTunnelcraftTelemetry, HEARTBEAT_INTERVAL_MS } from "../src/telemetry";
function fakeClient(enabled = true): TelemetryClient {
  return {
    enabled,
    heartbeat: mock().mockResolvedValue({ accepted: 1, duplicates: 0, disabled: !enabled }),
    event: mock().mockResolvedValue({ accepted: 1, duplicates: 0, disabled: !enabled }),
    usage: mock(),
    flush: mock(),
    close: mock().mockResolvedValue(undefined),
  };
}

describe("Tunnelcraft telemetry lifecycle", () => {
  it("does no work when the telemetry client is disabled", async () => {
    const client = fakeClient(false);
    const schedule = mock();
    const lifecycle = startTunnelcraftTelemetry({ client, release: "abc123", schedule });

    expect(lifecycle.enabled).toBe(false);
    expect(client.heartbeat).not.toHaveBeenCalled();
    expect(client.event).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    await lifecycle.close();
    expect(client.close).not.toHaveBeenCalled();
  });

  it("emits boot and periodic operational signals, then closes once", async () => {
    const client = fakeClient();
    const interval = { unref: mock() };
    let scheduledHeartbeat: (() => void) | undefined;
    const schedule = mock((callback: () => void) => {
      scheduledHeartbeat = callback;
      return interval;
    });
    const clearSchedule = mock();

    const lifecycle = startTunnelcraftTelemetry({
      client,
      release: "abc123",
      schedule,
      clearSchedule,
    });

    expect(lifecycle.enabled).toBe(true);
    expect(client.heartbeat).toHaveBeenCalledWith({
      source: "tunnelcraft-server",
      status: "ok",
      meta: { release: "abc123" },
    });
    expect(client.event).toHaveBeenCalledTimes(1);
    expect(client.event).toHaveBeenCalledWith({
      type: "server.started",
      level: "info",
      at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      payload: { release: "abc123" },
    });
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), HEARTBEAT_INTERVAL_MS);
    expect(interval.unref).toHaveBeenCalledTimes(1);

    scheduledHeartbeat?.();
    expect(client.heartbeat).toHaveBeenCalledTimes(2);

    await lifecycle.close();
    await lifecycle.close();
    expect(clearSchedule).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledTimes(1);
  });
});
