import { defineConfig, devices } from "@playwright/test";

// E2E runs against the static export served locally, or against a live URL via E2E_BASE_URL.
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 2,
  use: { baseURL, trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx serve out -l 4173 --no-clipboard", url: "http://127.0.0.1:4173", reuseExistingServer: true, timeout: 60_000 },
});
