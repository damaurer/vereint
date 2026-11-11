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

/** Zweite Gruppe für die Seite „Gruppe wählen“; Felix leitet sie, Jonas ist Mitglied. */
export const SECOND_GROUP_NAME = 'Kegelclub Alle Neune';

/** Demo-Personen; die Passwörter existieren nur lokal. */
export const PEOPLE = {
  member: { username: 'member', password: process.env.KEYCLOAK_SEED_MEMBER_PASSWORD, firstName: 'Lena', lastName: 'Hoffmann' },
  board: { username: 'board', password: process.env.KEYCLOAK_SEED_BOARD_PASSWORD, firstName: 'Thomas', lastName: 'Berger' },
  admin: { username: 'admin', password: process.env.KEYCLOAK_SEED_ADMIN_PASSWORD, firstName: 'Sabine', lastName: 'Wolf' },
  jonas: { username: 'jonas', password: 'jonas-demo-2026', firstName: 'Jonas', lastName: 'Keller', roles: ['member'], create: true },
  mia: { username: 'mia', password: 'mia-demo-2026', firstName: 'Mia', lastName: 'Schulz', roles: ['member'], create: true },
  felix: { username: 'felix', password: 'felix-demo-2026', firstName: 'Felix', lastName: 'Braun', roles: ['member'], create: true },
  theke: { username: 'theke', password: 'theke-demo-2026', firstName: 'Theke', lastName: 'Vereinsheim', roles: ['tabletRecorder'], create: true },
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

  // Wie im Produktionsrealm: keine offene Registrierung, nur per Einladungslink.
  await call('PUT', '', { registrationAllowed: false });

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
  await acceptTerms(context, page);
  return { context, page };
}

/**
 * Demo-Konten stimmen der gültigen AGB-Fassung zu, sonst hält die App sie nach
 * dem Login auf der Zustimmungsseite fest. Wiederholt aufgerufen ändert das
 * nichts.
 */
async function acceptTerms(context, page) {
  const response = await context.request.post(`${APP_URL}/api/v1/users/me/terms`, {
    headers: { accept: 'application/json' },
    data: { acceptTerms: true },
  });
  if (!response.ok()) {
    throw new Error(`AGB-Zustimmung: ${response.status()} ${await response.text()}`);
  }
  if (new URL(page.url()).pathname === '/agb-zustimmen') {
    await page.goto(`${APP_URL}/`);
    await page.waitForLoadState('networkidle');
  }
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
    /** Lädt eine Datei als rohen Request-Körper hoch (Bilder und Videos eines Moments). */
    upload: (path, data, contentType) => request('POST', path, data, { 'content-type': contentType }),
  };
}

