import { defineConfig } from '@playwright/test';

/**
 * Smoke E2E opcional (Fase C/D).
 * Local: npx playwright install chromium && npm run test:e2e
 * CI: só se PLAYWRIGHT=1 (evita instalar browsers em todo push)
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
    headless: true,
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
