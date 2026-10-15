import type { Request, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { logSecurityEvent } from '../auth/security-log';

/**
 * Schutzschichten der Express-Schicht vor Session und Fachservice.
 *
 * - `crossSiteRequestGuard`: Schreibende Anfragen müssen aus der eigenen
 *   Herkunft stammen. `SameSite=Lax` allein schützt nicht vor anderen
 *   Subdomains derselben Domain (gleiche "Site").
 * - `rateLimit`: Begrenzt Anfragen je Schlüssel (Session oder Client-IP) in
 *   einem festen Zeitfenster. Der Speicher liegt im Prozess; es gibt genau eine
 *   Instanz des Webservice.
 */

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Pfade, die schreibend von fremder Herkunft aufgerufen werden dürfen. Der
 * OIDC-Callback ist über `state` und PKCE geschützt.
 */
const CROSS_SITE_EXEMPT_PATHS = new Set(['/api/auth/callback', '/login/oauth2/code/keycloak']);

function problem(res: Response, status: number, code: string, detail: string, instance: string): void {
  res
    .status(status)
    .type('application/problem+json')
    .json({
      type: 'about:blank',
      title: code,
      status,
      detail,
      instance,
      code,
      traceId: randomUUID(),
      timestamp: new Date().toISOString(),
    });
}

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Entscheidet nach dem Vorbild von Go `http.CrossOriginProtection`:
 * `Sec-Fetch-Site` zuerst, sonst `Origin` gegen `Host`. Anfragen ohne beide
 * Header stammen nicht aus einem Browser und tragen damit kein fremdes
 * Session-Cookie.
 */
export function isCrossSiteRequest(req: Request): boolean {
  const fetchSite = req.header('sec-fetch-site');
  if (fetchSite) {
    return fetchSite !== 'same-origin' && fetchSite !== 'none';
  }
  const origin = req.header('origin');
  if (!origin) return false;
  if (origin === 'null') return true;
  const host = req.header('host')?.toLowerCase();
  return !host || originHost(origin) !== host;
}

export const crossSiteRequestGuard: RequestHandler = (req, res, next) => {
  if (!UNSAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const path = req.originalUrl.split('?')[0];
  if (CROSS_SITE_EXEMPT_PATHS.has(path) || !isCrossSiteRequest(req)) {
    next();
    return;
  }
  logSecurityEvent({ event: 'cross_site_request', outcome: 'denied', errorClass: 'origin_mismatch' }, req);
  problem(res, 403, 'cross_site_request', 'Anfragen von fremden Seiten sind nicht erlaubt.', req.originalUrl);
};

export interface RateLimitOptions {
  /** Name für Protokoll und Schlüsselraum. */
  readonly name: string;
  readonly windowMs: number;
  readonly max: number;
  /** Schlüssel der Anfrage; Standard ist die Client-IP. */
  readonly key?: (req: Request) => string;
  /** Höchstzahl gleichzeitig verfolgter Schlüssel (Speicherschutz). */
  readonly maxKeys?: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export function clientAddress(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

export function sessionOrClientKey(req: Request): string {
  const sessionId = req.sessionData?.sessionId;
  return sessionId ? `s:${sessionId}` : `ip:${clientAddress(req)}`;
}

/** Alle aktiven Begrenzer; nur für Tests zurücksetzbar. */
const registry: Map<string, Window>[] = [];

export function resetRateLimits(): void {
  registry.forEach((windows) => windows.clear());
}

export function rateLimit(options: RateLimitOptions): RequestHandler {
  const windows = new Map<string, Window>();
  registry.push(windows);
  const maxKeys = options.maxKeys ?? 50_000;
  const keyOf = options.key ?? clientAddress;

  function prune(now: number): void {
    for (const [key, window] of windows) {
      if (window.resetAt <= now) windows.delete(key);
    }
    // Läuft der Speicher trotzdem voll, verfallen die ältesten Einträge.
    if (windows.size >= maxKeys) {
      const excess = windows.size - Math.floor(maxKeys / 2);
      let removed = 0;
      for (const key of windows.keys()) {
        if (removed++ >= excess) break;
        windows.delete(key);
      }
    }
  }

  return (req, res, next) => {
    const now = Date.now();
    const key = keyOf(req);
    let window = windows.get(key);
    if (!window || window.resetAt <= now) {
      if (!window && windows.size >= maxKeys) prune(now);
      window = { count: 0, resetAt: now + options.windowMs };
      windows.set(key, window);
    }
    window.count++;

    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, options.max - window.count)));
    if (window.count <= options.max) {
      next();
      return;
    }

    const retryAfter = Math.max(1, Math.ceil((window.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    if (window.count === options.max + 1) {
      logSecurityEvent(
        { event: 'rate_limited', outcome: 'denied', errorClass: options.name },
        req,
      );
    }
    problem(
      res,
      429,
      'too_many_requests',
      'Zu viele Anfragen. Bitte warte kurz und versuche es erneut.',
      req.originalUrl,
    );
  };
}

/**
 * Öffentliche Endpunkte, deren Geheimnis im Aufruf selbst steckt (Einladungs-
 * und Gast-Token). Hier ist Raten die naheliegende Angriffsart.
 */
export const PUBLIC_TOKEN_PATHS = [
  '/api/v1/member-invites/preview',
  '/api/v1/member-invites/register',
  '/api/v1/invites/accept',
  '/api/v1/auth/access/guest',
  '/api/invites',
];

/** 30 Versuche je IP in 15 Minuten. */
export const publicTokenRateLimit = rateLimit({ name: 'public_token', windowMs: 15 * 60_000, max: 30 });

/** Gast-Chat: 60 Anfragen je IP und Minute. */
export const guestChatRateLimit = rateLimit({ name: 'guest_chat', windowMs: 60_000, max: 60 });

/**
 * Login-Start: 120 je IP in 5 Minuten. Schützt vor einer Flut von
 * State-Cookies; Passwort-Raten bremst Keycloak selbst (Brute-Force-Schutz).
 * Großzügig, weil Mitglieder im Vereins-WLAN eine IP teilen.
 */
export const loginRateLimit = rateLimit({ name: 'login', windowMs: 5 * 60_000, max: 120 });

/**
 * Allgemeine Obergrenze für die API: je Session (Mitglieder hinter demselben
 * Vereins-WLAN teilen sich eine IP) bzw. je IP ohne Session.
 */
export const apiRateLimit = rateLimit({
  name: 'api',
  windowMs: 60_000,
  max: 600,
  key: sessionOrClientKey,
});

const GUEST_CHAT_PATH = /^\/api\/v1\/events\/[^/]+\/chat\/guest(?:\/|$)/;

/** Ordnet einer Anfrage die passenden Begrenzer zu. */
export const apiRateLimits: RequestHandler = (req, res, next) => {
  const path = req.originalUrl.split('?')[0];
  const limiters: RequestHandler[] = [apiRateLimit];
  if (PUBLIC_TOKEN_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    limiters.push(publicTokenRateLimit);
  } else if (GUEST_CHAT_PATH.test(path)) {
    limiters.push(guestChatRateLimit);
  }

  let index = 0;
  const run = (error?: unknown): void => {
    if (error || res.headersSent) {
      next(error);
      return;
    }
    const limiter = limiters[index++];
    if (!limiter) {
      next();
      return;
    }
    limiter(req, res, run);
  };
  run();
};
