import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.DIG_E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 860 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium", isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 240_000,
    env: { DIG_ALLOW_LOCALHOST_EMBED: "1" },
  },
});
