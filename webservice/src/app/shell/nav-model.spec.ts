import { describe, expect, it } from 'vitest';
import { AuthSessionUser } from '../auth/auth.types';
import {
  buildPanelNav,
  buildPrimaryNav,
  STATISTICS_PERMISSION,
  TABLET_PERMISSION,
} from './nav-model';

/**
 * Nachweis der rollen-/permissionbasierten Navigationsableitung (TICKET-032).
 * Fehlt eine geforderte Rolle oder Permission, wird der Eintrag ausgeblendet
 * (`deny by default`).
 */

function session(partial: Partial<AuthSessionUser>): AuthSessionUser {
  return {
    uid: 'u-1',
    email: null,
    provider: 'keycloak',
    roles: ['member'],
    permissions: [],
    ...partial,
  };
}

const ids = (items: { id: string }[]): string[] => items.map((item) => item.id);

describe('nav-model', () => {
  it('shows base primary items to any member and hides gated ones (deny by default)', () => {
    const items = buildPrimaryNav(session({ roles: ['member'], permissions: [] }));
    expect(ids(items)).toContain('home');
    expect(ids(items)).toContain('strichliste');
    expect(ids(items)).toContain('chat');
    expect(ids(items)).toContain('profil');
    expect(ids(items)).not.toContain('statistik');
  });

  it('reveals the statistics entry only with the statistics permission', () => {
    const items = buildPrimaryNav(
      session({ roles: ['member'], permissions: [STATISTICS_PERMISSION] }),
    );
    expect(ids(items)).toContain('statistik');
  });

  it('hides all panel entries for a plain member', () => {
    const items = buildPanelNav(session({ roles: ['member'], permissions: [] }));
    expect(items).toEqual([]);
  });

  it('shows board panels to board and admin roles', () => {
    const board = buildPanelNav(session({ roles: ['board'], permissions: [] }));
    expect(ids(board)).toEqual(['board', 'treasury', 'communications']);

    const admin = buildPanelNav(session({ roles: ['admin'], permissions: [] }));
    expect(ids(admin)).toContain('admin');
    expect(ids(admin)).toContain('board');
  });

  it('shows the tablet terminal entry only with the tablet permission', () => {
    const withPermission = buildPanelNav(
      session({ roles: ['member'], permissions: [TABLET_PERMISSION] }),
    );
    expect(ids(withPermission)).toEqual(['tablet']);
  });

  it('renders only unrestricted entries without a session (deny by default)', () => {
    const primary = buildPrimaryNav(null);
    expect(ids(primary)).toEqual(['home', 'strichliste', 'chat', 'profil']);
    expect(buildPanelNav(null)).toEqual([]);
  });
});
