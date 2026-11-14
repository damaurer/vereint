import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import type { Role } from '../support/users';

/**
 * Jede Seite einmal pro Rolle aufrufen: Sie muss rendern (Ueberschrift),
 * ohne Fehler in der Konsole, ohne blockierte Skripte und ohne fehlgeschlagene
 * API-Aufrufe. Faengt kaputte Seiten, fehlende Endpunkte und CSP-Probleme ab.
 */
const pages: Record<Exclude<Role, 'member2'>, string[]> = {
  member: [
    '/dashboard',
    '/profile',
    '/wallet',
    '/purchases',
    '/events',
    '/catalog',
    '/sublists',
    '/notifications',
    '/moments',
    '/statistik',
    '/statistik/getraenke',
    '/statistik/uebersicht',
    '/statistik/ich',
    '/statistik/events',
    '/statistik/gruppe/events',
    '/statistik/funktionen',
  ],
  board: ['/dashboard', '/statistik/uebersicht', '/statistik/gruppe/events', '/board', '/board/treasury', '/board/communications', '/board/moments', '/catalog', '/sublists'],
  admin: ['/dashboard', '/admin', '/tablet'],
  terminal: ['/tablet'],
};

function watchForProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 400) {
      problems.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  return problems;
}

for (const [role, paths] of Object.entries(pages) as [Role, string[]][]) {
  test(`alle Seiten fuer ${role} rendern fehlerfrei`, async ({ as }) => {
    const { page } = await as(role);
    const problems = watchForProblems(page);
    for (const path of paths) {
      await test.step(path, async () => {
        await page.goto(path);
        await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
      });
    }
    expect(problems).toEqual([]);
  });
}
