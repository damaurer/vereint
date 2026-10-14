import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Api } from './api';
import type { TestUser } from './keycloak-admin';
import { loginViaKeycloak } from './login';
import { credentialsFile } from './paths';
import type { Role } from './users';

export interface Session {
  context: BrowserContext;
  page: Page;
  api: Api;
  user: TestUser;
}

function credentials(): Record<Role, TestUser> {
  return JSON.parse(readFileSync(credentialsFile, 'utf8')) as Record<Role, TestUser>;
}

/**
 * `as(role)` meldet eine Testrolle in einem eigenen Browser-Kontext ueber die
 * Keycloak-Login-Seite an. Mehrere Rollen pro Test sind moeglich (z. B.
 * Vorstand bucht, Mitglied sieht das Guthaben). Jede Anmeldung ist frisch, weil
 * Keycloak Refresh-Tokens rotiert und gespeicherte Sessions damit veralten.
 */
export const test = base.extend<{
  as: (role: Role) => Promise<Session>;
  credentials: Record<Role, TestUser>;
}>({
  credentials: async ({}, use) => {
    await use(credentials());
  },
  as: async ({ browser, credentials: users }, use, testInfo) => {
    // Playwright zeichnet auch diese Kontexte auf (`trace: 'retain-on-failure'`).
    const opened: { role: Role; context: BrowserContext }[] = [];
    await use(async (role) => {
      const { baseURL, ignoreHTTPSErrors, locale, timezoneId, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } =
        testInfo.project.use;
      const context = await browser.newContext({
        baseURL, ignoreHTTPSErrors, locale, timezoneId, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch,
      });
      opened.push({ role, context });
      const page = await context.newPage();
      const user = users[role];
      await loginViaKeycloak(page, user);
      return { context, page, api: new Api(context.request), user };
    });
    for (const { context } of opened) await context.close();
  },
});

export { expect };
