import { defineConfig, devices } from "@playwright/test";

// Not 3002, the port `npm run dev`, `npm start`, and the synapse-app container bind: a suite
// there would test that server instead of the build under test. Not 3100 either, finance-stack's
// suite (finance-stack/app/playwright.config.ts). Outside CI, `webServer` reuses a server it
// finds on this port, so set E2E_PORT if something else already holds 3102.
const PORT = Number(process.env.E2E_PORT ?? 3102);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // The production build, not `next dev`: an end-to-end gate exercises what ships. `npx next
  // start` rather than `npm start`, whose `-p 3002` a second `-p` would fight, and on loopback
  // only, like everything Synapse publishes before #44.
  webServer: {
    command: `npm run build && npx next start -H 127.0.0.1 -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
