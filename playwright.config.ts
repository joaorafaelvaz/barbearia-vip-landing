import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// Chromium pré-instalado no ambiente de CI/cloud; localmente o Playwright usa o próprio download.
const preinstalled = [process.env.CHROME_PATH, "/opt/pw-browsers/chromium/chrome"].find((p) => p && existsSync(p));

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "pt-BR",
    ...(preinstalled ? { launchOptions: { executablePath: preinstalled } } : {}),
  },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
