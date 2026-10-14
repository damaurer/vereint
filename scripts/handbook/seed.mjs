// Demo-Daten für die Handbuch-Screenshots.
//
// Läuft ausschließlich gegen die lokale Entwicklungsumgebung
// (docker compose + Fachservice + Webservice auf localhost). Legt in Keycloak
// realistische Vereinsmitglieder an und befüllt über die normale API
// (same-origin über den Webservice) Getränke, Events, Guthaben, Striche,
// Chat, Moments und Mitteilungen. Alle Schritte sind idempotent genug, um das
// Skript auf einer frischen Datenbank einmal auszuführen.

import { randomUUID } from 'node:crypto';

// Uhrzeiten der Demo-Events gelten in Vereinszeit, unabhängig vom Rechner.
process.env.TZ = 'Europe/Berlin';

export const APP_URL = process.env.HANDBOOK_APP_URL ?? 'http://localhost:4200';
const KEYCLOAK_URL = process.env.HANDBOOK_KEYCLOAK_URL ?? 'http://localhost:8082';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM ?? 'vereint';

/** Demo-Personen; die Passwörter existieren nur lokal. */
export const PEOPLE = {
  member: { username: 'member', password: process.env.KEYCLOAK_SEED_MEMBER_PASSWORD, firstName: 'Lena', lastName: 'Hoffmann' },
  board: { username: 'board', password: process.env.KEYCLOAK_SEED_BOARD_PASSWORD, firstName: 'Thomas', lastName: 'Berger' },
  admin: { username: 'admin', password: process.env.KEYCLOAK_SEED_ADMIN_PASSWORD, firstName: 'Sabine', lastName: 'Wolf' },
  jonas: { username: 'jonas', password: 'jonas-demo', firstName: 'Jonas', lastName: 'Keller', roles: ['member'], create: true },
  mia: { username: 'mia', password: 'mia-demo', firstName: 'Mia', lastName: 'Schulz', roles: ['member'], create: true },
  felix: { username: 'felix', password: 'felix-demo', firstName: 'Felix', lastName: 'Braun', roles: ['member'], create: true },
  theke: { username: 'theke', password: 'theke-demo', firstName: 'Theke', lastName: 'Vereinsheim', roles: ['tabletRecorder'], create: true },
};

async function keycloakAdminToken() {
  const response = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: process.env.KEYCLOAK_ADMIN ?? 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? '',
    }),
  });
  if (!response.ok) throw new Error(`Keycloak-Admin-Login fehlgeschlagen: ${response.status}`);
  return (await response.json()).access_token;
}

/** Benennt die Seed-Benutzer um und legt die zusätzlichen Demo-Personen an. */
export async function seedKeycloakUsers() {
  const token = await keycloakAdminToken();
  const base = `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}`;
  const call = async (method, path, body) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok && response.status !== 409) {
      throw new Error(`Keycloak ${method} ${path}: ${response.status} ${await response.text()}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };

  for (const person of Object.values(PEOPLE)) {
    let [user] = await call('GET', `/users?exact=true&username=${person.username}`);
    if (!user && person.create) {
      await call('POST', '/users', {
        username: person.username,
        enabled: true,
        emailVerified: true,
        email: `${person.username}@vereint.local`,
        firstName: person.firstName,
        lastName: person.lastName,
        credentials: [{ type: 'password', value: person.password, temporary: false }],
      });
      [user] = await call('GET', `/users?exact=true&username=${person.username}`);
      const roles = [];
      for (const roleName of person.roles ?? []) roles.push(await call('GET', `/roles/${roleName}`));
      if (roles.length) await call('POST', `/users/${user.id}/role-mappings/realm`, roles);
    }
    if (!user) throw new Error(`Keycloak-Benutzer ${person.username} fehlt`);
    await call('PUT', `/users/${user.id}`, {
      ...user,
      firstName: person.firstName,
      lastName: person.lastName,
      email: user.email ?? `${person.username}@vereint.local`,
    });
  }
}

/** Meldet eine Person über den Keycloak-Login der App an. */
export async function login(browser, person, contextOptions = {}) {
  const context = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', ...contextOptions });
  const page = await context.newPage();
  await page.goto(`${APP_URL}/`);
  await page.fill('#username', person.username);
  await page.fill('#password', person.password);
  await page.click('#kc-login');
  await page.waitForURL((url) => url.origin === new URL(APP_URL).origin && !url.pathname.startsWith('/api/'));
  await page.waitForLoadState('networkidle');
  return { context, page };
}

/** Kleiner API-Client über die Session-Cookies einer angemeldeten Person. */
export function apiFor(context) {
  const request = async (method, path, body, extraHeaders = {}) => {
    const response = await context.request.fetch(`${APP_URL}/api/v1${path}`, {
      method,
      headers: { accept: 'application/json', ...extraHeaders },
      data: body,
    });
    if (!response.ok()) {
      throw new Error(`${method} ${path}: ${response.status()} ${await response.text()}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body ?? {}),
    postIdempotent: (path, body) => request('POST', path, body ?? {}, { 'Idempotency-Key': randomUUID() }),
    put: (path, body) => request('PUT', path, body ?? {}),
  };
}

