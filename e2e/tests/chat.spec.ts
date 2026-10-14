import { test, expect } from '../support/fixtures';
import { unique } from '../support/data';
import type { Page } from '@playwright/test';
import { sql } from '../support/stack';

/** Nachrichtenverlauf ohne die Vorschau in der Konversationsliste. */
const thread = (page: Page) => page.locator('app-chat-thread');

test.describe('Vereinschat und Direktnachrichten', () => {
  test('Vorstand pinnt eine Infotafel, Mitglieder schreiben und reagieren im Vereinschat', async ({ as }) => {
    const board = await as('board');
    const member = await as('member');
    const member2 = await as('member2');
    const notice = unique('Samstag Arbeitseinsatz');
    const text = unique('Ich bringe Kuchen mit');

    await test.step('Vorstand pinnt die Infotafel', async () => {
      const { page } = board;
      await page.goto('/board/communications');
      await page.getByLabel('Infotafel', { exact: true }).fill(notice);
      await page.getByRole('button', { name: 'Anpinnen' }).click();
      await expect(page.getByText('Infotafel angepinnt.')).toBeVisible();
    });

    await test.step('Mitglied sieht die Infotafel und schreibt', async () => {
      const { page } = member;
      await page.goto('/chat');
      await page.getByRole('button', { name: /^Vereinschat/ }).click();
      await expect(page.getByText('Infotafel von Bert Vorstand')).toBeVisible();
      await expect(thread(page).getByText(notice)).toBeVisible();
      await page.getByPlaceholder('Schreibe eine Nachricht…').fill(text);
      await page.getByRole('button', { name: 'Senden' }).click();
      await expect(thread(page).getByText(text)).toBeVisible();
    });

    await test.step('Zweites Mitglied sieht den Ungelesen-Zaehler, liest und reagiert', async () => {
      const { page } = member2;
      await page.goto('/dashboard');
      await expect(page.getByRole('link', { name: /^Chat, \d+ ungelesen$/ }).first()).toBeVisible();
      await page.goto('/chat');
      await page.getByRole('button', { name: /^Vereinschat/ }).click();
      const message = page.locator('article.chat-message').filter({ hasText: text });
      await expect(message).toBeVisible();
      await message.getByRole('button', { name: 'Reaktion hinzufügen' }).click();
      await message.getByRole('button', { name: 'Mit 👍 reagieren' }).click();
      await expect(message.getByRole('button', { name: 'Reaktion 👍, 1' })).toBeVisible();
      // Nach dem Lesen zaehlt der Vereinschat nicht mehr als ungelesen.
      await expect
        .poll(async () => (await member2.api.get<{ type: string; unreadCount: number }[]>('/conversations'))
          .find((c) => c.type === 'club')?.unreadCount)
        .toBe(0);
    });

    // Nachrichten und Infotafel liegen verschluesselt in der Datenbank.
    const stored = sql(
      `select coalesce(m.message, '') || ' ' || coalesce(c.pinned_text, '') from chat_messages m join conversations c on c.id = m.conversation_id where c.type = 'club'`,
    );
    expect(stored.length).toBeGreaterThan(0);
    for (const row of stored) {
      expect(row).not.toContain('Kuchen');
      expect(row).not.toContain('Arbeitseinsatz');
    }
  });

  test('Direktnachricht erreicht nur die zwei Beteiligten', async ({ as }) => {
    const member = await as('member');
    const member2 = await as('member2');
    const board = await as('board');
    const text = unique('Fahren wir zusammen?');
    const answer = unique('Klar, um sieben.');

    const { page } = member;
    await page.goto('/direktnachrichten');
    await page.getByRole('button', { name: /Neue Nachricht/ }).click();
    await page.getByLabel('Mitglied suchen').fill('Max');
    await page.locator('.dm-members').getByRole('button', { name: /Max Mitglied/ }).click();
    await page.getByPlaceholder('Schreibe eine Nachricht…').fill(text);
    await page.getByRole('button', { name: 'Senden' }).click();
    await expect(thread(page).getByText(text)).toBeVisible();

    await member2.page.goto('/direktnachrichten');
    await member2.page.getByRole('button', { name: /Mia Mitglied/ }).click();
    await expect(thread(member2.page).getByText(text)).toBeVisible();
    await member2.page.getByPlaceholder('Schreibe eine Nachricht…').fill(answer);
    await member2.page.getByRole('button', { name: 'Senden' }).click();
    await expect(thread(member2.page).getByText(answer)).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: /Max Mitglied/ }).click();
    await expect(thread(page).getByText(answer)).toBeVisible();

    // Der Vorstand sieht das Gespraech weder in seiner Liste noch per API.
    const conversations = await board.api.get<{ id: string; type: string; partnerName?: string }[]>('/conversations');
    const own = await member.api.get<{ id: string; type: string; partnerName?: string }[]>('/conversations');
    const direct = own.find((c) => c.type === 'direct' && c.partnerName === 'Max Mitglied')!;
    expect(direct).toBeTruthy();
    expect(conversations.map((c) => c.id)).not.toContain(direct.id);
    const denied = await board.api.raw.get(`/api/v1/conversations/${direct.id}/messages`);
    expect([403, 404]).toContain(denied.status());
  });

  test('Statistik ist fuer jedes angemeldete Mitglied erreichbar', async ({ as }) => {
    const member = await as('member');
    await member.page.goto('/dashboard');
    await member.page.getByRole('link', { name: 'Statistik' }).first().click();
    await expect(member.page).toHaveURL(/\/statistik$/);
    await expect(member.page.getByRole('heading', { level: 1, name: 'Eber-Analytik' })).toBeVisible();
    await member.page.reload();
    await expect(member.page.getByRole('heading', { level: 1, name: 'Eber-Analytik' })).toBeVisible();
  });
});
