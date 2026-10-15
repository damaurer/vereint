import type { Request, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
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

/**
 * Liefert die Ziel-URL im Fachservice oder `null`, wenn der Pfad aus
 * `/api/v1` ausbrechen könnte (`..`, kodierte Schrägstriche oder Punkte,
 * Backslashes). `fetch` normalisiert solche Pfade sonst zu beliebigen
 * Endpunkten des Fachservice, etwa `/actuator` oder `/v3/api-docs`.
 */
export function resolveTargetUrl(originalUrl: string): string | null {
  const [rawPath] = originalUrl.split('?');
  if (/%2e|%2f|%5c|\\/i.test(rawPath)) return null;
  if (rawPath.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  const base = new URL(serverEnvironment.springApiBaseUrl);
  const target = new URL(originalUrl, base);
  if (target.origin !== base.origin || !target.pathname.startsWith('/api/v1/')) return null;
  return target.toString();
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

  const targetUrl = resolveTargetUrl(req.originalUrl);
  if (!targetUrl) {
    sendProblem(res, 400, 'invalid_request', 'Ungültiger API-Pfad.', instance, traceId);
    return;
  }
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

/**
 * Bilder und Videos in Moments: Upload (`POST …/media`) und Abruf
 * (`GET …/media/{id}/content`). Diese Wege laufen nicht über `apiProxy`, weil
 * Videos weder im Speicher des Webservice gepuffert noch nach 8 Sekunden
 * abgebrochen werden dürfen.
 */
export const MOMENT_MEDIA_PATH = /^\/api\/v1\/events\/[^/]+\/moments\/[^/]+\/media(?:\/[^/]+\/content)?$/;

/** Ohne Datenfluss in diesem Zeitraum wird ein Upload oder Abruf abgebrochen. */
export const MEDIA_STREAM_IDLE_TIMEOUT_MS = 60_000;

/** Antwort-Header des Fachservice, die beim Streamen nicht weitergereicht werden. */
const STRIPPED_STREAM_RESPONSE_HEADERS = new Set(['transfer-encoding', 'connection', 'keep-alive']);

const MEDIA_UPLOAD_TYPE = /^(image|video)\/[\w.+-]+$/i;

/**
 * Streaming-Variante des Proxys für Moment-Dateien: Der Request-Körper fließt
 * ungepuffert mit seiner `Content-Length` zum Fachservice, die Antwort samt
 * `Range`-Headern (`206`, `Content-Range`) ungepuffert zurück. Größen- und
 * Dauergrenzen prüft Spring; Caddy begrenzt die Körpergröße davor.
 */
export const mediaStreamProxy: RequestHandler = (req, res, next) => {
  const path = req.originalUrl.split('?')[0];
  const isContent = path.endsWith('/content');
  const isUpload = req.method === 'POST' && !isContent;
  const isDownload = (req.method === 'GET' || req.method === 'HEAD') && isContent;
  if (!MOMENT_MEDIA_PATH.test(path) || !(isUpload || isDownload)) {
    next();
    return;
  }

  const traceId = requestId(req);
  const instance = req.originalUrl;
  const accessToken = req.sessionData?.tokens.accessToken;
  if (!accessToken) {
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
  const targetUrl = resolveTargetUrl(req.originalUrl);
  if (!targetUrl) {
    sendProblem(res, 400, 'invalid_request', 'Ungültiger API-Pfad.', instance, traceId);
    return;
  }

  const headers: Record<string, string> = {};
  forwardHeaders(req, traceId, accessToken).forEach((value, key) => {
    headers[key] = value;
  });
  if (isUpload) {
    const length = req.header('content-length');
    const type = (req.header('content-type') ?? '').split(';')[0].trim();
    if (!length || !/^\d+$/.test(length)) {
      sendProblem(res, 411, 'invalid_request', 'Die Dateigröße (Content-Length) fehlt.', instance, traceId);
      return;
    }
    if (!MEDIA_UPLOAD_TYPE.test(type)) {
      sendProblem(res, 415, 'invalid_request', 'Nur Bilder und Videos können hochgeladen werden.', instance, traceId);
      return;
    }
    headers['content-length'] = length;
  }

  const target = new URL(targetUrl);
  const client = target.protocol === 'https:' ? https : http;
  const upstreamRequest = client.request(target, { method: req.method, headers }, (upstream) => {
    res.status(upstream.statusCode ?? 502);
    for (const [key, value] of Object.entries(upstream.headers)) {
      if (value === undefined || STRIPPED_STREAM_RESPONSE_HEADERS.has(key.toLowerCase())) continue;
      res.setHeader(key, value);
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    if (!res.getHeader('x-request-id')) res.setHeader('x-request-id', traceId);
    upstream.on('error', (error) => res.destroy(error));
    upstream.pipe(res);
  });

  upstreamRequest.setTimeout(MEDIA_STREAM_IDLE_TIMEOUT_MS, () => {
    upstreamRequest.destroy(new Error('Zeitüberschreitung beim Fachservice'));
  });
  upstreamRequest.on('error', () => {
    if (!res.headersSent) {
      sendProblem(
        res,
        503,
        'service_unavailable',
        'Der Fachservice ist derzeit nicht erreichbar.',
        instance,
        traceId,
      );
    } else {
      res.destroy();
    }
  });
  // Bricht der Browser ab (Seite verlassen, Video gestoppt), endet auch der Aufruf beim Fachservice.
  res.on('close', () => {
    if (!res.writableFinished) upstreamRequest.destroy();
  });

  if (isUpload) {
    req.pipe(upstreamRequest);
  } else {
    upstreamRequest.end();
  }
};
