import type { ProblemDetails, RequestIdentity, UserRole, BoardRole, AppContext } from '../auth/auth.types';
import { createCorrelationId, logSecurityEvent } from '../auth/security-log';
import { serverEnvironment } from '../config/environment';
import {
  readAccessDecision,
  readStaleAccessDecision,
  writeAccessDecision,
} from './access-decision-cache';
import {
  denyAllDecision,
  normalizeDecision,
  type AccessCheckResult,
  type ResolvedAccessDecision,
  type RolePermissionMatrix,
} from './authorization.types';

/**
 * Express-seitige Auswertung der Zugriffsentscheidung.
 *
 * Die Rollen-, Permission- und Kontextmatrix wird ausschließlich in Kotlin
 * gepflegt (`baseservice/.../security/RolePermissionMatrix.kt`) und über
 * `GET /api/v1/auth/access` beziehungsweise `GET /api/v1/auth/access/matrix`
 * versioniert ausgeliefert. Dieses Modul wertet die Antwort aus und leitet
 * keine Rechte mehr selbst ab (TICKET-006).
 *
 * Ist der Fachservice nicht erreichbar oder antwortet er nicht rechtzeitig,
 * gilt `fail closed`: Es wird ausschließlich eine zuvor erfolgreich gelieferte,
 * kurz gecachte Entscheidung wiederverwendet; andernfalls meldet die
 * Middleware `503` beziehungsweise die Wartungsseite.
 */

export interface PathAppContextMatch {
  appContext: AppContext;
  eventId?: string;
  isManage?: boolean;
}

/** Zeitlimit beider Resolver-Aufrufe; blockiert das SSR-Rendering nicht. */
export const RESOLVER_TIMEOUT_MS = 800;

/**
 * Gnadenfrist, in der eine bereits abgelaufene Entscheidung weiterverwendet
 * wird, solange der Fachservice nicht antwortet.
 */
export const RESOLVER_STALE_GRACE_MS = 60_000;

export function hasAnyRole(identity: RequestIdentity | undefined, roles: UserRole[]): boolean {
  if (!identity || !identity.roles) return false;
  return roles.some((role) => identity.roles.includes(role));
}

export function hasBoardRole(identity: RequestIdentity | undefined, boardRoles: BoardRole[]): boolean {
  if (!identity || !identity.roles) return false;
  if (identity.roles.includes('admin')) return true;
  if (!identity.roles.includes('board')) return false;
  return identity.boardRole ? boardRoles.includes(identity.boardRole) : true;
}

export function resolvePathAppContext(pathname: string): PathAppContextMatch | null {
  const clean = pathname.split('?')[0].split('#')[0];

  if (clean === '/admin' || clean.startsWith('/admin/')) {
    return { appContext: 'admin' };
  }

  if (clean === '/board/treasury' || clean.startsWith('/board/treasury/')) {
    return { appContext: 'boardTreasury' };
  }

  if (clean === '/board/communications' || clean.startsWith('/board/communications/')) {
    return { appContext: 'boardCommunications' };
  }

  if (clean === '/board' || clean.startsWith('/board/')) {
    return { appContext: 'boardGeneral' };
  }

  if (clean === '/tablet' || clean.startsWith('/tablet/')) {
    return { appContext: 'tabletRecorder' };
  }

  if (clean.startsWith('/guest/')) {
    const parts = clean.split('/');
    const eventId = parts[2];
    return { appContext: 'eventGuest', eventId };
  }

  if (clean.startsWith('/events/')) {
    const parts = clean.split('/');
    const eventId = parts[2];
    if (parts[3] === 'manage') {
      return { appContext: 'eventOwner', eventId, isManage: true };
    }
    if (eventId) {
      return { appContext: 'event', eventId };
    }
  }

  const memberPaths = [
    '/app',
    '/dashboard',
    '/profile',
    '/wallet',
    '/purchases',
    '/events',
    '/catalog',
    '/sublists',
    '/chat',
    '/notifications',
    '/drink-with-me',
  ];

  if (memberPaths.some((prefix) => clean === prefix || clean.startsWith(`${prefix}/`))) {
    return { appContext: 'memberPwa' };
  }

  return null;
}

interface ProblemLog {
  code: string;
  detail?: string;
  traceId?: string;
}

/**
 * Wertet eine Fehlerantwort des Fachservices aus. Das Fehlerformat ist
 * RFC 7807 (`application/problem+json`) mit `code`, `detail` und `traceId`.
 */
async function readProblemDetails(response: Response): Promise<ProblemLog> {
  try {
    const body = (await response.json()) as Partial<ProblemDetails>;
    return {
      code: typeof body.code === 'string' ? body.code : `http_${response.status}`,
      detail: typeof body.detail === 'string' ? body.detail : undefined,
      traceId: typeof body.traceId === 'string' ? body.traceId : undefined,
    };
  } catch {
    return { code: `http_${response.status}` };
  }
}

