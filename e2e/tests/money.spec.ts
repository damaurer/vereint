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
      await page.getByLabel('Aufladen · Mitglieds-ID').fill(memberId);
      const form = page.locator('form').filter({ has: page.getByLabel('Aufladen · Mitglieds-ID') });
      await form.getByLabel('Betrag').fill('20');
      await form.getByLabel('Notiz').fill('E2E Aufladung');
      await form.getByRole('button', { name: 'Aufladen' }).click();
      await expect.poll(() => member.api.balance(memberId)).toBe(start + 20);
    });

    await test.step('Mitglied sieht das neue Guthaben', async () => {
      await member.page.goto('/wallet');
      await expect(member.page.getByText(euro(start + 20)).first()).toBeVisible();
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

    await test.step('Mitglied sieht Kauf und Korrektur oben in der Historie', async () => {
      const { page } = member;
      await page.goto('/wallet');
      await expect(page.getByText(euro(start + 20)).first()).toBeVisible();
      const titles = page.locator('.member-list-title');
      await expect(titles.nth(0)).toHaveText('Korrektur');
      await expect(titles.nth(1)).toHaveText('Kauf');
    });
  });
});
