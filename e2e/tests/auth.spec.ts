import { test, expect } from '../support/fixtures';
import { loginViaKeycloak } from '../support/login';
import { sql } from '../support/stack';

test.describe('Anmeldung', () => {
  test('ohne Session fuehrt jede geschuetzte Seite zur Keycloak-Anmeldung', async ({ page }) => {
    await page.goto('/wallet');
    await expect(page).toHaveURL(/\/kc\/realms\/vereint\/protocol\/openid-connect\/auth/);
    // Login-Theme `vereint` ist aktiv und deutsch.
    await expect(page.locator('#kc-login')).toBeVisible();
    await expect(page.getByText('Benutzername oder E-Mail')).toBeVisible();
    // Wer noch keine Gruppe hat, kann direkt eine eigene eroeffnen.
    await expect(page.getByRole('link', { name: 'Eigene Gruppe eröffnen' })).toHaveAttribute('href', /\/gruppe-eroeffnen$/);
  });

  test('die fruehere Adresse /eroeffnen fuehrt zur Seite "Gruppe eröffnen"', async ({ page }) => {
    await page.goto('/eroeffnen');
    await expect(page).toHaveURL(/\/gruppe-eroeffnen$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Gruppe eröffnen' })).toBeVisible();
  });

  test('falsches Passwort wird abgewiesen', async ({ page, credentials }) => {
    await page.goto('/');
    await page.locator('#username').fill(credentials.member.username);
    await page.locator('#password').fill('falsches-passwort');
    await page.locator('#kc-login').click();
    await expect(page).toHaveURL(/\/kc\//);
    await expect(page.locator('#input-error, .pf-v5-c-helper-text__item-text, [id^="input-error"]').first()).toBeVisible();
  });

  test('nach dem Login landet das Mitglied auf seiner Startseite und kehrt zur Zielseite zurueck', async ({
    page,
    credentials,
  }) => {
    await loginViaKeycloak(page, credentials.member, '/wallet');
    await expect(page).toHaveURL(/\/wallet$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Bierkasse' })).toBeVisible();

    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Mia Mitglied' })).toBeVisible();
  });

  test('ohne Zustimmung zur gueltigen AGB-Fassung ist die App gesperrt', async ({ page, credentials }) => {
    // Zustimmung des Testkontos zuruecksetzen, damit die Sperre bei jedem Lauf greift.
    sql(`update users set terms_version = null, terms_accepted_at = null where email = '${credentials.member2.username}@vereint.test'`);
    await loginViaKeycloak(page, credentials.member2, '/wallet', { acceptTerms: false });
    await expect(page).toHaveURL(/\/agb-zustimmen\?returnTo=%2Fwallet$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Bitte stimme den AGB zu' })).toBeVisible();

    // Andere Seiten fuehren zurueck auf die Zustimmung, die Statistik antwortet nicht.
    await page.goto('/statistik');
    await expect(page).toHaveURL(/\/agb-zustimmen/);
    expect((await page.request.get('/api/v1/statistics')).status()).toBe(403);
    // AGB und Impressum bleiben lesbar.
    await page.goto('/agb');
    await expect(page.getByRole('heading', { level: 1, name: 'Allgemeine Geschäftsbedingungen' })).toBeVisible();

    await page.goto('/wallet');
    await expect(page).toHaveURL(/\/agb-zustimmen/);
    await page.getByTestId('accept-terms').click();
    await expect(page).toHaveURL(/\/wallet$/);
    expect((await page.request.get('/api/v1/statistics')).status()).toBe(200);
  });

  test('Abmelden beendet die Session auch bei Keycloak', async ({ as }) => {
    const { page } = await as('member');
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Mia Mitglied/ }).click();
    await page.getByRole('menuitem', { name: 'Abmelden' }).click();
    await expect(page).toHaveURL(/\/auth\/logged-out|\/kc\//);

    // Ohne Session geht es wieder zur Anmeldung, ohne stilles SSO.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/kc\/realms\/vereint\/protocol\/openid-connect\/auth/);
    await expect(page.locator('#username')).toBeVisible();
  });
});