/** `fetch` mit `AbortController`; nach [RESOLVER_TIMEOUT_MS] wird abgebrochen. */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = RESOLVER_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface ResolveAccessOptions {
  identity?: RequestIdentity;
  accessToken?: string;
  sessionId?: string;
  /** Korrelations-Id; wird als `X-Request-Id` mitgesendet. */
  requestId?: string;
}

export interface AccessDecisionResult {
  outcome: 'resolved' | 'unauthenticated' | 'unavailable';
  decision?: ResolvedAccessDecision;
  fromCache?: boolean;
  traceId?: string;
}

/**
 * Ermittelt die vollständige Zugriffsentscheidung.
 *
 * Ohne Identität gilt `deny by default`. Ohne Access-Token existiert kein
 * vertrauenswürdiger Nachweis; eine Ableitung aus Claims ersetzt die
 * Resolver-Antwort nicht mehr (`fail closed`).
 */
export async function resolveAccessDecision(options: ResolveAccessOptions): Promise<AccessDecisionResult> {
  const { identity, accessToken, sessionId } = options;

  if (!identity || !identity.uid) {
    return { outcome: 'unauthenticated', decision: denyAllDecision() };
  }

  const cached = readAccessDecision(sessionId);
  if (cached) {
    return { outcome: 'resolved', decision: cached, fromCache: true };
  }

  if (!accessToken) {
    logSecurityEvent({
      event: 'access_resolver_call',
      outcome: 'denied',
      errorClass: 'missing_access_token',
      subject: identity.uid,
    });
    return { outcome: 'unavailable' };
  }

  const requestId = options.requestId ?? createCorrelationId();

  try {
    const response = await fetchWithTimeout(`${serverEnvironment.springApiBaseUrl}/api/v1/auth/access`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'X-Request-Id': requestId,
      },
    });

    if (response.ok) {
      const decision = normalizeDecision(await response.json());
      if (decision) {
        writeAccessDecision(sessionId, decision);
        return { outcome: 'resolved', decision };
      }

      logSecurityEvent({
        event: 'access_resolver_call',
        outcome: 'failed',
        errorClass: 'invalid_decision_payload',
        correlationId: requestId,
        subject: identity.uid,
      });
    } else {
      const problem = await readProblemDetails(response);
      logSecurityEvent({
        event: 'access_resolver_call',
        outcome: 'failed',
        errorClass: problem.code,
        correlationId: problem.traceId ?? requestId,
        subject: identity.uid,
        detail: problem.detail,
      });

      // Eine eindeutige Ablehnung des Fachservices ist keine Störung.
      if (response.status === 401 || response.status === 403) {
        return { outcome: 'resolved', decision: denyAllDecision(identity.uid), traceId: problem.traceId };
      }

      return { outcome: 'unavailable', traceId: problem.traceId };
    }
  } catch (error) {
    const aborted = (error as Error)?.name === 'AbortError';
    logSecurityEvent({
      event: 'access_resolver_call',
      outcome: 'failed',
      errorClass: aborted ? 'resolver_timeout' : 'resolver_unreachable',
      correlationId: requestId,
      subject: identity.uid,
    });
  }

  // Fail closed mit begrenzter Wiederverwendung einer erfolgreichen Antwort.
  const stale = readStaleAccessDecision(sessionId, RESOLVER_STALE_GRACE_MS);
  if (stale) {
    return { outcome: 'resolved', decision: stale, fromCache: true };
  }

  return { outcome: 'unavailable' };
}

/**
 * Lädt die versionierte Rollen-/Permission-Matrix. Express pflegt keine eigene
 * Kopie; die Funktion dient Diagnose und Konsistenzprüfungen.
 */
export async function fetchRolePermissionMatrix(
  accessToken: string,
  requestId = createCorrelationId(),
): Promise<RolePermissionMatrix | undefined> {
  try {
    const response = await fetchWithTimeout(`${serverEnvironment.springApiBaseUrl}/api/v1/auth/access/matrix`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'X-Request-Id': requestId,
      },
    });

    if (!response.ok) {
      const problem = await readProblemDetails(response);
      logSecurityEvent({
        event: 'access_matrix_call',
        outcome: 'failed',
        errorClass: problem.code,
        correlationId: problem.traceId ?? requestId,
        detail: problem.detail,
      });
      return undefined;
    }

    return (await response.json()) as RolePermissionMatrix;
  } catch (error) {
    logSecurityEvent({
      event: 'access_matrix_call',
      outcome: 'failed',
      errorClass: (error as Error)?.name === 'AbortError' ? 'resolver_timeout' : 'resolver_unreachable',
      correlationId: requestId,
    });
    return undefined;
  }
}

export interface CheckResourceAccessOptions {
  appContext: AppContext;
  eventId?: string;
  guestToken?: string;
  permission?: string;
  identity?: RequestIdentity;
  accessToken?: string;
  sessionId?: string;
  requestId?: string;
  /** Aufrufer-Adresse; ausschließlich für die Protokollierung. */
  remoteAddress?: string;
}

