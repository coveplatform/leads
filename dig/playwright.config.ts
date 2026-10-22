import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

const port = 3077;
const baseURL = `http://127.0.0.1:${port}`;
// The cloud dev container ships Chromium at this path; CI installs its own.
const localChromium = "/opt/pw-browsers/chromium";
const executablePath = fs.existsSync(localChromium) ? localChromium : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...devices["Pixel 7"],
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `${baseURL}/api/v1/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { DIG_DB: "memory", DIG_PROVIDER_NETWORK: "0", DIG_AUTO_SEED: "1" },
  },
});
