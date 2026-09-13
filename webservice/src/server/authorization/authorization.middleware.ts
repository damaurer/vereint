import type { Request, RequestHandler, Response } from 'express';
import { isSafeReturnTo } from '../auth/redirect';
import { createCorrelationId, logSecurityEvent } from '../auth/security-log';
import { publicPaths, pathIs } from '../config/server-config';
import { validateInvite } from '../invites/invite.service';
import { checkResourceAccess, resolvePathAppContext } from './authorization.service';
import { isApiRequest } from './delivery.middleware';
import type { AppContext } from '../auth/auth.types';

/**
 * Serverseitige Zugriffskontrolle vor SSR und Auslieferung.
 *
 * Cache-, `Vary`- und Sicherheits-Header werden ausschließlich zentral in
 * `delivery.middleware.ts` gesetzt (TICKET-007). Diese Middleware entscheidet
 * nur über Freigabe, Anmeldung, `403` oder — bei gestörtem Fachservice — `503`.
 */

/** Kontexte, die über die Webanwendung angemeldet werden. */
const WEB_LOGIN_CONTEXTS: readonly AppContext[] = [
  'tabletRecorder',
  'admin',
  'boardGeneral',
  'boardTreasury',
  'boardCommunications',
];

export function loginPathForContext(appContext: AppContext): string {
  return WEB_LOGIN_CONTEXTS.includes(appContext) ? '/web/login' : '/pwa/login';
}

/**
 * Baut das Anmeldeziel. Das Rücksprungziel wird mit derselben Hilfsfunktion
 * geprüft wie in den Login-Routen (`src/server/auth/redirect.ts`); ungültige,
 * absolute oder protokollrelative Werte werden verworfen.
 */
export function buildLoginRedirect(appContext: AppContext, requestedUrl: string): string {
  const login = loginPathForContext(appContext);
  if (!isSafeReturnTo(requestedUrl)) {
    return login;
  }
  return `${login}?returnUrl=${encodeURIComponent(requestedUrl)}`;
}

interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  instance: string;
  traceId: string;
}

/** Fehlerformat des Fachservices (RFC 7807), damit Clients einheitlich lesen. */
function sendProblem(
  req: Request,
  res: Response,
  status: number,
  code: string,
  title: string,
  detail: string,
  traceId: string,
): void {
  const body: ProblemBody = {
    type: 'about:blank',
    title,
    status,
    detail,
    code,
    instance: req.originalUrl?.split('?')[0] ?? req.path,
    traceId,
  };
  res.status(status).type('application/problem+json').json(body);
}

/** Wartungsantwort bei gestörtem Fachservice; niemals eine Freigabe. */
function sendServiceUnavailable(req: Request, res: Response, traceId: string): void {
  res.setHeader('Retry-After', '30');

  if (isApiRequest(req)) {
    sendProblem(
      req,
      res,
      503,
      'service_unavailable',
      'Service Unavailable',
      'Der Fachservice ist nicht erreichbar. Die Zugriffsentscheidung kann nicht getroffen werden.',
      traceId,
    );
    return;
  }

  res
    .status(503)
    .type('text/html')
    .send(
      '<!doctype html><html lang="de"><head><meta charset="utf-8">'
        + '<title>VEREINT – Wartung</title></head><body>'
        + '<h1>Zugriff derzeit nicht prüfbar</h1>'
        + '<p>Der Fachservice antwortet nicht. Aus Sicherheitsgründen wird der Zugriff '
        + 'nicht gewährt. Bitte in einigen Sekunden erneut versuchen.</p>'
        + '</body></html>',
    );
}

export const authorizePages: RequestHandler = async (req, res, next) => {
  const pathname = req.path;

  // 1. API-Routen und öffentliche Seiten benötigen keine Seitenautorisierung
  if (pathname.startsWith('/api/') || publicPaths.has(pathname)) {
    next();
    return;
  }

  // 2. Registrierung über Einladungscode
  if (pathIs(pathname, '/register')) {
    const inviteCode = pathname.split('/')[2] ?? '';
    if (!(await validateInvite(inviteCode))) {
      res.redirect('/404');
      return;
    }
    next();
    return;
  }

  // 3. Zielkontext bestimmen
  const matched = resolvePathAppContext(pathname);
  if (!matched) {
    next();
    return;
  }

  const requestId = createCorrelationId();

  // 4. Gastkontext (/guest/:eventId)
  if (matched.appContext === 'eventGuest') {
    const guestToken = (req.query['token'] as string) || (req.headers['x-guest-token'] as string | undefined);
    const guestResult = await checkResourceAccess({
      appContext: 'eventGuest',
      eventId: matched.eventId,
      guestToken,
      requestId,
    });

    if (guestResult.outcome === 'allowed') {
      next();
      return;
    }

    if (guestResult.outcome === 'unavailable') {
      sendServiceUnavailable(req, res, guestResult.traceId ?? requestId);
      return;
    }

    if (isApiRequest(req)) {
      sendProblem(
        req,
        res,
        403,
        'access_denied',
        'Forbidden',
        'Der Gastzugang ist ungültig, widerrufen oder abgelaufen.',
        guestResult.traceId ?? requestId,
      );
      return;
    }

    res.redirect('/403');
    return;
  }

  // 5. Geschützte authentifizierte Kontexte
  const identity = req.identity;
  if (!identity) {
    logSecurityEvent(
      {
        event: 'page_authorization',
        outcome: 'denied',
        errorClass: 'missing_session',
        correlationId: requestId,
        detail: `appContext=${matched.appContext}`,
      },
      req,
    );

    if (isApiRequest(req)) {
      sendProblem(
        req,
        res,
        401,
        'oidc_session_expired',
        'Unauthorized',
        'Für diesen Kontext ist eine gültige Session erforderlich.',
        requestId,
      );
      return;
    }

    res.redirect(buildLoginRedirect(matched.appContext, req.originalUrl ?? pathname));
    return;
  }

  const result = await checkResourceAccess({
    appContext: matched.appContext,
    eventId: matched.eventId,
    identity,
    accessToken: req.sessionData?.tokens.accessToken,
    sessionId: req.sessionData?.sessionId,
    requestId,
  });

  if (result.outcome === 'allowed') {
    next();
    return;
  }

  if (result.outcome === 'unavailable') {
    logSecurityEvent(
      {
        event: 'page_authorization',
        outcome: 'failed',
        errorClass: 'access_resolver_unavailable',
        correlationId: result.traceId ?? requestId,
        subject: identity.uid,
        detail: `appContext=${matched.appContext}`,
      },
      req,
    );
    sendServiceUnavailable(req, res, result.traceId ?? requestId);
    return;
  }

  if (result.outcome === 'unauthenticated') {
    if (isApiRequest(req)) {
      sendProblem(
        req,
        res,
        401,
        'oidc_session_expired',
        'Unauthorized',
        'Für diesen Kontext ist eine gültige Session erforderlich.',
        requestId,
      );
      return;
    }
    res.redirect(buildLoginRedirect(matched.appContext, req.originalUrl ?? pathname));
    return;
  }

  logSecurityEvent(
    {
      event: 'page_authorization',
      outcome: 'denied',
      errorClass: 'context_denied',
      correlationId: result.traceId ?? requestId,
      subject: identity.uid,
      detail: `appContext=${matched.appContext}`,
    },
    req,
  );

  if (isApiRequest(req)) {
    sendProblem(
      req,
      res,
      403,
      'access_denied',
      'Forbidden',
      'Für diesen App-Kontext fehlen die erforderlichen Rechte.',
      result.traceId ?? requestId,
    );
    return;
  }

  res.redirect('/403');
};
