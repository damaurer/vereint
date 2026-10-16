import { serverEnvironment } from './environment';

export const sessionCookieName = serverEnvironment.sessionCookieName;
export const sessionDurationMs = serverEnvironment.sessionDurationMs;
export const publicPaths = new Set([
  '/auth/error',
  '/auth/logged-out',
  '/invite/accept',
  // Registrierung per Einladungslink; das Token steht im URL-Fragment.
  '/register',
  // Eigene Gruppe eröffnen, mit oder ohne Konto.
  '/gruppe-eroeffnen',
  // Rechtstexte müssen ohne Anmeldung erreichbar sein.
  '/impressum',
  '/agb',
  '/403',
  '/404',
]);

export function pathIs(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Frühere sichtbare Adressen der Gruppen-Seiten und ihre neuen Ziele. Express
 * leitet sie dauerhaft um und behält die Query (`?billing=…`, `?returnTo=…`).
 */
export const LEGACY_PAGE_REDIRECTS: ReadonlyMap<string, string> = new Map([
  ['/stammtische', '/gruppen'],
  ['/stammtisch', '/gruppe'],
  ['/eroeffnen', '/gruppe-eroeffnen'],
]);

/** Auswahlseite der Gruppen (ohne gewählte Gruppe). */
export const GROUP_CHOICE_PAGE = '/gruppen';
