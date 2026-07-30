import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./output/playwright-test-results",
  reporter: [["list"], ["html", { outputFolder: "output/playwright-report" }]],
  use: {
    baseURL: "http://127.0.0.1:3211",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3211",
    url: "http://127.0.0.1:3211/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
