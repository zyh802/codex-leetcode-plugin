import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "node_modules/.cache/playwright-results",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4179",
    headless: true,
    launchOptions: { channel: "chrome" },
    viewport: { width: 1280, height: 780 },
  },
  webServer: {
    command: "node tests/e2e/fake-catalog-server.mjs",
    url: "http://127.0.0.1:4179/api/bootstrap",
    reuseExistingServer: false,
  },
});