/** Zwei gezeichnete Demo-Fotos (JPEG), damit keine echten Bilder im Repository liegen müssen. */
async function demoPhotos(context) {
  const mug = (x, tilt) => `
    <g transform="translate(${x} 150) rotate(${tilt} 60 110)">
      <rect x="0" y="40" width="120" height="170" rx="14" fill="#f2b23a" stroke="#fff7e0" stroke-width="8"/>
      <path d="M120 80 h28 a22 22 0 0 1 22 22 v46 a22 22 0 0 1 -22 22 h-28" fill="none" stroke="#fff7e0" stroke-width="12"/>
      <path d="M-8 52 q10 -40 40 -26 q14 -30 44 -10 q30 -14 44 14 q14 20 -4 34 h-116 q-18 -2 -8 -12z" fill="#fffdf5"/>
      <rect x="26" y="96" width="12" height="90" rx="6" fill="#f7cd72"/><rect x="56" y="96" width="12" height="90" rx="6" fill="#f7cd72"/>
    </g>`;
  const scenes = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
      <defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2a20"/><stop offset="1" stop-color="#8a4b25"/></linearGradient></defs>
      <rect width="800" height="600" fill="url(#a)"/>
      <circle cx="140" cy="90" r="46" fill="#ffd98a" opacity=".55"/><circle cx="400" cy="60" r="34" fill="#ffd98a" opacity=".45"/><circle cx="660" cy="100" r="50" fill="#ffd98a" opacity=".5"/>
      <rect y="470" width="800" height="130" fill="#5a3418"/><rect y="470" width="800" height="14" fill="#74451f"/>
      ${mug(210, 14)}${mug(440, -14)}
      <path d="M392 150 l8 -34 M420 160 l22 -26 M368 162 l-18 -28" stroke="#fffdf5" stroke-width="8" stroke-linecap="round"/>
    </svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
      <defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fc7ee"/><stop offset="1" stop-color="#e9f4fb"/></linearGradient></defs>
      <rect width="800" height="600" fill="url(#b)"/>
      <circle cx="640" cy="120" r="56" fill="#ffe08a"/>
      <path d="M0 420 L170 210 L300 340 L450 150 L620 330 L800 230 V600 H0z" fill="#6f8f6a"/>
      <path d="M450 150 l38 40 l-30 -6 l-18 22 l-22 -24z" fill="#f7fbfd"/>
      <path d="M0 470 Q200 400 400 460 T800 440 V600 H0z" fill="#3f7a44"/>
      <rect x="250" y="440" width="300" height="20" rx="6" fill="#8a5a2b"/><rect x="280" y="460" width="16" height="80" fill="#6e4520"/><rect x="504" y="460" width="16" height="80" fill="#6e4520"/>
      <rect x="230" y="500" width="340" height="14" rx="6" fill="#8a5a2b"/>
    </svg>`,
  ];
  const page = await context.newPage();
  await page.setViewportSize({ width: 800, height: 600 });
  const photos = [];
  for (const svg of scenes) {
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    photos.push(await page.screenshot({ type: 'jpeg', quality: 82 }));
  }
  await page.close();
  return photos;
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
  // Strich-Kategorien: die Spalten der Strichliste am Thekenterminal. Der
  // Obstler bleibt ohne Kategorie und steht deshalb unter „Sonstiges“.
  const tallySpecs = [
    ['Bier', '3.00', ['Helles', 'Weißbier', 'Radler']],
    ['Alkoholfrei', '2.00', ['Apfelschorle', 'Spezi', 'Wasser']],
  ];
  for (const [name, price, prefixes] of tallySpecs) {
    const category = await api.board.post('/tally-categories', { name, price });
    for (const drink of drinks.filter((d) => prefixes.some((prefix) => d.name.startsWith(prefix)))) {
      await api.board.put(`/drinks/${drink.id}`, { tallyCategoryId: category.id });
    }
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
  // Eingeladene erhalten eine Einladung und antworten (Zusage, Vielleicht, Absage).
  const createEvent = async (owner, spec, invitees, status, answers = {}) => {
    const event = await api[owner].post('/events', spec);
    const userIds = invitees.filter((key) => key !== owner).map((key) => ids[key]);
    if (userIds.length > 0) await api[owner].post(`/events/${event.id}/invitations`, { userIds });
    // Antworten sind nur bei veröffentlichten Events möglich, danach folgt der Endstatus.
    await api[owner].put(`/events/${event.id}`, { status: 'published' });
    for (const key of invitees) {
      if (key === owner) continue;
      const answer = answers[key] ?? 'accepted';
      if (answer !== 'invited') await api[key].put(`/events/${event.id}/rsvp`, { status: answer });
    }
    if (status && status !== 'published') await api[owner].put(`/events/${event.id}`, { status });
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
    ['member', 'jonas', 'mia', 'felix'],
    'published',
    { mia: 'maybe', felix: 'declined' },
  );
  const weihnachten = await createEvent(
    'board',
    {
      title: 'Weihnachtsfeier',
      description: 'Jahresabschluss mit Ehrungen und Tombola.',
      location: 'Gasthaus Post, Saal',
      startsAt: at(60, 19, 0),
    },
    ['board', 'member', 'admin', 'jonas', 'mia', 'felix'],
    'published',
    { member: 'invited', mia: 'invited' },
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

  // Gruppenchat und Direktnachrichten.
  const clubChat = (await api.board.get('/conversations')).find((c) => c.type === 'club');
  const clubMessages = [
    ['board', 'Hallo zusammen, die Getränkeliste fürs Sommerfest ist abgerechnet. Danke an alle Helfer!'],
    ['jonas', 'Weiß jemand, ob der Schlüssel fürs Vereinsheim wieder beim Wirt liegt?'],
    ['admin', 'Ja, liegt hinter der Theke.'],
    ['mia', 'Für die Weihnachtsfeier suchen wir noch Preise für die Tombola 🎁'],
  ];
  if (clubChat) {
    for (const [key, message] of clubMessages) await api[key].post(`/conversations/${clubChat.id}/messages`, { message });
  }
  const direct = async (from, to, lines) => {
    const conversation = await api[from].post('/direct-conversations', { userId: ids[to] });
    for (const [key, message] of lines) await api[key].post(`/direct-conversations/${conversation.id}/messages`, { message });
  };
  await direct('member', 'jonas', [
    ['jonas', 'Hast du am Samstag noch einen Platz im Auto frei?'],
    ['member', 'Klar, ich hol dich um 8:15 ab.'],
  ]);
  await direct('board', 'member', [
    ['board', 'Danke fürs Aushelfen an der Theke letzte Woche!'],
  ]);

  // Ein Moment am laufenden Abend.
  try {
    const moment = await api.board.post('/moments', {
      eventId: stammtisch.id,
      title: 'Prost auf den Vereinsabend!',
      topicType: 'toast',
      message: 'Alle Gläser hoch 🍻',
      // Lang genug, damit der Moment auch bei späteren Aufnahmen mit `--reuse` noch läuft.
      durationMinutes: 240,
    });
    // Lena und Jonas hängen je ein Foto an ihre Reaktion, Mia stößt nur an.
    const [toastPhoto, viewPhoto] = await demoPhotos(sessions.member.context);
    const respond = async (key, statusText, photo) => {
      const mediaIds = photo ? [(await api[key].upload(`/moments/${moment.id}/media`, photo, 'image/jpeg')).id] : [];
      await api[key].post(`/moments/${moment.id}/responses`, { reaction: 'TOAST', statusText, mediaIds });
    };
    await respond('mia', 'Prost!');
    await respond('jonas', 'Gruß von der Terrasse', viewPhoto);
    await respond('member', 'Prost aus dem Vereinsheim!', toastPhoto);
  } catch (error) {
    console.warn(`Moment konnte nicht angelegt werden: ${error.message}`);
  }

  // Rundbrief und Infotafel vom Vorstand.
  await api.board.post('/notifications/broadcast', {
    allMembers: true,
    title: 'Mitgliederversammlung am 15. November',
    body: 'Die Einladung mit Tagesordnung hängt im Vereinsheim aus. Bitte sagt bis Monatsende zu.',
  });
  await api.board.put('/conversations/club/pin', {
    text: 'Mitgliederversammlung am 15. November um 19 Uhr im Vereinsheim.',
  });

  // Freunde: eine Freundschaft, eine Anfrage an Lena und eine eigene offene Anfrage.
  try {
    await api.jonas.post('/friends/requests', { userId: ids.member });
    await api.member.post(`/friends/requests/${ids.jonas}/accept`);
    await api.mia.post('/friends/requests', { userId: ids.member });
    await api.member.post('/friends/requests', { userId: ids.felix });
  } catch (error) {
    console.warn(`Freunde konnten nicht angelegt werden: ${error.message}`);
  }

  // Gast-Einladung für den Stammtisch (Link für die Gast-Anleitung).
  const invite = await api.board.post(`/events/${stammtisch.id}/invites`, { maxUses: 5, expiresInMinutes: 7 * 24 * 60, role: 'guest' });

  // Zweite Gruppe: Felix eröffnet sie, Jonas tritt per Einladungslink bei. Beide
  // sehen danach nach der Anmeldung die Seite „Gruppe wählen“. Steht am Ende,
  // weil Anfragen mit zwei Gruppen ohne Auswahl nicht mehr eindeutig sind.
  // Der Link bleibt gültig und zeigt den Beitritt mit bestehendem Konto.
  let groupJoinPath = null;
  try {
    const secondGroup = await api.felix.post('/stammtische', { name: SECOND_GROUP_NAME, acceptTerms: true });
    const selected = await sessions.felix.context.request.post(`${APP_URL}/api/auth/stammtisch`, {
      data: { stammtischId: secondGroup.id },
    });
    if (!selected.ok()) throw new Error(`Gruppe wählen: ${selected.status()}`);
    const groupInvite = await api.felix.post('/member-invites', { label: 'Neue Kegelfreunde', maxUses: 20, expiresInDays: 30 });
    await api.jonas.post('/member-invites/join', { token: groupInvite.token });
    groupJoinPath = groupInvite.registerPath;
  } catch (error) {
    console.warn(`Zweite Gruppe konnte nicht angelegt werden: ${error.message}`);
  }

  return { ids, events: { stammtisch, wanderung, weihnachten }, inviteAcceptPath: invite.acceptPath, groupJoinPath };
}
