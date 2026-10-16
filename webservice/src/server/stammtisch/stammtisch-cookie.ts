import type { Request, Response } from 'express';
import { appendCookie, readCookie } from '../auth/cookie.service';
import { serverEnvironment } from '../config/environment';

/**
 * Cookie mit dem gewählten Stammtisch. Er ist kein Geheimnis und gewährt nichts:
 * Der Fachservice prüft bei jeder Anfrage die Mitgliedschaft
 * (`X-Stammtisch-Id`, `StammtischContextFilter`). HttpOnly, damit nur der BFF
 * ihn setzt und weiterreicht.
 */
export const STAMMTISCH_COOKIE = 'vereint.stammtisch';

/** Header, mit dem der Fachservice den Stammtisch einer Anfrage erhält. */
export const STAMMTISCH_HEADER = 'X-Stammtisch-Id';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isStammtischId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Gewählter Stammtisch der Anfrage; ungültige Werte zählen als nicht gewählt. */
export function readStammtischCookie(req: Request): string | undefined {
  const value = readCookie(req, STAMMTISCH_COOKIE);
  return isStammtischId(value) ? value.toLowerCase() : undefined;
}

function cookieFlags(value: string, maxAge: number): string {
  return [
    `${STAMMTISCH_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(serverEnvironment.sessionCookieSecure ? ['Secure'] : []),
    `Max-Age=${maxAge}`,
  ].join('; ');
}

export function setStammtischCookie(res: Response, stammtischId: string): void {
  appendCookie(res, cookieFlags(stammtischId.toLowerCase(), ONE_YEAR_SECONDS));
}

export function clearStammtischCookie(res: Response): void {
  appendCookie(res, cookieFlags('', 0));
}
