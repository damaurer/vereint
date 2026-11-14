import { test, expect } from '../support/fixtures';
import { unique } from '../support/data';
import { sql } from '../support/stack';

/** Wert fuer ein datetime-local-Feld in der Zeitzone des Browsers. */
function localInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

test.describe('Events', () => {
  test('Vorstand legt ein Event in der Oberflaeche an und laedt per Name ein', async ({ as }) => {
    const board = await as('board');
    const member = await as('member');
    const title = unique('Stammtisch');
    await member.api.post('/notifications/read-all');

    let eventId = '';
    await test.step('Vorstand legt das Event an und veroeffentlicht es', async () => {
      const { page } = board;
      await page.goto('/events');
      await page.getByRole('link', { name: /Event anlegen/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Event anlegen' })).toBeVisible();
      // Direktaufruf wird serverseitig nicht als Event mit der ID "new" gelesen.
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'Event anlegen' })).toBeVisible();

      await page.getByLabel('Titel *').fill(title);
      await page.getByLabel('Ort', { exact: true }).fill('Goldener Hirsch');
      await page.getByLabel('Beginn *').fill(localInput(Date.now() + 3 * 86_400_000));
      await page.getByLabel('Mitglied suchen').fill('Mia');
      await page.getByRole('checkbox', { name: 'Mia Mitglied' }).check();
      await page.getByRole('button', { name: 'Veröffentlichen und einladen' }).click();
      await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\/manage$/);
      eventId = page.url().split('/events/')[1].split('/')[0];
      await page.getByRole('tab', { name: 'Teilnehmer' }).click();
      await expect(page.getByText('Mia Mitglied')).toBeVisible();
    });

    await test.step('Mitglied bekommt die Einladung und sagt in den Mitteilungen zu', async () => {
      const { page } = member;
      await page.goto('/notifications');
      const item = page.getByRole('listitem').filter({ hasText: title });
      await expect(item).toBeVisible();
      await item.getByRole('button', { name: 'Zusagen' }).click();
      await item.getByRole('link', { name: 'Zum Event' }).click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(page.getByText('Goldener Hirsch')).toBeVisible();
      await expect(page.getByRole('group', { name: 'Deine Antwort' }).getByRole('button', { name: 'Zusagen' }))
        .toHaveAttribute('aria-pressed', 'true');
    });

    await test.step('Mitglied darf das Event nicht verwalten', async () => {
      await member.page.goto(`/events/${eventId}/manage`);
      await expect(member.page).toHaveURL(/\/403$/);
    });
  });

  test('Mitglied kann absagen und wieder zusagen, der Vorstand sieht die Antwort', async ({ as }) => {
    const board = await as('board');
    const member = await as('member');
    const memberId = (await member.api.me()).id;
    const title = unique('Grillabend');
    const event = await board.api.createEvent(title, 48);
    await board.api.post(`/events/${event.id}/invitations`, { userIds: [memberId] });
    await board.api.setEventStatus(event.id, 'published');

    const { page } = member;
    await page.goto(`/events/${event.id}`);
    const answer = page.getByRole('group', { name: 'Deine Antwort' });
    await answer.getByRole('button', { name: 'Absagen' }).click();
    await expect(answer.getByRole('button', { name: 'Absagen' })).toHaveAttribute('aria-pressed', 'true');
    // Nach der Absage bleibt das Event sichtbar und die Antwort gespeichert.
    await page.reload();
    await expect(answer.getByRole('button', { name: 'Absagen' })).toHaveAttribute('aria-pressed', 'true');
    await answer.getByRole('button', { name: 'Zusagen' }).click();
    await page.reload();
    await expect(answer.getByRole('button', { name: 'Zusagen' })).toHaveAttribute('aria-pressed', 'true');

    const participants = await board.api.get<{ userId: string; rsvp: string }[]>(`/events/${event.id}/participants`);
    expect(participants.find((p) => p.userId === memberId)?.rsvp).toBe('accepted');
  });

  test('Eingeladene nutzen den Event-Chat, Nichteingeladene nicht', async ({ as }) => {
    const board = await as('board');
    const member = await as('member');
    const outsider = await as('member2');
    const title = unique('Weinprobe');
    const event = await board.api.createEvent(title, 24);
    await board.api.post(`/events/${event.id}/invitations`, { userIds: [(await member.api.me()).id] });
    await board.api.setEventStatus(event.id, 'published');
    const text = unique('Wer bringt Kaese mit?');

    const { page } = member;
    await page.goto(`/events/${event.id}`);
    const chat = page.locator('section.event-chat');
    await chat.getByRole('textbox').fill(text);
    await chat.getByRole('button', { name: 'Senden' }).click();
    await expect(chat.getByText(text)).toBeVisible();

    await board.page.goto('/chat');
    await board.page.getByRole('button', { name: new RegExp(title) }).click();
    await expect(board.page.locator('app-chat-thread').getByText(text)).toBeVisible();

    const denied = await outsider.api.raw.get(`/api/v1/events/${event.id}/chat`);
    expect([403, 404]).toContain(denied.status());
  });

  test('Event-Chat mit Gast ueber Einladungslink, Nachrichten liegen verschluesselt in der Datenbank', async ({
    as,
    browser,
  }) => {
    const board = await as('board');
    const title = unique('Sommerfest');
    const event = await board.api.createEvent(title);
    await board.api.setEventStatus(event.id, 'published');
    const secret = unique('Treffpunkt am Hintereingang');

    const { page } = board;
    await page.goto(`/events/${event.id}/manage`);
    await page.getByRole('tab', { name: 'Chat' }).click();
    await page.getByLabel('Nachricht').fill(secret);
    await page.getByRole('button', { name: 'Senden' }).click();
    await expect(page.getByText(secret)).toBeVisible();

    await page.getByRole('tab', { name: 'Gäste' }).click();
    await page.getByLabel('Max. Nutzungen').fill('1');
    await page.getByRole('button', { name: 'Gasteinladung erzeugen' }).click();
    const acceptPath = (await page.locator('code.manage-token').textContent())!.trim();
    expect(acceptPath).toContain('/invite/accept');

    await test.step('Gast nimmt die Einladung ohne Konto an und schreibt im Chat', async () => {
      const guestContext = await browser.newContext(test.info().project.use);
      const guest = await guestContext.newPage();
      // Der Link nimmt die Einladung direkt an und fuehrt in den Gastzugang.
      await guest.goto(acceptPath);
      await expect(guest).toHaveURL(new RegExp(`/guest/${event.id}`));
      await expect(guest.getByText(title).first()).toBeVisible();
      await expect(guest.getByText(secret)).toBeVisible();

      await guest.getByPlaceholder('Nachricht schreiben …').fill('Bin dabei!');
      await guest.getByRole('button', { name: 'Senden' }).click();
      await expect(guest.getByText('Bin dabei!')).toBeVisible();
      await guestContext.close();
    });

    await page.reload();
    await page.getByRole('tab', { name: 'Chat' }).click();
    await expect(page.getByText('Bin dabei!')).toBeVisible();

    // Verschluesselung auf Anwendungsebene: Klartext steht nicht in der Datenbank.
    const stored = sql(
      `select m.message from chat_messages m join conversations c on c.id = m.conversation_id where c.event_id = '${event.id}'`,
    );
    expect(stored.length).toBe(2);
    for (const value of stored) {
      expect(value).not.toContain('Hintereingang');
      expect(value).not.toContain('Bin dabei');
    }
  });
});
