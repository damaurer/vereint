import type { Request, Response } from 'express';
import { serverEnvironment } from '../config/environment';
import { sessionDurationMs } from '../config/server-config';

export const OIDC_STATE_DURATION_SECONDS = 600; // 10 Minuten

/**
 * Präfix für Cookies, die nur dieser Host setzen darf. Browser nehmen
 * `__Host-`-Cookies nur mit `Secure`, `Path=/` und ohne `Domain` an; andere
 * Anwendungen unter derselben Domain können sie daher weder setzen noch
 * überschreiben.
 */
export const HOST_COOKIE_PREFIX = '__Host-';

/** Cookie-Name im laufenden Betrieb: mit `__Host-`, sofern aktiv. */
export function cookieName(baseName: string): string {
  return serverEnvironment.hostPrefixedCookies ? `${HOST_COOKIE_PREFIX}${baseName}` : baseName;
}

/** Name des OIDC-Transaktions-Cookies (`__Host-oidc_state` bzw. lokal `__oidc_state`). */
export function oidcStateCookieName(): string {
  return serverEnvironment.hostPrefixedCookies ? `${HOST_COOKIE_PREFIX}oidc_state` : '__oidc_state';
}

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

/** Basisname des Session-Cookies im laufenden Betrieb (Teil 0). */
export function sessionCookieName(): string {
  return cookieName(serverEnvironment.sessionCookieName);
}

/** Name des Teil-Cookies: der erste Teil trägt den Basisnamen, weitere `.1`, `.2` … */
function sessionChunkName(index: number, baseName = sessionCookieName()): string {
  return index === 0 ? baseName : `${baseName}.${index}`;
}

/**
 * Liest ein Cookie. Ein Wert mit ungültiger Prozent-Kodierung (etwa `%E0`)
 * zählt als nicht vorhanden: Er darf keine Anfrage mit 500 abbrechen, denn
 * `attachIdentity` liest das Session-Cookie bei jeder Anfrage.
 */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie ?? '';
  const value = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!value) return undefined;
  try {
    return decodeURIComponent(value.slice(name.length + 1));
  } catch {
    return undefined;
  }
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

function readChunkedCookie(req: Request, baseName: string): string | undefined {
  const first = readCookie(req, sessionChunkName(0, baseName));
  if (first === undefined) return undefined;

  let value = first;
  for (let index = 1; index < MAX_SESSION_COOKIE_CHUNKS; index++) {
    const next = readCookie(req, sessionChunkName(index, baseName));
    if (next === undefined) break;
    value += next;
  }
  return value;
}

/**
 * Setzt den (ggf. auf mehrere Teil-Cookies verteilten) Sessionwert wieder
 * zusammen. Fehlt der erste Teil, existiert keine Session; weitere Teile werden
 * lückenlos ab `.1` gelesen.
 */
export function readSessionCookie(req: Request): string | undefined {
  return readChunkedCookie(req, sessionCookieName());
}

/**
 * Session unter dem früheren Namen ohne `__Host-` (Umstellung, Issue #87).
 * Nur relevant, solange `hostPrefixedCookies` aktiv ist und noch kein Cookie
 * unter dem neuen Namen existiert; `verifyRequestSession` schreibt die Session
 * dann unter den neuen Namen um und löscht die alten Cookies.
 */
export function readLegacySessionCookie(req: Request): string | undefined {
  if (!serverEnvironment.hostPrefixedCookies) return undefined;
  return readChunkedCookie(req, serverEnvironment.sessionCookieName);
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

/** Löscht die Session-Cookies unter dem früheren Namen ohne `__Host-`. */
export function clearLegacySessionCookie(res: Response): void {
  if (!serverEnvironment.hostPrefixedCookies) return;
  for (let index = 0; index < MAX_SESSION_COOKIE_CHUNKS; index++) {
    appendCookie(res, clearSessionChunkFlags(sessionChunkName(index, serverEnvironment.sessionCookieName)));
  }
}

export function readOidcStateCookie(req: Request): string | undefined {
  return readCookie(req, oidcStateCookieName());
}

export function setOidcStateCookie(res: Response, value: string): void {
  const flags = [
    `${oidcStateCookieName()}=${encodeURIComponent(value)}`,
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
    `${oidcStateCookieName()}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(serverEnvironment.sessionCookieSecure ? ['Secure'] : []),
    'Max-Age=0',
  ];
  appendCookie(res, flags.join('; '));
}