/** Gastzugriff wird ausschließlich vom Fachservice entschieden. */
async function checkGuestAccess(options: CheckResourceAccessOptions): Promise<AccessCheckResult> {
  const { eventId, guestToken } = options;
  if (!eventId || !guestToken) return { outcome: 'denied' };

  const requestId = options.requestId ?? createCorrelationId();

  try {
    const response = await fetchWithTimeout(`${serverEnvironment.springApiBaseUrl}/api/v1/auth/access/guest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Request-Id': requestId,
      },
      body: JSON.stringify({ appContext: 'eventGuest', eventId, guestToken }),
    });

    if (response.ok) {
      const body = (await response.json()) as { allowed?: boolean };
      if (body.allowed === true) return { outcome: 'allowed' };
      logSecurityEvent({
        event: 'guest_access_check',
        outcome: 'denied',
        errorClass: 'guest_token_rejected',
        correlationId: requestId,
        detail: `eventId=${eventId}`,
      });
      return { outcome: 'denied' };
    }

    const problem = await readProblemDetails(response);
    logSecurityEvent({
      event: 'guest_access_check',
      outcome: 'failed',
      errorClass: problem.code,
      correlationId: problem.traceId ?? requestId,
      detail: problem.detail,
    });

    // Ratenbegrenzung und Ablehnungen sind endgültig, keine Störung.
    if (response.status === 429 || response.status === 400 || response.status === 403) {
      return { outcome: 'denied', traceId: problem.traceId };
    }

    return { outcome: 'unavailable', traceId: problem.traceId };
  } catch (error) {
    logSecurityEvent({
      event: 'guest_access_check',
      outcome: 'failed',
      errorClass: (error as Error)?.name === 'AbortError' ? 'resolver_timeout' : 'resolver_unreachable',
      correlationId: requestId,
      detail: `eventId=${eventId}`,
    });
    return { outcome: 'unavailable' };
  }
}

/**
 * Prüft einen App-Kontext serverseitig. Rückgabe ist bewusst dreiwertig:
 * Freigabe, Ablehnung oder Störung des Fachservices.
 */
export async function checkResourceAccess(options: CheckResourceAccessOptions): Promise<AccessCheckResult> {
  const { appContext, eventId, identity } = options;

  if (appContext === 'eventGuest') {
    return checkGuestAccess(options);
  }

  if (!identity) return { outcome: 'unauthenticated' };

  const resolved = await resolveAccessDecision({
    identity,
    accessToken: options.accessToken,
    sessionId: options.sessionId,
    requestId: options.requestId,
  });

  if (resolved.outcome === 'unauthenticated') return { outcome: 'unauthenticated' };
  if (resolved.outcome === 'unavailable' || !resolved.decision) {
    return { outcome: 'unavailable', traceId: resolved.traceId };
  }

  const decision = resolved.decision;
  if (decision.disabled) return { outcome: 'denied', decision };

  if (options.permission && !decision.permissions.includes(options.permission)) {
    return { outcome: 'denied', decision };
  }

  // `eventOwner` folgt ausschließlich `ownedEvents`; Teilnahme genügt nicht.
  if (appContext === 'eventOwner') {
    if (!decision.allowedAppContexts.includes('eventOwner')) {
      return { outcome: 'denied', decision };
    }
    if (!eventId) return { outcome: 'allowed', decision };
    if (decision.ownedEvents.includes(eventId)) return { outcome: 'allowed', decision };
    if (decision.roles.includes('board') || decision.roles.includes('admin')) {
      return { outcome: 'allowed', decision };
    }
    return { outcome: 'denied', decision };
  }

  if (appContext === 'event') {
    if (!decision.allowedAppContexts.includes('event')) {
      return { outcome: 'denied', decision };
    }
    if (!eventId) return { outcome: 'allowed', decision };
    if (decision.eventScopes.includes(eventId)) return { outcome: 'allowed', decision };
    if (decision.roles.includes('board') || decision.roles.includes('admin')) {
      return { outcome: 'allowed', decision };
    }
    return { outcome: 'denied', decision };
  }

  return decision.allowedAppContexts.includes(appContext)
    ? { outcome: 'allowed', decision }
    : { outcome: 'denied', decision };
}

export async function ownsEvent(
  identity: RequestIdentity,
  eventId: string,
  accessToken?: string,
  sessionId?: string,
): Promise<boolean> {
  const result = await checkResourceAccess({
    appContext: 'eventOwner',
    eventId,
    identity,
    accessToken,
    sessionId,
  });
  return result.outcome === 'allowed';
}

export async function isActiveGuest(eventId: string, guestToken: string): Promise<boolean> {
  const result = await checkResourceAccess({
    appContext: 'eventGuest',
    eventId,
    guestToken,
  });
  return result.outcome === 'allowed';
}

export {
  invalidateAccessDecision,
  invalidateAccessDecisionsForSubject,
  clearAccessDecisionCache,
} from './access-decision-cache';
