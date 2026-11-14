import { lookup } from 'node:dns/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ensureUser } from './keycloak-admin';
import { AUTH_DIR, credentialsFile } from './paths';
import { withPasswords } from './users';

/**
 * Legt die Testbenutzer mit frischen Passwoertern in Keycloak an. Die Tests
 * melden sich damit jeweils selbst ueber die Login-Seite an (siehe
 * `support/fixtures.ts`).
 */
export default async function globalSetup(): Promise<void> {
  await lookup('vereint.test').catch(() => {
    throw new Error('vereint.test ist nicht aufloesbar: "127.0.0.1 vereint.test" in /etc/hosts eintragen.');
  });

  const all = withPasswords();
  for (const user of Object.values(all)) {
    await ensureUser(user);
  }
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(credentialsFile, JSON.stringify(all, null, 2), { mode: 0o600 });
}
