import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/release",
  testMatch: "*.spec.js",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5179",
    browserName: "chromium",
    channel: process.env.CI ? undefined : "msedge",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node tests/release/backend.mjs",
      url: "http://127.0.0.1:3021/api/v1/health/ready",
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: "npm run dev -- --port 5179 --strictPort",
      url: "http://127.0.0.1:5179",
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: "http://127.0.0.1:3021" },
      timeout: 60000,
    },
  ],
});
