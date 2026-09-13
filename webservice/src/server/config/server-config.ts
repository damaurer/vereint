import { serverEnvironment } from './environment';

export const sessionCookieName = serverEnvironment.sessionCookieName;
export const sessionDurationMs = serverEnvironment.sessionDurationMs;
export const publicPaths = new Set([
  '/',
  '/login',
  '/web/login',
  '/pwa/login',
  '/password-reset',
  '/invite/accept',
  '/403',
  '/404',
]);

export function pathIs(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
