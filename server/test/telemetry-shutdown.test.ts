import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

for (const hanging of [false, true]) {
  test(
    hanging
      ? "SIGTERM exits cleanly when ingestion hangs"
      : "SIGTERM flushes the boot event before the real server exits",
    async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "tunnelcraft-telemetry-"));
      const preload = path.join(dir, "transport.ts");
      await writeFile(
        preload,
        `
    globalThis.fetch = async (url, init) => {
      if (!String(url).startsWith("https://pokanop.com/api/v1/")) throw new Error("Unexpected destination");
      console.log("TEST_INGEST " + String(url) + " " + init.body);
      ${hanging ? "return new Promise(() => {});" : ""}
      return Response.json({ accepted: 1, duplicates: 0 }, { status: 202 });
    };
  `
      );
      const child = Bun.spawn([process.execPath, "--preload", preload, "server/src/index.ts"], {
        cwd: path.resolve(import.meta.dir, "../.."),
        env: {
          ...process.env,
          PORT: "0",
          SHUTDOWN_TIMEOUT_MS: "3500",
          DATA_DIR: dir,
          POKANOP_TOKEN: "test-only",
          POKANOP_TELEMETRY: "",
          POKANOP_RELEASE: "shutdown-test",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      let output = "";
      let signalled = false;
      const deadline = setTimeout(() => child.kill("SIGKILL"), 5000);
      try {
        for await (const chunk of child.stdout) {
          output += new TextDecoder().decode(chunk);
          if (!signalled && output.includes("tunnelcraft server listening")) {
            signalled = true;
            child.kill("SIGTERM");
          }
        }
        expect(await child.exited).toBe(0);
        // Heartbeats bypass the queue: this proves issuance, not delivery or close() waiting.
        expect(output).toContain("TEST_INGEST https://pokanop.com/api/v1/heartbeats");
        expect(output).toContain("TEST_INGEST https://pokanop.com/api/v1/events");
        expect(output).toContain('"type":"server.started"');
        expect(output).toContain('"release":"shutdown-test"');
        if (hanging) {
          expect(output).toContain("flush exceeded 2000ms");
          expect(output).not.toContain("forcing exit");
        } else expect(output).toContain("Pokanop telemetry event accepted");
        expect(output).toContain("shutdown: db checkpointed and closed");
        expect(output).toContain("shutdown: complete");
      } finally {
        clearTimeout(deadline);
        child.kill();
        await child.exited;
        await rm(dir, { recursive: true, force: true });
      }
    }
  );
}
