import type { Request, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { serverEnvironment } from '../config/environment';

/**
 * Auslieferungs-Proxy für die fachliche API (`/api/v1/*`).
 *
 * Der Browser besitzt kein Token: Die Mitglieder-PWA ruft die fachliche API
 * ausschließlich same-origin unter `/api/v1` auf. Express hängt das
 * serverseitig verwahrte Keycloak-Access-Token der HttpOnly-Session als
 * `Authorization: Bearer` an und leitet die Anfrage an den Spring-Fachservice
 * weiter. Damit verlassen Tokens niemals den Server (siehe
 * `docs/authentifizierung.md`).
 *
 * Dieser Proxy trifft keine fachlichen Entscheidungen: Er prüft ausschließlich,
 * dass eine gültige Session mit Access-Token besteht (`deny by default`) und
 * reicht Statuscode und Körper des Fachservice unverändert durch. Käufe,
 * Ledgerbuchungen, Eventmutationen und Katalogfreigaben verantwortet allein
 * Spring Boot, das jeden Aufruf erneut autorisiert.
 */

/** Zeitlimit für einen Fachservice-Aufruf; danach `503`. */
export const API_PROXY_TIMEOUT_MS = 8000;

/** Header, die niemals vom Client an den Fachservice weitergereicht werden. */
const STRIPPED_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'cookie',
  'authorization',
  'content-length',
  'accept-encoding',
]);

/** Antwort-Header, die der Proxy nicht selbst weiterreicht. */
const STRIPPED_RESPONSE_HEADERS = new Set(['content-length', 'transfer-encoding', 'connection']);

function requestId(req: Request): string {
  const provided = req.header('x-request-id');
  if (provided && /^[\w.-]{1,128}$/.test(provided)) return provided;
  return randomUUID();
}

function sendProblem(
  res: Response,
  status: number,
  code: string,
  detail: string,
  instance: string,
  traceId: string,
): void {
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
      traceId,
      timestamp: new Date().toISOString(),
    });
}

function isPublicOrGuestRequest(req: Request): boolean {
  if (req.header('x-guest-token')) return true;
  const path = req.originalUrl.split('?')[0];
  const publicPaths = [
    '/api/v1/invites/accept',
    '/api/v1/member-invites/preview',
    '/api/v1/member-invites/register',
    '/api/v1/auth/access/guest',
    '/api/v1/health',
    '/api/v1/info',
  ];
  return publicPaths.includes(path);
}

function forwardHeaders(req: Request, traceId: string, accessToken?: string): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (STRIPPED_REQUEST_HEADERS.has(name.toLowerCase())) continue;
    headers.set(name, Array.isArray(value) ? value.join(',') : value);
  }
  if (accessToken) {
    headers.set('authorization', `Bearer ${accessToken}`);
  }
  headers.set('x-request-id', traceId);
  if (!headers.has('accept')) headers.set('accept', 'application/json');
  return headers;
}

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD']);

/** Obergrenze für Datei-Uploads (Bilder); entspricht `spring.servlet.multipart.max-request-size`. */
export const API_PROXY_MAX_UPLOAD = '6mb';

function serializeBody(req: Request): { body?: string | Uint8Array<ArrayBuffer>; contentType?: string } {
  if (METHODS_WITHOUT_BODY.has(req.method)) return {};
  const raw = req.body;
  if (raw === undefined || raw === null || raw === '') return {};
  if (typeof raw === 'string') return { body: raw, contentType: 'application/json' };
  // Uploads (`multipart/form-data`) liegen als unveränderter Buffer vor und
  // gehen samt Original-`Content-Type` (mit Boundary) an den Fachservice.
  if (Buffer.isBuffer(raw)) {
    return { body: new Uint8Array(raw), contentType: req.header('content-type') ?? 'application/octet-stream' };
  }
  if (typeof raw === 'object' && Object.keys(raw).length === 0) return {};
  return { body: JSON.stringify(raw), contentType: 'application/json' };
}

/**
 * Leitet `/api/v1/*` an den Fachservice weiter. Ohne gültige Session mit
 * Access-Token antwortet der Proxy mit `401`; ist der Fachservice nicht
 * erreichbar, mit `503` – beides im RFC-7807-Format.
 */
export const apiProxy: RequestHandler = (req, res, next) => {
  const traceId = requestId(req);
  const instance = req.originalUrl;

  const accessToken = req.sessionData?.tokens.accessToken;
  if (!accessToken && !isPublicOrGuestRequest(req)) {
    sendProblem(
      res,
      401,
      'oidc_session_expired',
      'Für den Zugriff auf die fachliche API ist eine gültige Sitzung erforderlich.',
      instance,
      traceId,
    );
    return;
  }

  const targetUrl = `${serverEnvironment.springApiBaseUrl}${req.originalUrl}`;
  const headers = forwardHeaders(req, traceId, accessToken);
  const { body, contentType } = serializeBody(req);
  if (body !== undefined && contentType && !headers.has('content-type')) {
    headers.set('content-type', contentType);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_PROXY_TIMEOUT_MS);

  void fetch(targetUrl, {
    method: req.method,
    headers,
    body,
    redirect: 'manual',
    signal: controller.signal,
  })
    .then(async (upstream) => {
      clearTimeout(timeout);

      upstream.headers.forEach((value, key) => {
        if (STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) return;
        res.setHeader(key, value);
      });
      // Fachdaten (Profil, Guthaben, Ledger, Käufe) sind sitzungsgebunden und
      // dürfen niemals zwischengespeichert werden.
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Vary', 'Cookie');
      if (!res.getHeader('x-request-id')) res.setHeader('x-request-id', traceId);

      const payload = Buffer.from(await upstream.arrayBuffer());
      res.status(upstream.status);
      res.send(payload);
    })
    .catch((error: unknown) => {
      clearTimeout(timeout);
      if (res.headersSent) {
        next(error);
        return;
      }
      sendProblem(
        res,
        503,
        'service_unavailable',
        'Der Fachservice ist derzeit nicht erreichbar.',
        instance,
        traceId,
      );
    });
};
