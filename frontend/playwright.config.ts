import { defineConfig, devices } from "@playwright/test";
import { BACKEND_ORIGIN, BACKEND_PORT, FRONTEND_ORIGIN, FRONTEND_PORT } from "./e2e/env";

/**
 * Test end-to-end dei percorsi dell'utente.
 *
 * Girano contro la vera applicazione — database, parsing dei PDF, piano di
 * studio — con le sole chiamate al modello sostituite da risposte fisse
 * (backend/tests/e2e/stub_server.py). Le porte sono diverse da quelle di
 * sviluppo, così i test non toccano il backend e i dati di chi sta lavorando.
 */

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { outputFolder: "./e2e/.report", open: "never" }]]
    : [["list"]],
  use: {
    baseURL: FRONTEND_ORIGIN,
    locale: "it-IT",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `uv run python -m tests.e2e.stub_server --port ${BACKEND_PORT}`,
      cwd: "../backend",
      url: `${BACKEND_ORIGIN}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `npx next dev --port ${FRONTEND_PORT}`,
      url: FRONTEND_ORIGIN,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { NEXT_PUBLIC_API_ORIGIN: BACKEND_ORIGIN },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
