// Nimmt die Screenshots für das Benutzerhandbuch (docs/handbuch) auf.
//
// Voraussetzung: frische lokale Entwicklungsumgebung (siehe README.md in
// diesem Ordner). Das Skript legt zuerst Demo-Daten an (seed.mjs) und
// fotografiert danach jede Ansicht als die Person, die sie im Alltag nutzt.
//
//   node capture.mjs                  # Demo-Daten anlegen und alle Bilder aufnehmen
//   node capture.mjs m-guthaben t-runde # nur ausgewählte Bilder (IDs siehe SHOTS)
//   node capture.mjs --reuse m-chat     # ohne neuen Seed, mit den Daten des letzten Laufs
//
// Der Seed läuft bei jedem Aufruf; deshalb vor jedem Lauf die Datenbanken
// zurücksetzen (siehe README.md).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { APP_URL, PEOPLE, login, seedAppData, seedKeycloakUsers } from './seed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '../../docs/handbuch/bilder');
// Ergebnis des letzten Seeds, damit `--reuse` einzelne Bilder ohne neuen Seed aufnimmt.
const SEED_FILE = join(HERE, '.seed.json');

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const TABLET = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 };

const settle = async (page) => {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
};

const open = async (page, path) => {
  await page.goto(`${APP_URL}${path}`);
  await settle(page);
};

/** Scrollt eine Überschrift knapp unter die Kopfzeile. */
const scrollToHeading = async (page, text, offset = 72) => {
  const heading = page.getByRole('heading', { name: text }).first();
  const target = (await heading.count()) > 0 ? heading : page.getByText(text, { exact: true }).first();
  await target.evaluate((el, offset) => {
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'instant' });
  }, offset);
  await page.waitForTimeout(300);
};

/** Öffnet am Terminal den Stammtisch und wählt optional einen Artikel. */
const openTerminal = async (page, article) => {
  await open(page, '/tablet');
  await page.getByRole('button', { name: 'Auswählen' }).first().click();
  await settle(page);
  if (!article) return;
  await page.locator('.quickbook-drink').click();
  await page.locator('.overlay-card').filter({ hasText: article }).first().click();
  await page.getByRole('button', { name: 'Auswahl bestätigen' }).click();
  await page.waitForTimeout(300);
};

/**
 * Bildliste. `who` ist die angemeldete Person, `device` die Bildschirmgröße,
 * `run` bereitet die Ansicht vor. `data` enthält IDs aus dem Seed.
 */
