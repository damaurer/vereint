import { test, expect } from '../support/fixtures';
import { PNG_8X8, unique } from '../support/data';
import { listObjects, rawObject } from '../support/stack';

test('Bild-Upload ueber den BFF: verschluesselt im Speicher, lesbar nur mit Berechtigung', async ({ as, request }) => {
  const board = await as('board');
  const member = await as('member');
  const outsider = await as('member2');
  const event = await board.api.createEvent(unique('Fotoabend'));
  await board.api.addParticipant(event.id, (await member.api.me()).id);

  const upload = await board.api.raw.post('/api/v1/images', {
    multipart: {
      file: { name: 'foto.png', mimeType: 'image/png', buffer: PNG_8X8 },
      purpose: 'event',
      targetId: event.id,
    },
  });
  expect(upload.status(), await upload.text()).toBe(201);
  const image = (await upload.json()) as { id: string; url: string };

  // Teilnehmer bekommen das Originalbild ueber den geprueften Endpunkt.
  const content = await member.api.raw.get(image.url);
  expect(content.status()).toBe(200);
  expect(Buffer.compare(await content.body(), PNG_8X8)).toBe(0);

  // Wer nicht zum Event gehoert oder nicht angemeldet ist, bekommt es nicht.
  expect((await outsider.api.raw.get(image.url)).status()).toBeGreaterThanOrEqual(403);
  expect((await request.get(image.url)).status()).toBe(401);

  // Im Objektspeicher liegt kein lesbares PNG.
  const [key] = await listObjects(`event/${event.id}/`);
  expect(key).toBeTruthy();
  const stored = await rawObject(key);
  expect(stored.subarray(0, 8).equals(PNG_8X8.subarray(0, 8))).toBe(false);
});
