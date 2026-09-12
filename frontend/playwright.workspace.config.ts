import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const systemChromium = '/usr/bin/chromium';

export default defineConfig({
  testDir: './workspace-test',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    launchOptions: existsSync(systemChromium)
      ? { executablePath: systemChromium }
      : undefined,
  },
  webServer: {
    command: 'tsx workspace-test/server.ts',
    url: 'http://127.0.0.1:4173/invoices',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
