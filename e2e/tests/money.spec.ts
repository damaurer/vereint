import { test, expect } from '../support/fixtures';
import { euro, unique } from '../support/data';

test.describe('Guthaben und Thekenterminal', () => {
  test('Kassenwart laedt auf, Theke bucht einen Strich, Rueckgaengig bucht zurueck', async ({ as }) => {
    const board = await as('board');
    const member = await as('member');
    const terminal = await as('terminal');
    const memberId = (await member.api.me()).id;

    // Event mit einem Getraenk, aktiv geschaltet (Events haben noch keine Anlege-Oberflaeche).
    const title = unique('Thekenabend');
    const event = await board.api.createEvent(title, 0);
    await board.api.addParticipant(event.id, memberId);
    const drink = await board.api.approvedDrink(unique('Helles'), 3.5);
    await board.api.addEventDrink(event.id, drink.id, 3.5);
    await board.api.setEventStatus(event.id, 'active');

    const start = await member.api.balance(memberId);

    await test.step('Kassenwart laedt 20 € auf', async () => {
      const { page } = board;
      await page.goto('/board/treasury');
      await page.getByLabel('Mitglied suchen').fill('Mia');
      await page.getByRole('button', { name: /Mia Mitglied/ }).click();
      const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Aufladen' }) });
      await form.getByLabel('Betrag').fill('20');
      await form.getByLabel('Notiz').fill('E2E Aufladung');
      await form.getByRole('button', { name: 'Aufladen' }).click();
      await expect.poll(() => member.api.balance(memberId)).toBe(start + 20);
      await expect(page.getByText('Aufladung gebucht.')).toBeVisible();
    });

    await test.step('Mitglied sieht das neue Guthaben, aber keine Aufladen-Funktion', async () => {
      await member.page.goto('/wallet');
      await expect(member.page.getByText(euro(start + 20)).first()).toBeVisible();
      await expect(member.page.getByRole('main').getByRole('button', { name: /Aufladen/ })).toHaveCount(0);
      await expect(member.page.getByRole('main').getByRole('link', { name: /Aufladen/ })).toHaveCount(0);
      await member.page.goto('/dashboard');
      await expect(member.page.getByRole('main').getByRole('button', { name: /Aufladen/ })).toHaveCount(0);
      await expect(member.page.getByRole('main').getByRole('link', { name: /Aufladen/ })).toHaveCount(0);
    });

    await test.step('Theke bucht einen Strich', async () => {
      const { page } = terminal;
      await page.goto('/tablet');
      await page.getByRole('listitem').filter({ hasText: title }).getByRole('button', { name: 'Auswählen' }).click();
      const row = page.getByRole('group', { name: 'Striche für Mia Mitglied' });
      await row.getByRole('button', { name: 'Erhöhen' }).click();
      // Ohne gewaehlten Artikel fragt die Theke zuerst nach dem Getraenk.
      await page.getByRole('option', { name: new RegExp(drink.name) }).click();
      await page.getByRole('button', { name: 'Auswahl bestätigen' }).click();
      // Das Overlay waehlt nur den Artikel; gebucht wurde noch nichts.
      await expect(row.getByText('0', { exact: true })).toBeVisible();
      await row.getByRole('button', { name: 'Erhöhen' }).click();
      await expect(row.getByText('1', { exact: true })).toBeVisible();
      await expect(page.getByText(/Strich erfasst/)).toBeVisible();
      await expect.poll(() => member.api.balance(memberId)).toBe(start + 20 - 3.5);
    });

    await test.step('Rueckgaengig nimmt den Strich zurueck', async () => {
      await terminal.page.getByRole('button', { name: /Rückgängig/ }).click();
      await expect.poll(() => member.api.balance(memberId)).toBe(start + 20);
    });

    await test.step('Mitglied sieht Kauf und Storno mit Getraenkenamen oben in der Historie', async () => {
      const { page } = member;
      await page.goto('/wallet');
      await expect(page.getByText(euro(start + 20)).first()).toBeVisible();
      const items = page.locator('.member-list-item');
      await expect(items.nth(0).locator('.member-list-title')).toHaveText(`Storno: ${drink.name}`);
      await expect(items.nth(0).locator('.member-list-meta')).toContainText('Korrektur');
      await expect(items.nth(1).locator('.member-list-title')).toHaveText(drink.name);
      await expect(items.nth(1).locator('.member-list-meta')).toContainText('Kauf');
    });
  });

  test('Mitglied scannt ein Getraenk, bezahlt mit Guthaben und nimmt den Kauf zurueck', async ({ as }) => {
    const board = await as('board');
    const member = await as('member');
    const memberId = (await member.api.me()).id;

    const title = unique('Barcodeabend');
    const event = await board.api.createEvent(title, 0);
    await board.api.addParticipant(event.id, memberId);
    const drink = await board.api.approvedDrink(unique('Radler'), 2.5);
    // Eindeutige Nummer je Lauf; Barcodes sind global eindeutig.
    const barcode = `29${Date.now()}`.slice(0, 13);
    await board.api.addBarcode(drink.id, barcode);
    await board.api.addEventDrink(event.id, drink.id, 2.5);
    await board.api.setEventStatus(event.id, 'active');
    await board.api.topup(memberId, 10);
    const start = await member.api.balance(memberId);

    const { page } = member;
    await page.goto('/scan');

    await test.step('Nummer eintippen zeigt Getraenk und Preis, bucht aber noch nichts', async () => {
      // Im Testbrowser gibt es keine Kamera; die Eingabe von Hand ist derselbe Weg.
      await page.getByLabel('Oder Nummer unter dem Strichcode eintippen').fill(barcode);
      await page.getByRole('button', { name: 'Suchen', exact: true }).click();
      await expect(page.getByRole('heading', { name: drink.name })).toBeVisible();
      await expect(page.getByText(title)).toBeVisible();
      expect(await member.api.balance(memberId)).toBe(start);
    });

    await test.step('Bestaetigen bucht den Preis vom Guthaben ab', async () => {
      await page.getByRole('button', { name: /bezahlen$/ }).click();
      await expect(page.getByRole('heading', { name: 'Bezahlt' })).toBeVisible();
      await expect.poll(() => member.api.balance(memberId)).toBe(start - 2.5);
    });

    await test.step('Rueckgaengig bucht den Kauf zurueck', async () => {
      await page.getByRole('button', { name: 'Rückgängig' }).click();
      await expect(page.getByRole('heading', { name: 'Kauf zurückgenommen' })).toBeVisible();
      await expect.poll(() => member.api.balance(memberId)).toBe(start);
    });
  });
});
