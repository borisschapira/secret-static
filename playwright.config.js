import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  outputDir: "/tmp/secret-static-playwright-results",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command: "python3 -m http.server 4173 --directory public",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
