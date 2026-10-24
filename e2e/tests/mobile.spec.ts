import { test, expect } from '../support/fixtures';

test('Mobil: untere Leiste fuehrt durch die Hauptbereiche', async ({ as }) => {
  const { page } = await as('member');
  await page.goto('/dashboard');
  const bar = page.locator('nav.shell-bottom-bar');
  await expect(bar).toBeVisible();
  for (const [label, path] of [
    ['Events', '/events'],
    ['Chat', '/chat'],
    ['Moments', '/moments'],
    ['Start', '/dashboard'],
  ]) {
    await bar.getByRole('link', { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
  await bar.getByRole('button', { name: 'Mehr' }).click();
  await expect(page.getByRole('link', { name: 'Profil' }).last()).toBeVisible();
});
