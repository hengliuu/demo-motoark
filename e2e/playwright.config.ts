import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: ".",
  // CI uploads the HTML report as an artifact. The list reporter keeps the results in the log.
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  use: {
    baseURL,
  },
  webServer: process.env.BASE_URL
    ? undefined
    : [
        {
          command: "go run ./cmd/api",
          cwd: "../api",
          url: "http://localhost:8080/healthz",
          reuseExistingServer: !process.env.CI,
        },
        {
          command: "pnpm --dir ../web start --port 3000",
          url: "http://localhost:3000",
          env: { API_BASE_URL: "http://localhost:8080" },
          reuseExistingServer: !process.env.CI,
        },
      ],
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
