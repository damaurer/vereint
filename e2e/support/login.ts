import { expect, type Page } from '@playwright/test';
import type { TestUser } from './keycloak-admin';

/** Meldet einen Benutzer ueber die Keycloak-Login-Seite (Theme `vereint`) an. */
export async function loginViaKeycloak(page: Page, user: Pick<TestUser, 'username' | 'password'>, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page).toHaveURL(/\/kc\/realms\/vereint\/protocol\/openid-connect\/auth/);
  await page.locator('#username').fill(user.username);
  await page.locator('#password').fill(user.password);
  await page.locator('#kc-login').click();
  await expect(page).not.toHaveURL(/\/kc\//);
}
