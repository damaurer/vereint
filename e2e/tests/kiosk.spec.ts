import { test, expect } from '../support/fixtures';

test.describe('Kiosk-Modus am Thekenterminal', () => {
  test('Vorstand setzt die PIN, das Terminal bleibt gesperrt bis zur richtigen PIN', async ({ as }) => {
    const pin = String(Math.floor(100000 + Math.random() * 900000));

    await test.step('Vorstand legt die Kiosk-PIN fest', async () => {
      const { page } = await as('board');
      await page.goto('/board');
      await page.getByRole('button', { name: /Kiosk-PIN/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Kiosk-PIN' });
      await dialog.getByLabel(/Neue PIN/).fill(pin);
      await dialog.getByLabel('PIN wiederholen').fill(pin);
      await dialog.getByRole('button', { name: 'PIN speichern' }).click();
      await expect(dialog.getByText('Die neue PIN gilt ab sofort auf allen Terminals.')).toBeVisible();
    });

    const terminal = await as('terminal');
    let page = terminal.page;

    await test.step('Terminal startet den Kiosk-Modus', async () => {
      await page.goto('/tablet');
      await page.getByRole('button', { name: 'Kiosk-Modus starten' }).click();
      await expect(page.getByText('Kiosk-Modus aktiv')).toBeVisible();
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
      await expect(page.getByRole('button', { name: 'Kiosk-Modus starten' })).toBeVisible();
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard$/);
    });
  });
});
