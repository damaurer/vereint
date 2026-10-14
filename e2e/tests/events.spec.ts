import { test, expect } from '../support/fixtures';
import { unique } from '../support/data';
import { sql } from '../support/stack';

test.describe('Events', () => {
  test('Vorstand pflegt ein Event, Mitglied sieht es und sagt zu', async ({ as }) => {
    const board = await as('board');
    const member = await as('member');
    const memberId = (await member.api.me()).id;

    // Events lassen sich in der Oberflaeche noch nicht anlegen, nur bearbeiten.
    const title = unique('Stammtisch');
    const event = await board.api.createEvent(title);

    await test.step('Vorstand veroeffentlicht und laedt ein', async () => {
      const { page } = board;
      await page.goto(`/events/${event.id}/manage`);
      await expect(page.getByRole('heading', { level: 1, name: `${title} verwalten` })).toBeVisible();
      await page.getByLabel('Ort').fill('Goldener Hirsch');
      await page.getByLabel('Status').selectOption({ label: 'Veröffentlicht' });
      await page.getByRole('button', { name: 'Stammdaten speichern' }).click();
      await expect(page.getByText('Veröffentlicht').first()).toBeVisible();

      await page.getByLabel('Teilnehmer-ID').fill(memberId);
      await page.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Teilnehmer & Anwesenheit (1)' })).toBeVisible();
      await expect(page.getByText('Mia Mitglied')).toBeVisible();
    });

    await test.step('Mitglied sieht das Event direkt nach der Einladung', async () => {
      const { page } = member;
      await page.goto('/events');
      await page.getByRole('heading', { name: title }).click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(page.getByText('Goldener Hirsch')).toBeVisible();
      // Direktaufruf (serverseitige Pruefung) klappt auch innerhalb der Cache-Zeit.
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Deine Antwort' }).getByRole('button', { name: 'Zusagen' }))
        .toHaveAttribute('aria-pressed', 'true');
    });

    await test.step('Mitglied darf das Event nicht verwalten', async () => {
      await member.page.goto(`/events/${event.id}/manage`);
      await expect(member.page).toHaveURL(/\/403$/);
    });
  });

  // Bekannter Fehler: Zu- und Absagen fuegt das Mitglied als Teilnehmer hinzu
  // bzw. entfernt es. Beides darf laut Backend nur, wer das Event verwaltet; die
  // Antwort springt deshalb still zurueck. Nach einer Absage waere das Event
  // zudem nicht mehr sichtbar. Braucht ein RSVP-Feld statt Teilnahme-Loeschung.
  test.fixme('Mitglied kann absagen und wieder zusagen', async ({ as }) => {
    const board = await as('board');
    const member = await as('member');
    const event = await board.api.createEvent(unique('Grillabend'));
    await board.api.addParticipant(event.id, (await member.api.me()).id);

    const { page } = member;
    await page.goto(`/events/${event.id}`);
    const answer = page.getByRole('group', { name: 'Deine Antwort' });
    await answer.getByRole('button', { name: 'Absagen' }).click();
    await page.reload();
    await expect(answer.getByRole('button', { name: 'Absagen' })).toHaveAttribute('aria-pressed', 'true');
    await answer.getByRole('button', { name: 'Zusagen' }).click();
    await page.reload();
    await expect(answer.getByRole('button', { name: 'Zusagen' })).toHaveAttribute('aria-pressed', 'true');
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
    await page.getByLabel('Nachricht').fill(secret);
    await page.getByRole('button', { name: 'Senden' }).click();
    await expect(page.getByText(secret)).toBeVisible();

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
