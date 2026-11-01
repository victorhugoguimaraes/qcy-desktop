import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:1422", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --port 1422",
    url: "http://127.0.0.1:1422/tests/browser/",
    reuseExistingServer: false,
  },
});
