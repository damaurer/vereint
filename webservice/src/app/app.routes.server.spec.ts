import { RenderMode } from '@angular/ssr';
import { describe, expect, it } from 'vitest';
import { serverRoutes } from './app.routes.server';

/**
 * Nachweis der Renderstrategie (TICKET-028).
 *
 * Nur öffentliche Einstiege ohne personenbezogene Daten werden serverseitig
 * gerendert. Alle privaten App-Kontexte werden im Browser gerendert, damit kein
 * Leckrisiko im SSR-HTML entsteht. Unbekannte Pfade werden über die
 * Catch-all-Route ebenfalls im Browser gerendert (`deny by default`).
 */

/** Öffentliche Einstiege, die serverseitig gerendert werden dürfen. */
const PUBLIC_SERVER_PATHS: readonly string[] = [
  '',
  'auth/error',
  'auth/logged-out',
  'invite/accept',
  'register',
  '403',
  '404',
];

/** Private Kontexte, die niemals serverseitig gerendert werden dürfen. */
const PRIVATE_CLIENT_PATHS: readonly string[] = [
  'app',
  'dashboard',
  'profile',
  'wallet',
  'purchases',
  'events',
  'events/new',
  'events/:eventId',
  'events/:eventId/manage',
  'guest/:eventId',
  'catalog',
  'sublists',
  'chat',
  'direktnachrichten',
  'notifications',
  'moments',
  'events/:eventId/moments',
  'board',
  'board/treasury',
  'board/communications',
  'admin',
  'tablet',
  'statistik',
];

function renderModeOf(path: string): RenderMode | undefined {
  return serverRoutes.find((route) => route.path === path)?.renderMode;
}

describe('serverRoutes render strategy', () => {
  it('renders every public entry on the server', () => {
    for (const path of PUBLIC_SERVER_PATHS) {
      expect(renderModeOf(path), `path "${path}" must be server rendered`).toBe(RenderMode.Server);
    }
  });

  it('renders every private context in the browser', () => {
    for (const path of PRIVATE_CLIENT_PATHS) {
      expect(renderModeOf(path), `path "${path}" must be client rendered`).toBe(RenderMode.Client);
    }
  });

  it('renders unknown paths in the browser (deny by default)', () => {
    const catchAll = serverRoutes.find((route) => route.path === '**');

    expect(catchAll).toBeDefined();
    expect(catchAll?.renderMode).toBe(RenderMode.Client);
  });

  it('never marks a private context as server rendered', () => {
    const serverPaths = serverRoutes
      .filter((route) => route.renderMode === RenderMode.Server)
      .map((route) => route.path);

    for (const path of PRIVATE_CLIENT_PATHS) {
      expect(serverPaths).not.toContain(path);
    }
    expect(serverPaths).not.toContain('**');
    expect([...serverPaths].sort()).toEqual([...PUBLIC_SERVER_PATHS].sort());
  });

  it('defines a unique render mode for every declared route', () => {
    const paths = serverRoutes.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);

    for (const route of serverRoutes) {
      expect([RenderMode.Server, RenderMode.Client]).toContain(route.renderMode);
    }
  });
});
