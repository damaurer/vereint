import type { Request, Response } from 'express';
import { serverEnvironment } from '../config/environment';
import { sessionCookieName, sessionDurationMs } from '../config/server-config';

export const oidcStateCookieName = '__oidc_state';
export const OIDC_STATE_DURATION_SECONDS = 600; // 10 Minuten

/**
 * Nutzlast je Teil-Cookie. Browser verwerfen einzelne Cookies über 4 KB; der
 * verschlüsselte Sessionwert wird daher auf mehrere Teil-Cookies verteilt.
 * Der Wert bleibt bewusst deutlich unter 4096, damit Name und Attribute jedes
 * Teil-Cookies zusätzlich Platz haben.
 */
export const SESSION_COOKIE_CHUNK_SIZE = 3072;

/**
 * Obergrenze der Teil-Cookies. Sie deckt reguläre Keycloak-Sessions großzügig
 * ab und begrenzt zugleich pathologisch große Werte (`deny by default`).
 */
export const MAX_SESSION_COOKIE_CHUNKS = 6;

/** Name des Teil-Cookies: der erste Teil trägt den Basisnamen, weitere `.1`, `.2` … */
function sessionChunkName(index: number): string {
  return index === 0 ? sessionCookieName : `${sessionCookieName}.${index}`;
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie ?? '';
  const value = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : undefined;
}

export function appendCookie(res: Response, cookieString: string): void {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookieString);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieString]);
  } else {
    res.setHeader('Set-Cookie', [String(existing), cookieString]);
  }
}

/**
 * Setzt den (ggf. auf mehrere Teil-Cookies verteilten) Sessionwert wieder
 * zusammen. Fehlt der erste Teil, existiert keine Session; weitere Teile werden
 * lückenlos ab `.1` gelesen.
 */
export function readSessionCookie(req: Request): string | undefined {
  const first = readCookie(req, sessionChunkName(0));
  if (first === undefined) return undefined;

  let value = first;
  for (let index = 1; index < MAX_SESSION_COOKIE_CHUNKS; index++) {
    const next = readCookie(req, sessionChunkName(index));
    if (next === undefined) break;
    value += next;
  }
  return value;
}

function sessionChunkFlags(name: string, value: string, persistent: boolean): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(serverEnvironment.sessionCookieSecure ? ['Secure'] : []),
    ...(persistent ? [`Max-Age=${Math.floor(sessionDurationMs / 1000)}`] : []),
  ].join('; ');
}

/** Zerlegt den Wert in Teile von höchstens `SESSION_COOKIE_CHUNK_SIZE` Zeichen. */
function splitSessionValue(value: string): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += SESSION_COOKIE_CHUNK_SIZE) {
    chunks.push(value.slice(offset, offset + SESSION_COOKIE_CHUNK_SIZE));
  }
  return chunks.length ? chunks : [''];
}

/**
 * `persistent=false` erzeugt reine Browsersitzungs-Cookies ohne Max-Age. Große
 * Werte werden auf mehrere Teil-Cookies verteilt; überzählige Teil-Cookies einer
 * früheren, größeren Session werden zusätzlich gelöscht.
 */
export function setSessionCookie(res: Response, value: string, persistent = true): void {
  const chunks = splitSessionValue(value);
  chunks.forEach((chunk, index) => {
    appendCookie(res, sessionChunkFlags(sessionChunkName(index), chunk, persistent));
  });

  for (let index = chunks.length; index < MAX_SESSION_COOKIE_CHUNKS; index++) {
    appendCookie(res, clearSessionChunkFlags(sessionChunkName(index)));
  }
}

function clearSessionChunkFlags(name: string): string {
  return [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(serverEnvironment.sessionCookieSecure ? ['Secure'] : []),
    'Max-Age=0',
  ].join('; ');
}

/** Löscht das Basis-Cookie und alle möglichen Teil-Cookies. */
export function clearSessionCookie(res: Response): void {
  for (let index = 0; index < MAX_SESSION_COOKIE_CHUNKS; index++) {
    appendCookie(res, clearSessionChunkFlags(sessionChunkName(index)));
  }
}

export function readOidcStateCookie(req: Request): string | undefined {
  return readCookie(req, oidcStateCookieName);
}

export function setOidcStateCookie(res: Response, value: string): void {
  const flags = [
    `${oidcStateCookieName}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(serverEnvironment.sessionCookieSecure ? ['Secure'] : []),
    `Max-Age=${OIDC_STATE_DURATION_SECONDS}`,
  ];
  appendCookie(res, flags.join('; '));
}

export function clearOidcStateCookie(res: Response): void {
  const flags = [
    `${oidcStateCookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(serverEnvironment.sessionCookieSecure ? ['Secure'] : []),
    'Max-Age=0',
  ];
  appendCookie(res, flags.join('; '));
}