const day = 24 * 60 * 60 * 1000;
const at = (offsetDays, hour, minute = 0) => {
  const date = new Date(Date.now() + offsetDays * day);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

/**
 * Befüllt die Anwendung mit einem typischen Vereinsabend.
 * `sessions` enthält die angemeldeten Kontexte je Person (Schlüssel wie PEOPLE).
 */
export async function seedAppData(sessions) {
  const api = Object.fromEntries(Object.entries(sessions).map(([key, s]) => [key, apiFor(s.context)]));
  const ids = {};
  for (const key of Object.keys(sessions)) {
    if (key === 'theke') continue;
    ids[key] = (await api[key].get('/users/me')).id;
  }

  // Getränke- und Speisenkatalog (Vorstand schlägt vor und gibt frei).
  const drinkSpecs = [
    ['Helles 0,5 l', 'Bier', '3.50', '1.10', '4001234500011'],
    ['Weißbier 0,5 l', 'Bier', '3.80', '1.25', '4001234500028'],
    ['Radler 0,5 l', 'Bier', '3.20', '1.00', '4001234500035'],
    ['Apfelschorle 0,5 l', 'Alkoholfrei', '2.50', '0.70', '4001234500042'],
    ['Spezi 0,5 l', 'Alkoholfrei', '2.50', '0.75', '4001234500059'],
    ['Wasser 0,5 l', 'Alkoholfrei', '1.50', '0.35', '4001234500066'],
    ['Obstler 2 cl', 'Schnaps', '2.00', '0.60', '4001234500073'],
  ];
  const drinks = [];
  for (const [name, category, price, cost, barcode] of drinkSpecs) {
    const drink = await api.board.post('/drinks', { name, category, defaultPrice: price, costPrice: cost });
    if (drink.status !== 'approved') await api.board.post(`/drinks/${drink.id}/approve`);
    await api.board.post(`/drinks/${drink.id}/barcodes`, { barcode });
    drinks.push(drink);
  }
  // Ein offener Vorschlag eines Mitglieds für die Freigabe-Ansicht.
  await api.member.post('/drinks', { name: 'Cola Zero 0,33 l', category: 'Alkoholfrei', defaultPrice: '2.00', description: 'Wäre schön für die Fahrer.' });

  const foodSpecs = [
    ['Brezel', 'Snack', '1.80', '0.60'],
    ['Wurstsemmel', 'Brotzeit', '3.00', '1.20'],
    ['Käsespätzle', 'Warm', '7.50', '2.80'],
  ];
  const foods = [];
  for (const [name, category, price, cost] of foodSpecs) {
    foods.push(await api.board.post('/food', { name, category, defaultPrice: price, costPrice: cost }));
  }

  const sublist = await api.board.post('/sublists', { name: 'Stammtisch-Standard', description: 'Die üblichen Getränke für den Vereinsabend.' });
  for (const drink of drinks) await api.board.post(`/sublists/${sublist.id}/items`, { drinkId: drink.id });

  // Events.
  const allMembers = ['member', 'board', 'admin', 'jonas', 'mia', 'felix'];
  const createEvent = async (owner, spec, participants, status) => {
    const event = await api[owner].post('/events', spec);
    for (const key of participants) {
      if (key === owner) continue;
      await api[owner].post(`/events/${event.id}/participants`, { userId: ids[key], role: 'participant' });
    }
    if (status) await api[owner].put(`/events/${event.id}`, { status });
    return event;
  };

  const stammtisch = await createEvent(
    'board',
    {
      title: 'Stammtisch Oktober',
      description: 'Unser monatlicher Vereinsabend im Vereinsheim. Es gibt Käsespätzle!',
      location: 'Vereinsheim, Hauptstraße 12',
      startsAt: at(0, 18, 30),
      endsAt: at(0, 23, 30),
    },
    allMembers,
    'active',
  );
  await api.board.post(`/events/${stammtisch.id}/drinks/assign-sublist`, { sublistId: sublist.id });
  for (const food of foods) await api.board.post(`/events/${stammtisch.id}/food`, { foodId: food.id });

  const wanderung = await createEvent(
    'member',
    {
      title: 'Herbstwanderung zur Kampenwand',
      description: 'Gemütliche Tour mit Einkehr. Treffpunkt am Parkplatz, Fahrgemeinschaften im Chat.',
      location: 'Parkplatz Aschau',
      startsAt: at(4, 9, 0),
      endsAt: at(4, 17, 0),
    },
    ['member', 'jonas', 'mia'],
    'published',
  );
  const weihnachten = await createEvent(
    'board',
    {
      title: 'Weihnachtsfeier',
      description: 'Jahresabschluss mit Ehrungen und Tombola.',
      location: 'Gasthaus Post, Saal',
      startsAt: at(60, 19, 0),
    },
    ['board', 'admin', 'jonas', 'mia', 'felix'],
    'published',
  );
  await createEvent(
    'board',
    {
      title: 'Sommerfest',
      description: 'Grillen und Spiele am Vereinsgelände.',
      location: 'Vereinsgelände',
      startsAt: at(-90, 14, 0),
      endsAt: at(-90, 22, 0),
    },
    allMembers,
    'completed',
  );

  // Guthaben aufladen (Kasse).
  const topups = { member: '50.00', board: '40.00', admin: '30.00', jonas: '25.00', mia: '20.00', felix: '15.00' };
  for (const [key, amount] of Object.entries(topups)) {
    await api.board.postIdempotent('/ledger/topups', { memberId: ids[key], amount, currency: 'EUR', note: 'Bareinzahlung Stammtisch' });
  }

  // Striche an der Theke für den laufenden Abend.
  const eventDrinks = await api.board.get(`/events/${stammtisch.id}/drinks`);
  const eventFood = await api.board.get(`/events/${stammtisch.id}/food`);
  const drinkByName = (prefix) => eventDrinks.find((d) => d.drinkName.startsWith(prefix));
  const tallies = [
    ['member', 'Helles'], ['member', 'Helles'], ['member', 'Apfelschorle'],
    ['jonas', 'Weißbier'], ['jonas', 'Weißbier'], ['jonas', 'Obstler'],
    ['mia', 'Spezi'], ['mia', 'Radler'],
    ['felix', 'Helles'], ['board', 'Wasser'], ['admin', 'Radler'],
  ];
  if (sessions.theke) {
    const tablet = apiFor(sessions.theke.context);
    for (const [key, prefix] of tallies) {
      await tablet.postIdempotent(`/tablet/events/${stammtisch.id}/purchases`, { memberId: ids[key], eventDrinkId: drinkByName(prefix).id });
    }
    const spaetzle = eventFood.find((f) => (f.foodName ?? f.name ?? '').startsWith('Käsespätzle'));
    if (spaetzle) {
      await tablet.postIdempotent(`/tablet/events/${stammtisch.id}/purchases`, { memberId: ids.member, eventFoodId: spaetzle.id });
    }
  }

  // Chat am Stammtisch und bei der Wanderung.
  const chat = [
    [stammtisch, 'board', 'Servus zusammen! Heute ab 18:30 im Vereinsheim, die Spätzle sind bestellt.'],
    [stammtisch, 'jonas', 'Bin dabei, bringe noch zwei Gäste mit 🙂'],
    [stammtisch, 'mia', 'Komme etwas später, so gegen 19:30.'],
    [stammtisch, 'member', 'Super, dann bis heute Abend!'],
    [wanderung, 'member', 'Wer fährt mit? Ich habe noch drei Plätze frei.'],
    [wanderung, 'jonas', 'Ich nehme einen Platz, danke!'],
  ];
  for (const [event, key, message] of chat) {
    await api[key].post(`/events/${event.id}/chat/messages`, { message });
  }

  // Ein Moment am laufenden Abend.
  try {
    const moment = await api.board.post(`/events/${stammtisch.id}/moments`, {
      title: 'Prost auf den Vereinsabend!',
      topicType: 'toast',
      message: 'Alle Gläser hoch 🍻',
    });
    for (const key of ['member', 'jonas', 'mia']) {
      await api[key].post(`/events/${stammtisch.id}/moments/${moment.id}/responses`, { reaction: 'TOAST', statusText: 'Prost!' });
    }
  } catch (error) {
    console.warn(`Moment konnte nicht angelegt werden: ${error.message}`);
  }

  // Mitteilungen vom Vorstand.
  for (const key of ['member', 'jonas', 'mia', 'felix']) {
    await api.board.post('/notifications', {
      userId: ids[key],
      title: 'Mitgliederversammlung am 15. November',
      body: 'Die Einladung mit Tagesordnung hängt im Vereinsheim aus. Bitte sagt bis Monatsende zu.',
      type: 'announcement',
    });
  }

  // Gast-Einladung für den Stammtisch (Link für die Gast-Anleitung).
  const invite = await api.board.post(`/events/${stammtisch.id}/invites`, { maxUses: 5, expiresInMinutes: 7 * 24 * 60, role: 'guest' });

  return { ids, events: { stammtisch, wanderung, weihnachten }, inviteAcceptPath: invite.acceptPath };
}
