import { defineConfig } from "@playwright/test";

const port = 4315;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./client/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  timeout: 20_000,
  use: {
    baseURL,
    browserName: "chromium",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `env PORT=${port} DATA_DIR=./test-results/server-data NODE_ENV=production BASE_URL=${baseURL} LOG_LEVEL=silent bun run start`,
    url: `${baseURL}/api/health/ready`,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
