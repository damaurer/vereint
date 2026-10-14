import { serverEnvironment } from './environment';

export const sessionCookieName = serverEnvironment.sessionCookieName;
export const sessionDurationMs = serverEnvironment.sessionDurationMs;
export const publicPaths = new Set([
  '/auth/error',
  '/auth/logged-out',
  '/invite/accept',
  // Registrierung per Einladungslink; das Token steht im URL-Fragment.
  '/register',
  '/403',
  '/404',
]);

export function pathIs(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
