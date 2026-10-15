import { test, expect } from '../support/fixtures';
import { unique } from '../support/data';
import { sql } from '../support/stack';

test.describe('Mitteilungen', () => {
  test('Schriftwart schickt eine Meldung, Mitglied sieht sie an der Glocke und liest sie', async ({ as }) => {
    const board = await as('board');
    const member = await as('member');
    const memberId = (await member.api.me()).id;
    const title = unique('Vereinsversammlung');
    const body = 'Bitte bis Freitag die Beiträge überweisen.';

    await member.api.post('/notifications/read-all');

    const { page } = board;
    await page.goto('/board/communications');
    await page.getByLabel('Ausgewählte Mitglieder').check();
    await page.getByLabel('Empfänger suchen').fill('Mia');
    await page.getByRole('checkbox', { name: 'Mia Mitglied' }).check();
    await page.getByLabel('Titel').fill(title);
    await page.getByLabel('Text').fill(body);
    await page.getByRole('button', { name: 'Senden' }).click();
    await expect(page.getByText('Mitteilung gesendet.')).toBeVisible();
    await expect(page.getByText(/1 (Mitglied|Empfänger)/)).toBeVisible();

    await member.page.goto('/dashboard');
    await expect(member.page.getByRole('link', { name: 'Mitteilungen, 1 ungelesen' })).toBeVisible();
    await member.page.getByRole('link', { name: 'Mitteilungen, 1 ungelesen' }).click();
    const item = member.page.getByRole('listitem').filter({ hasText: title });
    await expect(item.getByText(body)).toBeVisible();
    await item.getByRole('button', { name: 'Als gelesen markieren' }).click();
    await expect(member.page.getByRole('banner').getByRole('link', { name: 'Mitteilungen', exact: true })).toBeVisible();

    // Titel und Text liegen verschluesselt in der Datenbank.
    const stored = sql(`select title || ' ' || body from notifications where user_id = '${memberId}'`);
    expect(stored.length).toBeGreaterThan(0);
    for (const row of stored) {
      expect(row).not.toContain('Vereinsversammlung');
      expect(row).not.toContain('Beiträge');
    }
  });
});

test.describe('Getraenkekatalog', () => {
  test('Mitglied schlaegt ein Getraenk vor, Vorstand gibt es frei', async ({ as }) => {
    const member = await as('member');
    const board = await as('board');
    const name = unique('Radler');

    await member.page.goto('/catalog');
    await member.page.getByRole('button', { name: '+ Getränk vorschlagen' }).click();
    await member.page.getByLabel('Name des Getränks *').fill(name);
    await member.page.getByLabel('Kategorie').fill('Bier');
    await member.page.getByLabel('Standardpreis (€) *').fill('3.20');
    await member.page.getByRole('button', { name: 'Vorschlag einreichen' }).click();
    // Mitglieder sehen nur freigegebene Getraenke, bekommen aber eine Rueckmeldung.
    await expect(member.page.getByRole('status').filter({ hasText: name })).toBeVisible();
    await expect(member.page.locator('article').filter({ hasText: name })).toHaveCount(0);

    await board.page.goto('/catalog');
    const card = board.page.locator('article').filter({ hasText: name });
    await card.getByRole('button', { name: 'Freigeben' }).click();
    await expect(card.getByText('Freigegeben')).toBeVisible();

    await member.page.reload();
    const approved = member.page.locator('article').filter({ hasText: name });
    await expect(approved).toBeVisible();
    await expect(approved.getByRole('button', { name: 'Freigeben' })).toHaveCount(0);
  });

  test('Vorstand legt ein Getraenk mit Barcode direkt an und aendert den Preis', async ({ as }) => {
    const board = await as('board');
    const name = unique('Spezi');
    const barcode = `9${Date.now()}`.slice(0, 13);

    await board.page.goto('/catalog');
    await board.page.getByRole('button', { name: '+ Getränk anlegen' }).click();
    await board.page.getByLabel('Name des Getränks *').fill(name);
    await board.page.getByLabel('Standardpreis (€) *').fill('2.00');
    await board.page.getByLabel('Einkaufspreis (€)').fill('0.90');
    await board.page.getByLabel('Neuen Barcode erfassen …').fill(barcode);
    await board.page.getByRole('button', { name: '+ Barcode hinzufügen' }).click();
    await expect(board.page.locator('code').filter({ hasText: barcode })).toBeVisible();
    await board.page.getByRole('button', { name: 'Getränk anlegen', exact: true }).click();

    // Ohne zweiten Freigabeschritt sofort freigegeben.
    const card = board.page.locator('article').filter({ hasText: name });
    await expect(card.getByText('Freigegeben')).toBeVisible();
    await expect(card.getByText('Marge 1.10 EUR')).toBeVisible();

    await card.getByRole('button', { name: 'Bearbeiten' }).click();
    await board.page.getByLabel('Standardpreis (€) *').fill('2.20');
    await board.page.getByRole('button', { name: 'Speichern' }).click();
    await expect(card.getByText('2.20 EUR')).toBeVisible();
  });
});
