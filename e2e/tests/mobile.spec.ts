import { test, expect } from '../support/fixtures';

test('Mobil: untere Leiste fuehrt durch die Hauptbereiche', async ({ as }) => {
  const { page } = await as('member');
  await page.goto('/dashboard');
  const bar = page.locator('nav.shell-bottom-bar');
  await expect(bar).toBeVisible();
  for (const [label, path] of [
    ['Events', '/events'],
    ['Chat', '/chat'],
    ['Guthaben', '/wallet'],
    ['Start', '/dashboard'],
  ]) {
    await bar.getByRole('link', { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
  await bar.getByRole('button', { name: 'Mehr' }).click();
  await expect(page.getByRole('link', { name: 'Profil' }).last()).toBeVisible();
});

test('Mobil: Startdialog bietet Installation und Erlaubnisse einmal pro Geraet an', async ({ as }) => {
  const { page } = await as('member2', { startSetup: true });
  await page.goto('/dashboard');
  const dialog = page.getByRole('dialog', { name: 'Vereint einrichten' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Auf den Home-Bildschirm legen')).toBeVisible();
  await expect(dialog.getByText('Mitteilungen', { exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: 'Später' }).click();
  await expect(dialog).toBeHidden();

  // Abgelehnt bzw. übersprungen: beim nächsten Start nicht erneut fragen.
  await page.reload();
  await expect(page.locator('nav.shell-bottom-bar')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Vereint einrichten' })).toBeHidden();
});
