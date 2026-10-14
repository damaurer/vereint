import { defineConfig, devices } from '@playwright/test';

/**
 * E2E-Tests gegen den Produktions-Stack aus e2e/stack.sh
 * (Caddy, Keycloak, webservice, baseservice, PostgreSQL, S3).
 */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'https://vereint.test:8443';

const chromiumArgs = [
  // vereint.test zeigt auf den lokal veroeffentlichten Caddy-Port.
  '--host-resolver-rules=MAP vereint.test 127.0.0.1',
  // Test-CA aus e2e/stack.sh; `ignoreHTTPSErrors` gilt nicht fuer den Service Worker.
  '--ignore-certificate-errors',
];

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  // Die Tests teilen sich einen Stack und dessen Daten (Guthaben, Events);
  // sie laufen deshalb nacheinander.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }], ['github']] : [['list']],
  globalSetup: './support/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    // Zertifikat der Test-CA aus e2e/stack.sh.
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: { args: chromiumArgs },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
});
