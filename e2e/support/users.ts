import { randomBytes } from 'node:crypto';
import type { TestUser } from './keycloak-admin';

/**
 * Testbenutzer. Der Produktions-Realm enthaelt keine Seed-Benutzer; die
 * Benutzer entstehen im globalen Setup ueber die Keycloak-Admin-API. Die
 * Passwoerter werden pro Lauf erzeugt.
 */
const password = () => `E2e-${randomBytes(12).toString('base64url')}`;

export const users = {
  admin: { username: 'e2e-admin', firstName: 'Ada', lastName: 'Admin', roles: ['admin', 'board', 'member'] },
  board: { username: 'e2e-board', firstName: 'Bert', lastName: 'Vorstand', roles: ['board', 'treasurer', 'member'] },
  member: { username: 'e2e-member', firstName: 'Mia', lastName: 'Mitglied', roles: ['member'] },
  member2: { username: 'e2e-member2', firstName: 'Max', lastName: 'Mitglied', roles: ['member'] },
  terminal: { username: 'e2e-terminal', firstName: 'Theke', lastName: 'Terminal', roles: ['tabletRecorder'] },
} satisfies Record<string, Omit<TestUser, 'password'>>;

export type Role = keyof typeof users;

export function withPasswords(): Record<Role, TestUser> {
  return Object.fromEntries(
    Object.entries(users).map(([role, user]) => [role, { ...user, password: password() }]),
  ) as Record<Role, TestUser>;
}
