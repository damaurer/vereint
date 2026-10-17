// Demo-Daten für den lokalen Stack (local/vereint.mjs).
//
// Läuft im Container `seed` (local/compose.local.yaml) gegen
// http://localhost:4200. Der Produktionsrealm hat keine Benutzer; dieses
// Skript legt zuerst die Konten admin, board und member an und befüllt dann
// mit den Demo-Daten des Benutzerhandbuchs (scripts/handbook/seed.mjs) einen
// typischen Vereinsabend. Läuft nur, solange es die Demo-Person `jonas` noch
// nicht gibt, ein zweiter Aufruf ändert also nichts.

import { chromium } from 'playwright';
import { PEOPLE, login, seedAppData, seedKeycloakUsers } from '../scripts/handbook/seed.mjs';

const KEYCLOAK_URL = process.env.HANDBOOK_KEYCLOAK_URL;
const REALM = 'vereint';

/** Konten wie im Entwicklungsrealm (keycloak/dev), mit ihren Realmrollen. */
const BASE_ACCOUNTS = {
  admin: ['admin', 'board', 'member'],
  board: ['board', 'treasurer', 'member'],
  member: ['member'],
};

async function adminCall(token, method, path, body) {
  const response = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok && response.status !== 409) {
    throw new Error(`Keycloak ${method} ${path}: ${response.status} ${await response.text()}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function adminToken() {
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

async function createBaseAccounts(token) {
  for (const [username, roleNames] of Object.entries(BASE_ACCOUNTS)) {
    const [existing] = await adminCall(token, 'GET', `/users?exact=true&username=${username}`);
    if (existing) continue;
    await adminCall(token, 'POST', '/users', {
      username,
      enabled: true,
      emailVerified: true,
      email: `${username}@vereint.local`,
      firstName: PEOPLE[username].firstName,
      lastName: PEOPLE[username].lastName,
      credentials: [{ type: 'password', value: PEOPLE[username].password, temporary: false }],
    });
    const [user] = await adminCall(token, 'GET', `/users?exact=true&username=${username}`);
    const roles = [];
    for (const roleName of roleNames) roles.push(await adminCall(token, 'GET', `/roles/${roleName}`));
    await adminCall(token, 'POST', `/users/${user.id}/role-mappings/realm`, roles);
  }
}

const token = await adminToken();
const [alreadySeeded] = await adminCall(token, 'GET', '/users?exact=true&username=jonas');
if (alreadySeeded) {
  console.log('Demo-Daten sind schon vorhanden.');
  process.exit(0);
}

console.log('Lege Konten und Demo-Daten an ...');
await createBaseAccounts(token);
await seedKeycloakUsers();

const browser = await chromium.launch();
try {
  const sessions = {};
  for (const [key, person] of Object.entries(PEOPLE)) sessions[key] = await login(browser, person);
  await seedAppData(sessions);
} finally {
  await browser.close();
}
console.log('Demo-Daten angelegt.');
