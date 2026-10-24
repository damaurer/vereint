import { randomBytes } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';
import { pathIs } from '../config/server-config';
import { serverEnvironment } from '../config/environment';
import { resolvePathAppContext } from './authorization.service';

/**
 * Zentrale Auslieferungsbeschränkungen.
 *
 * Alle Cache-, `Vary`- und Sicherheits-Header werden ausschließlich hier
 * gesetzt. Die Autorisierungs-Middleware und der SSR-Handler wiederholen sie
 * nicht (TICKET-007).
 */

/** Geschützte Antworten: niemals in einem gemeinsamen Cache. */
export const PRIVATE_CACHE_CONTROL = 'private, no-store';

/** Gehashte Build-Artefakte sind unveränderlich. */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** App-Shell und `index.html` werden immer revalidiert. */
export const APP_SHELL_CACHE_CONTROL = 'no-cache';

/**
 * `Vary` für sitzungsabhängige Antworten. Ohne `Cookie` könnte ein
 * zwischengeschalteter Cache eine Antwort der falschen Person zuordnen;
 * `Accept-Encoding` ergänzt die aktivierte Kompression.
 */
export const PRIVATE_VARY = 'Cookie, Accept-Encoding';

/** Öffentliche Antworten sind nicht sitzungsabhängig. */
export const PUBLIC_VARY = 'Accept-Encoding';

/**
 * Gehashte Assets des Angular-Builds, zum Beispiel `main-5RAM3QJT.js` oder
 * `media/inter-ABCD1234.woff2`.
 */
const HASHED_ASSET_PATTERN =
  /-[A-Za-z0-9_]{8,}\.(?:js|mjs|css|map|woff2?|ttf|otf|eot|svg|png|jpe?g|webp|avif|gif)$/;

export function isHashedAssetPath(pathname: string): boolean {
  return HASHED_ASSET_PATTERN.test(pathname);
}

/** Registrierungsseiten sind einladungsgebunden und damit nicht cachebar. */
function isPrivatePath(pathname: string): boolean {
  if (resolvePathAppContext(pathname)) return true;
  return pathIs(pathname, '/register');
}

export function isPrivateDeliveryPath(pathname: string): boolean {
  return isPrivatePath(pathname);
}

/** Erkennt API-Aufrufe; sie erhalten Statuscodes statt HTML. */
export function isApiRequest(req: Request): boolean {
  if (req.path.startsWith('/api/')) return true;
  const accept = req.headers['accept'];
  if (typeof accept !== 'string' || !accept.length) return false;
  if (accept.includes('text/html')) return false;
  return accept.includes('application/json') || accept.includes('application/problem+json');
}

/** Aktives TLS; hinter einem Proxy zählt `X-Forwarded-Proto`. */
export function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  const forwarded = req.headers['x-forwarded-proto'];
  if (typeof forwarded === 'string' && forwarded.split(',')[0].trim() === 'https') return true;
  return serverEnvironment.sessionCookieSecure;
}

export function cspNonceOf(res: Response): string {
  return (res.locals['cspNonce'] as string | undefined) ?? '';
}

/**
 * Erzeugt je Antwort eine Nonce für SSR-Inline-Skripte. Der Wert landet in
 * `res.locals.cspNonce` und in der Content-Security-Policy.
 */
export const attachCspNonce: RequestHandler = (_req, res, next) => {
  res.locals['cspNonce'] = randomBytes(16).toString('base64');
  next();
};

/**
 * Sicherheits-Header über `helmet`.
 *
 * Die CSP ist auf die Angular-Anwendung zugeschnitten: Skripte ausschließlich
 * aus eigener Herkunft oder mit gültiger Nonce, keine fremden Frames,
 * `frame-ancestors 'none'`. Für die serverseitig eingebetteten
 * Komponentenstile ist `'unsafe-inline'` in `style-src` erforderlich; Angular
 * versieht diese `<style>`-Elemente in dieser Konfiguration nicht mit einer
 * Nonce. HSTS wird ausschließlich bei aktivem TLS gesetzt
 * (siehe `docs/deployment.md`).
 */
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      'base-uri': ["'self'"],
      'object-src': ["'none'"],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'"],
      'script-src': ["'self'", (_req, res) => `'nonce-${cspNonceOf(res as Response)}'`],
      'style-src': ["'self'", "'unsafe-inline'"],
      // Kartenkacheln der Moment-Karte (OpenStreetMap, siehe moment-map.component.ts).
      'img-src': ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org'],
      'font-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'worker-src': ["'self'"],
      'manifest-src': ["'self'"],
      'upgrade-insecure-requests': null,
    },
  },
  // HSTS wird abhängig von TLS in `applyDeliveryHeaders` gesetzt.
  hsts: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  frameguard: { action: 'deny' },
  noSniff: true,
  xPoweredBy: false,
});

/** Ein Jahr HSTS inklusive Subdomains. */
export const HSTS_VALUE = 'max-age=31536000; includeSubDomains';

/**
 * Setzt Cache- und `Vary`-Header abhängig vom Pfad. Die Zuordnung ist
 * eindeutig: gehashte Assets unveränderlich, App-Shell `no-cache`, geschützte
 * Kontexte `private, no-store` mit `Vary: Cookie`.
 */
export const applyDeliveryHeaders: RequestHandler = (req, res, next) => {
  if (isSecureRequest(req)) {
    res.setHeader('Strict-Transport-Security', HSTS_VALUE);
  }

  if (isPrivatePath(req.path)) {
    res.setHeader('Cache-Control', PRIVATE_CACHE_CONTROL);
    res.setHeader('Vary', PRIVATE_VARY);
    next();
    return;
  }

  if (isHashedAssetPath(req.path)) {
    res.setHeader('Cache-Control', IMMUTABLE_CACHE_CONTROL);
    res.setHeader('Vary', PUBLIC_VARY);
    next();
    return;
  }

  res.setHeader('Cache-Control', APP_SHELL_CACHE_CONTROL);
  res.setHeader('Vary', PUBLIC_VARY);
  next();
};
