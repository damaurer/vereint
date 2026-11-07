import { test, expect } from '../support/fixtures';

test.describe('Rollen und Zugriff', () => {
  test('Mitglied sieht keine Verwaltung und bekommt 403 auf Vorstand und Admin', async ({ as }) => {
    const { page, api } = await as('member');
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: 'Start', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Thekenterminal' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Vorstand/ })).toHaveCount(0);

    for (const path of ['/board', '/board/treasury', '/admin', '/tablet']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/403$/);
      await expect(page.getByRole('heading', { name: 'Zugriff verweigert' })).toBeVisible();
    }

    // Auch die API verweigert Buchungen, unabhaengig von der Oberflaeche.
    const me = await api.me();
    const topup = await api.raw.post('/api/v1/ledger/topups', {
      data: { memberId: me.id, amount: '100.00', currency: 'EUR' },
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    });
    expect(topup.status()).toBe(403);
  });

  test('Vorstand erreicht Kasse und Kommunikation, aber nicht die Administration', async ({ as }) => {
    const { page } = await as('board');
    await page.goto('/board');
    await expect(page.getByRole('main').getByRole('link', { name: /Kasse & Finanzen/ })).toBeVisible();
    await page.goto('/board/treasury');
    await expect(page.getByRole('heading', { level: 1, name: 'Bierkasse verwalten' })).toBeVisible();
    await page.goto('/board/communications');
    await expect(page.getByRole('heading', { level: 1, name: 'Infotafeln & Rundbriefe' })).toBeVisible();
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/403$/);
  });

  test('Admin erreicht Administration und Thekenterminal', async ({ as }) => {
    const { page } = await as('admin');
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Mitglieder & Gruppen' })).toBeVisible();
    await page.goto('/tablet');
    await expect(page.getByRole('heading', { level: 1, name: 'Thekenterminal' })).toBeVisible();
  });

  test('Thekenterminal-Konto erreicht die Strichliste', async ({ as }) => {
    const { page } = await as('terminal');
    await page.goto('/tablet');
    await expect(page).toHaveURL(/\/tablet$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Thekenterminal' })).toBeVisible();
  });
});
