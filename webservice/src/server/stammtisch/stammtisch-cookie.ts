import type { Request, Response } from 'express';
import { appendCookie, cookieName, readCookie } from '../auth/cookie.service';
import { serverEnvironment } from '../config/environment';

/**
 * Cookie mit dem gewählten Stammtisch. Er ist kein Geheimnis und gewährt nichts:
 * Der Fachservice prüft bei jeder Anfrage die Mitgliedschaft
 * (`X-Stammtisch-Id`, `StammtischContextFilter`). HttpOnly, damit nur der BFF
 * ihn setzt und weiterreicht. Im Betrieb mit HTTPS heißt er
 * `__Host-vereint.stammtisch` (siehe `cookieName`).
 */
export const STAMMTISCH_COOKIE = 'vereint.stammtisch';

export function stammtischCookieName(): string {
  return cookieName(STAMMTISCH_COOKIE);
}

/** Header, mit dem der Fachservice den Stammtisch einer Anfrage erhält. */
export const STAMMTISCH_HEADER = 'X-Stammtisch-Id';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isStammtischId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function readLegacyStammtischCookie(req: Request): string | undefined {
  if (!serverEnvironment.hostPrefixedCookies) return undefined;
  return readCookie(req, STAMMTISCH_COOKIE);
}

/**
 * Gewählter Stammtisch der Anfrage; ungültige Werte zählen als nicht gewählt.
 * Bis zur Umstellung (`migrateLegacyStammtischCookie`) gilt auch der frühere
 * Name ohne `__Host-`.
 */
export function readStammtischCookie(req: Request): string | undefined {
  const value = readCookie(req, stammtischCookieName()) ?? readLegacyStammtischCookie(req);
  return isStammtischId(value) ? value.toLowerCase() : undefined;
}

function cookieFlags(name: string, value: string, maxAge: number): string {
  return [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(serverEnvironment.sessionCookieSecure ? ['Secure'] : []),
    `Max-Age=${maxAge}`,
  ].join('; ');
}

export function setStammtischCookie(res: Response, stammtischId: string): void {
  appendCookie(res, cookieFlags(stammtischCookieName(), stammtischId.toLowerCase(), ONE_YEAR_SECONDS));
}

export function clearStammtischCookie(res: Response): void {
  appendCookie(res, cookieFlags(stammtischCookieName(), '', 0));
}

/**
 * Umstellung auf `__Host-` (Issue #87): Liegt nur das Cookie unter dem
 * früheren Namen vor, wird die Wahl unter dem neuen Namen übernommen und das
 * alte Cookie gelöscht. Die Mitgliedschaft prüft der Fachservice weiterhin.
 */
export function migrateLegacyStammtischCookie(req: Request, res: Response): void {
  const legacy = readLegacyStammtischCookie(req);
  if (legacy === undefined || readCookie(req, stammtischCookieName()) !== undefined) return;
  if (isStammtischId(legacy)) setStammtischCookie(res, legacy);
  appendCookie(res, cookieFlags(STAMMTISCH_COOKIE, '', 0));
}
