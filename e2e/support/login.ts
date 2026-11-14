import { expect, type Page } from '@playwright/test';
import type { TestUser } from './keycloak-admin';

/** Seite, auf der die App nach dem Login die Zustimmung zur gültigen AGB-Fassung verlangt. */
export const TERMS_CONSENT_PATH = '/agb-zustimmen';

/**
 * Meldet einen Benutzer ueber die Keycloak-Login-Seite (Theme `vereint`) an.
 *
 * Testkonten stimmen danach der gueltigen AGB-Fassung zu (`acceptTerms`, Standard),
 * damit die AGB-Sperre die uebrigen Tests nicht aufhaelt. Wer die Sperre selbst
 * pruefen will, setzt `acceptTerms: false`.
 */
export async function loginViaKeycloak(
  page: Page,
  user: Pick<TestUser, 'username' | 'password'>,
  path = '/',
  { acceptTerms = true }: { acceptTerms?: boolean } = {},
): Promise<void> {
  await page.goto(path);
  await expect(page).toHaveURL(/\/kc\/realms\/vereint\/protocol\/openid-connect\/auth/);
  await page.locator('#username').fill(user.username);
  await page.locator('#password').fill(user.password);
  await page.locator('#kc-login').click();
  await expect(page).not.toHaveURL(/\/kc\//);
  if (!acceptTerms) return;

  const response = await page.request.post('/api/v1/users/me/terms', {
    data: { acceptTerms: true },
    headers: { Accept: 'application/json' },
  });
  expect(response.ok(), `AGB-Zustimmung fuer ${user.username}: HTTP ${response.status()}`).toBe(true);
  await page.waitForLoadState('networkidle');
  if (new URL(page.url()).pathname === TERMS_CONSENT_PATH) await page.goto(path);
}
