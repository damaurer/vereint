import { test, expect } from '../support/fixtures';
import { unique } from '../support/data';
import type { Page } from '@playwright/test';

const randomPin = () => String(Math.floor(100000 + Math.random() * 900000));

async function startKiosk(page: Page, label: string, pin: string) {
  await page.goto('/tablet');
  await page.getByRole('button', { name: 'Kiosk-Modus starten' }).click();
  const dialog = page.getByRole('dialog', { name: 'Kiosk-Modus starten' });
  await dialog.getByLabel('Gerätename (optional)').fill(label);
  await dialog.getByLabel(/^PIN \(/).fill(pin);
  await dialog.getByLabel('PIN wiederholen').fill(pin);
  await dialog.getByRole('button', { name: 'Starten', exact: true }).click();
  await expect(page.getByText('Kiosk-Modus aktiv')).toBeVisible();
}

test.describe('Kiosk-Modus am Thekenterminal', () => {
  test('Terminal vergibt beim Start eine PIN und bleibt gesperrt bis zur richtigen PIN', async ({ as }) => {
    const pin = randomPin();
    const terminal = await as('terminal');
    let page = terminal.page;

    await test.step('Terminal startet den Kiosk-Modus mit eigener PIN', async () => {
      await startKiosk(page, unique('Theke'), pin);
      // Keine Navigation und kein Abmelden mehr sichtbar.
      await expect(page.getByRole('link', { name: 'Start', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Abmelden/ })).toHaveCount(0);
    });

    await test.step('Andere Seiten, Neuladen und Neuöffnen führen zurück ins Terminal', async () => {
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/tablet$/);
      await page.reload();
      await expect(page.getByText('Kiosk-Modus aktiv')).toBeVisible();
      await page.close();
      page = await terminal.context.newPage();
      await page.goto('/profile');
      await expect(page).toHaveURL(/\/tablet$/);
      await expect(page.getByText('Kiosk-Modus aktiv')).toBeVisible();
    });

    await test.step('Falsche PIN hält den Modus aktiv', async () => {
      await page.getByRole('button', { name: 'Kiosk entsperren' }).click();
      const dialog = page.getByRole('dialog', { name: 'Kiosk-Modus verlassen' });
      await dialog.getByLabel('PIN').fill(pin === '000000' ? '111111' : '000000');
      await dialog.getByRole('button', { name: 'Entsperren' }).click();
      await expect(dialog.getByText(/Die PIN ist falsch/)).toBeVisible();
      await dialog.getByRole('button', { name: 'Abbrechen' }).click();
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/tablet$/);
    });

    await test.step('Richtige PIN beendet den Modus', async () => {
      await page.getByRole('button', { name: 'Kiosk-Modus verlassen' }).click();
      const dialog = page.getByRole('dialog', { name: 'Kiosk-Modus verlassen' });
      await dialog.getByLabel('PIN').fill(pin);
      await dialog.getByRole('button', { name: 'Entsperren' }).click();
      await expect(page.getByText('Kiosk-Modus aktiv')).toHaveCount(0);
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard$/);
    });
  });

  test('Vorstand entsperrt ein Terminal aus der Ferne ohne PIN', async ({ as }) => {
    const label = unique('Theke fern');
    const terminal = await as('terminal');
    await startKiosk(terminal.page, label, randomPin());

    const { page } = await as('board');
    await page.goto('/board');
    await page.getByRole('button', { name: /Kiosk-Geräte/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Kiosk-Geräte' });
    const row = dialog.getByRole('listitem').filter({ hasText: label });
    await row.getByRole('button', { name: 'Entsperren' }).click();
    await expect(dialog.getByText(`${label} ist entsperrt.`)).toBeVisible();

    // Das Terminal gleicht regelmäßig ab und verlässt den Modus von selbst.
    await expect(terminal.page.getByText('Kiosk-Modus aktiv')).toHaveCount(0, { timeout: 30_000 });
    await terminal.page.goto('/dashboard');
    await expect(terminal.page).toHaveURL(/\/dashboard$/);
  });
});
