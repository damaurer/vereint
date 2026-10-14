import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Zugriff auf die Keycloak-Admin-API des E2E-Stacks. Die Admin-Konsole ist
 * wie in Produktion nur ueber localhost:8082 erreichbar, nicht ueber Caddy.
 */

const ADMIN_BASE = process.env.E2E_KEYCLOAK_ADMIN_URL ?? 'http://localhost:8082/kc';
const REALM = 'vereint';

export function stackEnv(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  const file = fileURLToPath(new URL('../.env.e2e', import.meta.url));
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} fehlt in e2e/.env.e2e (Stack mit e2e/stack.sh up starten)`);
  return line.slice(name.length + 1);
}

async function adminToken(): Promise<string> {
  const response = await fetch(`${ADMIN_BASE}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: 'admin',
      password: stackEnv('KEYCLOAK_ADMIN_PASSWORD'),
    }),
  });
  if (!response.ok) throw new Error(`Keycloak-Admin-Login fehlgeschlagen (${response.status})`);
  return ((await response.json()) as { access_token: string }).access_token;
}

async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await adminToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  return fetch(`${ADMIN_BASE}/admin/realms/${REALM}${path}`, { ...init, headers });
}

export interface TestUser {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  roles: string[];
}

/** Legt einen Benutzer an (oder setzt ihn zurueck) und weist die Realm-Rollen zu. */
export async function ensureUser(user: TestUser): Promise<void> {
  let response = await adminFetch(`/users?exact=true&username=${encodeURIComponent(user.username)}`);
  let [existing] = (await response.json()) as { id: string }[];
  if (!existing) {
    response = await adminFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: user.username,
        email: `${user.username}@vereint.test`,
        emailVerified: true,
        firstName: user.firstName,
        lastName: user.lastName,
        enabled: true,
      }),
    });
    if (response.status !== 201) {
      throw new Error(`Benutzer ${user.username} nicht angelegt (${response.status}: ${await response.text()})`);
    }
    response = await adminFetch(`/users?exact=true&username=${encodeURIComponent(user.username)}`);
    [existing] = (await response.json()) as { id: string }[];
  }

  // Passwort bei jedem Lauf neu setzen (auch fuer schon vorhandene Benutzer).
  response = await adminFetch(`/users/${existing.id}/reset-password`, {
    method: 'PUT',
    body: JSON.stringify({ type: 'password', value: user.password, temporary: false }),
  });
  if (!response.ok) throw new Error(`Passwort fuer ${user.username} nicht gesetzt (${response.status})`);

  const roles = await Promise.all(
    user.roles.map(async (name) => {
      const r = await adminFetch(`/roles/${encodeURIComponent(name)}`);
      if (!r.ok) throw new Error(`Rolle ${name} fehlt im Realm (${r.status})`);
      return r.json();
    }),
  );
  response = await adminFetch(`/users/${existing.id}/role-mappings/realm`, {
    method: 'POST',
    body: JSON.stringify(roles),
  });
  if (!response.ok) throw new Error(`Rollen fuer ${user.username} nicht gesetzt (${response.status})`);
}