const SHOTS = [
  // Erste Schritte
  { id: 'login', who: null, device: PHONE, run: async (page) => open(page, '/') },
  { id: 'start', who: 'member', device: PHONE, run: async (page) => open(page, '/dashboard') },
  {
    id: 'mehr',
    who: 'member',
    device: PHONE,
    run: async (page) => {
      await open(page, '/dashboard');
      await page.getByRole('button', { name: 'Mehr' }).click();
      await page.waitForTimeout(500);
    },
  },
  {
    id: 'profil',
    who: 'member',
    device: PHONE,
    run: async (page) => open(page, '/profile'),
  },
  {
    id: 'profil-geraet',
    who: 'member',
    device: PHONE,
    run: async (page) => {
      await open(page, '/profile');
      await scrollToHeading(page, 'Sprache', 72);
    },
  },

  // Mitglied
  { id: 'm-events', who: 'member', device: PHONE, run: async (page) => open(page, '/events') },
  {
    id: 'm-event',
    who: 'member',
    device: PHONE,
    run: async (page, data) => open(page, `/events/${data.events.stammtisch.id}`),
  },
  {
    id: 'm-event-chat',
    who: 'member',
    device: PHONE,
    run: async (page, data) => {
      await open(page, `/events/${data.events.stammtisch.id}`);
      await scrollToHeading(page, 'Event-Chat');
    },
  },
  {
    id: 'm-event-neu',
    who: 'member',
    device: PHONE,
    run: async (page) => {
      await open(page, '/events/new');
      await page.getByRole('textbox', { name: 'Titel' }).fill('Grillabend am Vereinsheim');
      await page.getByRole('textbox', { name: 'Beschreibung' }).fill('Jeder bringt etwas für das Buffet mit, Getränke gibt es an der Theke.');
      await page.getByRole('textbox', { name: 'Ort', exact: true }).fill('Vereinsheim, Terrasse');
      await page.getByLabel('Beginn', { exact: false }).first().fill('2026-10-24T18:00');
      await page.locator(':focus').evaluate((el) => el.blur());
      await page.waitForTimeout(300);
    },
  },
  {
    id: 'm-event-neu-einladen',
    who: 'member',
    device: PHONE,
    run: async (page) => {
      await open(page, '/events/new');
      await page.getByRole('checkbox', { name: 'Jonas Keller' }).check();
      await page.getByRole('checkbox', { name: 'Mia Schulz' }).check();
      await scrollToHeading(page, 'Eingeladene', 90);
    },
  },
  { id: 'm-chat', who: 'member', device: PHONE, run: async (page) => open(page, '/chat') },
  {
    id: 'm-gruppenchat',
    who: 'member',
    device: PHONE,
    run: async (page) => {
      await open(page, '/chat');
      await page.locator('button.chat-conversation').first().click();
      await settle(page);
    },
  },
  { id: 'm-direkt', who: 'member', device: PHONE, run: async (page) => open(page, '/direktnachrichten') },
  { id: 'm-statistik', who: 'member', device: PHONE, run: async (page) => open(page, '/statistik') },
  { id: 'm-guthaben', who: 'member', device: PHONE, run: async (page) => open(page, '/wallet') },
  { id: 'm-kaeufe', who: 'member', device: PHONE, run: async (page) => open(page, '/purchases') },
  { id: 'm-mitteilungen', who: 'member', device: PHONE, run: async (page) => open(page, '/notifications') },
  {
    id: 'm-moments',
    who: 'member',
    device: PHONE,
    run: async (page, data) => open(page, `/events/${data.events.stammtisch.id}/moments`),
  },
  {
    id: 'm-moment-reagieren',
    who: 'member',
    device: PHONE,
    run: async (page, data) => {
      await open(page, `/events/${data.events.stammtisch.id}/moments`);
      await scrollToHeading(page, 'Prost auf den Vereinsabend!');
      await page.getByText('Schnell reagieren:').first().evaluate((el) => {
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 200, behavior: 'instant' });
      });
      await page.waitForTimeout(300);
    },
  },
  { id: 'm-katalog', who: 'member', device: PHONE, run: async (page) => open(page, '/catalog') },
  {
    id: 'm-bezahlen',
    who: 'member',
    device: PHONE,
    run: async (page) => {
      await open(page, '/scan');
      await page.getByRole('textbox').first().fill('4001234500011');
    },
  },
  {
    id: 'm-bezahlen-bestaetigen',
    who: 'member',
    device: PHONE,
    run: async (page) => {
      await page.getByRole('button', { name: 'Suchen' }).click();
      await settle(page);
    },
  },
  {
    id: 'm-bezahlen-fertig',
    who: 'member',
    device: PHONE,
    run: async (page) => {
      await page.getByRole('button', { name: /bezahlen$/ }).click();
      await settle(page);
    },
  },

  // Vorstand
  { id: 'v-uebersicht', who: 'board', device: PHONE, run: async (page) => open(page, '/board') },
  { id: 'v-kasse', who: 'board', device: PHONE, run: async (page) => open(page, '/board/treasury') },
  {
    id: 'v-abrechnung',
    who: 'board',
    device: PHONE,
    run: async (page) => {
      await open(page, '/board/treasury');
      await page.locator('li').filter({ hasText: 'Stammtisch Oktober' }).getByRole('button', { name: 'Abrechnung' }).click();
      await settle(page);
      await page.getByText('Eventabrechnung', { exact: true }).evaluate((el) => {
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 420, behavior: 'instant' });
      });
      await page.waitForTimeout(300);
    },
  },
  {
    id: 'v-kasse-buchen',
    who: 'board',
    device: PHONE,
    run: async (page) => {
      await open(page, '/board/treasury');
      await page.getByText('Lena Hoffmann', { exact: true }).first().click();
      await settle(page);
      await scrollToHeading(page, 'Guthaben aufladen', 330);
    },
  },
  {
    id: 'v-event-teilnehmer',
    who: 'board',
    device: PHONE,
    run: async (page, data) => {
      await open(page, `/events/${data.events.stammtisch.id}/manage`);
      await scrollToHeading(page, /^Teilnehmer & Anwesenheit/);
    },
  },
  {
    id: 'v-event-verwalten',
    who: 'board',
    device: PHONE,
    run: async (page, data) => open(page, `/events/${data.events.stammtisch.id}/manage`),
  },
  {
    id: 'v-event-getraenke',
    who: 'board',
    device: PHONE,
    run: async (page, data) => {
      await open(page, `/events/${data.events.stammtisch.id}/manage`);
      await scrollToHeading(page, /^Getränke \(/);
    },
  },
  {
    id: 'v-event-einladungen',
    who: 'board',
    device: PHONE,
    run: async (page, data) => {
      await open(page, `/events/${data.events.stammtisch.id}/manage`);
      await scrollToHeading(page, /^Einladungen \(/);
    },
  },
  {
    id: 'v-event-chat',
    who: 'board',
    device: PHONE,
    run: async (page, data) => {
      await open(page, `/events/${data.events.stammtisch.id}/manage`);
      await scrollToHeading(page, /^Event-Chat \(/);
    },
  },
  {
    id: 'v-katalog-freigabe',
    who: 'board',
    device: PHONE,
    run: async (page) => {
      await open(page, '/catalog');
      await page.getByText('Cola Zero 0,33 l').first().evaluate((el) => {
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: 'instant' });
      });
      await page.waitForTimeout(300);
    },
  },
  {
    id: 'v-getraenk-bearbeiten',
    who: 'board',
    device: PHONE,
    run: async (page) => {
      await open(page, '/catalog');
      await page.locator('article, li, .card').filter({ hasText: 'Helles 0,5 l' }).getByRole('button', { name: 'Bearbeiten' }).first().click();
      await settle(page);
    },
  },
  { id: 'v-getraenkelisten', who: 'board', device: PHONE, run: async (page) => open(page, '/sublists') },
  { id: 'v-kommunikation', who: 'board', device: PHONE, run: async (page) => open(page, '/board/communications') },
  {
    id: 'v-rundbrief',
    who: 'board',
    device: PHONE,
    run: async (page) => {
      await open(page, '/board/communications');
      await scrollToHeading(page, 'Meldung verfassen');
    },
  },

  // Administration (am Rechner)
  { id: 'a-mitglieder', who: 'admin', device: DESKTOP, run: async (page) => open(page, '/admin') },
  {
    id: 'a-bearbeiten',
    who: 'admin',
    device: DESKTOP,
    run: async (page) => {
      await open(page, '/admin');
      await page.getByRole('row', { name: /Jonas Keller/ }).getByRole('button', { name: 'Bearbeiten' }).click();
      await settle(page);
      await scrollToHeading(page, 'Jonas Keller bearbeiten', 90);
    },
  },

  {
    id: 'a-einladen',
    who: 'admin',
    device: DESKTOP,
    run: async (page, data) => {
      await open(page, '/admin');
      await page.getByRole('button', { name: /Mitglied einladen/ }).first().click();
      await page.getByPlaceholder('z. B. Anna Neumann').fill('Anna Neumann');
      await page.getByRole('button', { name: 'Link erstellen' }).click();
      await settle(page);
      data.registerLink = await page.getByRole('textbox', { name: 'Einladungslink' }).inputValue().catch(() => null);
    },
  },

  // Thekenterminal (Tablet quer)
  { id: 't-event-waehlen', who: 'theke', device: TABLET, run: async (page) => open(page, '/tablet') },
  {
    id: 't-artikel',
    who: 'theke',
    device: TABLET,
    run: async (page) => {
      await openTerminal(page);
      await page.locator('.quickbook-drink').click();
      await page.locator('.overlay-card').filter({ hasText: 'Helles' }).first().click();
      await page.waitForTimeout(300);
    },
  },
  {
    id: 't-strichliste',
    who: 'theke',
    device: TABLET,
    run: async (page) => {
      await openTerminal(page, 'Helles');
      await scrollToHeading(page, 'Strichliste', 120);
    },
  },
  {
    id: 't-strich-rueckgaengig',
    who: 'theke',
    device: TABLET,
    run: async (page) => {
      await openTerminal(page, 'Helles');
      await page.locator('app-strichliste-row').filter({ hasText: 'Felix Braun' }).getByRole('button').last().click();
      await settle(page);
      await scrollToHeading(page, 'Strichliste', 120);
    },
  },
  {
    id: 't-runde',
    who: 'theke',
    device: TABLET,
    run: async (page) => {
      await openTerminal(page, 'Helles');
      await page.getByRole('button', { name: /Runde ausgeben/ }).click();
      await page.waitForTimeout(500);
    },
  },

  // Gast
  {
    // Registrierung über den Einladungslink aus `a-einladen`.
    id: 'g-registrieren',
    who: null,
    device: PHONE,
    run: async (page, data) => {
      await page.goto(data.registerLink);
      await settle(page);
    },
  },
  {
    // Der Einladungslink wird beim Öffnen sofort eingelöst.
    id: 'g-event',
    who: null,
    device: PHONE,
    run: async (page, data) => {
      await page.goto(`${APP_URL}${data.inviteAcceptPath}`);
      await page.waitForURL(/\/guest\//);
      await settle(page);
    },
  },

  // Gruppen, Tarif und Getränkedatenbank
  { id: 'g-gruppe-eroeffnen', who: null, device: PHONE, run: async (page) => open(page, '/gruppe-eroeffnen') },
  { id: 'a-gruppe', who: 'admin', device: DESKTOP, run: async (page) => open(page, '/gruppe') },
  {
    id: 'a-rollen',
    who: 'admin',
    device: DESKTOP,
    run: async (page) => {
      await open(page, '/gruppe');
      await scrollToHeading(page, 'Rollen & Berechtigungen', 90);
    },
  },
  {
    id: 'a-tarif',
    who: 'admin',
    device: DESKTOP,
    run: async (page) => {
      await open(page, '/gruppe');
      await scrollToHeading(page, 'Tarif', 90);
    },
  },
  { id: 'v-getraenkedatenbank', who: 'board', device: PHONE, run: async (page) => open(page, '/catalog/library') },
  { id: 'v-moments-verwalten', who: 'board', device: PHONE, run: async (page) => open(page, '/board/moments') },

  { id: 'm-kalender', who: 'member', device: PHONE, run: async (page) => open(page, '/kalender') },
  { id: 'm-freunde', who: 'member', device: PHONE, run: async (page) => open(page, '/freunde') },

  // Kiosk-Modus: zuletzt, weil das Terminal danach gesperrt bleibt.
  {
    id: 't-kiosk-start',
    who: 'theke',
    device: TABLET,
    run: async (page) => {
      await openTerminal(page);
      await page.getByRole('button', { name: 'Kiosk-Modus starten' }).click();
      await page.waitForTimeout(400);
      const fields = page.locator('.kiosk-start-form input');
      await fields.nth(0).fill('Theke Vereinsheim');
      await fields.nth(1).fill('2468');
      await fields.nth(2).fill('2468');
      await page.waitForTimeout(300);
    },
  },
  {
    id: 't-kiosk-entsperren',
    who: 'theke',
    device: TABLET,
    run: async (page) => {
      await page.locator('.kiosk-start-form').getByRole('button', { name: /starten/i }).last().click();
      await settle(page);
      await page.getByRole('button', { name: 'Kiosk-Modus verlassen' }).click().catch(() => {});
      await page.waitForTimeout(500);
    },
  },
  {
    id: 'v-kiosk-geraete',
    who: 'board',
    device: PHONE,
    run: async (page) => {
      await open(page, '/board');
      await page.getByRole('button', { name: /Kiosk-Geräte/ }).click();
      await page.waitForTimeout(800);
    },
  },
];

async function main() {
  const reuse = process.argv.includes('--reuse');
  const only = process.argv.slice(2).filter((arg) => arg !== '--reuse');

  await mkdir(OUT_DIR, { recursive: true });
  await seedKeycloakUsers();

  // --lang: Datums- und Zeitfelder des Browsers im deutschen Format.
  const browser = await chromium.launch({ args: ['--lang=de-DE'], env: { ...process.env, LANG: 'de_DE.UTF-8', LANGUAGE: 'de' } });
  try {
    let data;
    if (reuse) {
      data = JSON.parse(await readFile(SEED_FILE, 'utf8'));
    } else {
      const seedSessions = {};
      for (const [key, person] of Object.entries(PEOPLE)) seedSessions[key] = await login(browser, person);
      data = await seedAppData(seedSessions);
      for (const session of Object.values(seedSessions)) await session.context.close();
      await writeFile(SEED_FILE, JSON.stringify(data));
    }

    // Je Person und Gerät eine angemeldete Sitzung, wiederverwendet über alle Bilder.
    const sessions = new Map();
    const pageFor = async (who, device) => {
      const key = `${who ?? 'anon'}:${device.viewport.width}`;
      if (!sessions.has(key)) {
        if (who) {
          sessions.set(key, (await login(browser, PEOPLE[who], device)).page);
        } else {
          const context = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', ...device });
          sessions.set(key, await context.newPage());
        }
      }
      return sessions.get(key);
    };

    for (const shot of SHOTS) {
      if (only.length && !only.includes(shot.id)) continue;
      const page = shot.who
        ? await pageFor(shot.who, shot.device)
        : await (await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', ...shot.device })).newPage();
      await shot.run(page, data);
      await page.screenshot({ path: join(OUT_DIR, `${shot.id}.png`) });
      console.log(`✓ ${shot.id}`);
    }
  } finally {
    await browser.close();
  }
}

await main();
