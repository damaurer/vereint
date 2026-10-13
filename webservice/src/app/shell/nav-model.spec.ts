import { describe, expect, it } from 'vitest';
import { AuthSessionUser } from '../auth/auth.types';
import {
  buildMoreNav,
  buildNavSections,
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
  it('puts the four most frequent destinations into the primary navigation', () => {
    const items = buildPrimaryNav(session({ roles: ['member'], permissions: [] }));
    expect(ids(items)).toEqual(['home', 'events', 'chat', 'wallet']);
  });

  it('hides gated member pages without the permission (deny by default)', () => {
    const items = buildMoreNav(session({ roles: ['member'], permissions: [] }));
    expect(ids(items)).toContain('profil');
    expect(ids(items)).toContain('notifications');
    expect(ids(items)).not.toContain('statistik');
  });

  it('reveals the statistics entry only with the statistics permission', () => {
    const items = buildMoreNav(
      session({ roles: ['member'], permissions: [STATISTICS_PERMISSION] }),
    );
    expect(ids(items)).toContain('statistik');
  });

  it('makes every page reachable on every device via primary + more', () => {
    const admin = session({
      roles: ['admin'],
      permissions: [STATISTICS_PERMISSION, TABLET_PERMISSION],
    });
    const reachable = [...ids(buildPrimaryNav(admin)), ...ids(buildMoreNav(admin))];
    const sectioned = buildNavSections(admin).flatMap((section) => ids(section.items));
    expect(new Set(reachable)).toEqual(new Set(sectioned));
    expect(reachable).toContain('tablet');
    expect(reachable).toContain('admin');
  });

  it('groups the sidebar into sections and drops the admin section for members', () => {
    const member = buildNavSections(session({ roles: ['member'], permissions: [] }));
    expect(member.map((section) => section.id)).toEqual(['club', 'account', 'bar']);

    const board = buildNavSections(session({ roles: ['board'], permissions: [] }));
    expect(board.map((section) => section.id)).toContain('admin');
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
    expect(ids(primary)).toEqual(['home', 'events', 'chat', 'wallet']);
    expect(ids(buildMoreNav(null))).not.toContain('statistik');
    expect(buildPanelNav(null)).toEqual([]);
  });
});
