import { randomBytes } from 'node:crypto';
import { serverEnvironment } from '../config/environment';
import type { KeycloakTokenResponse, OidcTransactionState, RequestIdentity, UserRole, BoardRole } from './auth.types';
import { TokenVerificationError, verifyAccessToken, verifyIdToken } from './id-token';
import { generateCodeChallenge, generateCodeVerifier, generateOAuthState } from './pkce';
import { logSecurityEvent } from './security-log';

/**
 * Service für die serverseitige OIDC-Kommunikation mit Keycloak.
 * Alle Token-Endpunkte und Client-Secrets verbleiben ausschließlich serverseitig.
 */

export interface AuthorizationRequestOptions {
  redirectUri?: string;
  returnTo?: string;
  scope?: string;
}

export interface AuthorizationRequestResult {
  authorizationUrl: string;
  transactionState: OidcTransactionState;
  stateString: string;
}

const VALID_USER_ROLES = new Set<UserRole>(['member', 'board', 'admin']);
const VALID_BOARD_ROLES = new Set<BoardRole>(['chair', 'treasurer', 'secretary', 'assessor']);

function issuerBase(): string {
  return serverEnvironment.keycloakIssuerUri.replace(/\/+$/, '');
}

function requireClientSecret(): string {
  const secret = serverEnvironment.keycloakClientSecret;
  if (!secret) {
    throw new Error('keycloak_client_secret_missing');
  }
  return secret;
}

export interface KeycloakFetchOptions {
  /** Anzahl zusätzlicher Versuche für idempotente Aufrufe. */
  retries?: number;
  timeoutMs?: number;
  /** Korrelations-ID, die als `X-Request-Id` mitgesendet wird. */
  requestId?: string;
}

/**
 * `fetch` gegen Keycloak mit `AbortController`-Timeout und begrenztem Retry.
 * Ohne Timeout könnte ein hängender Token-Aufruf das SSR-Rendering blockieren.
 */
export async function keycloakFetch(
  url: string,
  init: RequestInit,
  options?: KeycloakFetchOptions,
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? serverEnvironment.keycloakRequestTimeoutMs;
  const attempts = Math.max(0, options?.retries ?? 0) + 1;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(init.headers);
      if (options?.requestId) {
        headers.set('X-Request-Id', options.requestId);
      }
      return await fetch(url, { ...init, headers, signal: controller.signal });
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`keycloak_request_failed: ${(lastError as Error)?.name ?? 'unknown'}`);
}

export function createAuthorizationRequest(options?: AuthorizationRequestOptions): AuthorizationRequestResult {
  const authEndpoint = `${issuerBase()}/protocol/openid-connect/auth`;
  const redirectUri = options?.redirectUri || `${serverEnvironment.publicBaseUrl}/api/auth/callback`;

  const codeVerifier = generateCodeVerifier(32);
  const codeChallenge = generateCodeChallenge(codeVerifier, 'S256');
  const state = generateOAuthState(24);
  const nonce = randomBytes(16).toString('base64url');

  const transactionState: OidcTransactionState = {
    state,
    codeVerifier,
    nonce,
    returnTo: options?.returnTo || '/app',
    createdAt: Date.now(),
  };

  const params = new URLSearchParams({
    client_id: serverEnvironment.keycloakClientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: options?.scope || 'openid profile email roles',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    nonce,
  });

  const authorizationUrl = `${authEndpoint}?${params.toString()}`;

  return {
    authorizationUrl,
    transactionState,
    stateString: JSON.stringify(transactionState),
  };
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri?: string,
  requestId?: string,
): Promise<KeycloakTokenResponse> {
  const tokenEndpoint = `${issuerBase()}/protocol/openid-connect/token`;
  const effectiveRedirectUri = redirectUri || `${serverEnvironment.publicBaseUrl}/api/auth/callback`;

  const bodyParams = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: serverEnvironment.keycloakClientId,
    client_secret: requireClientSecret(),
    code,
    redirect_uri: effectiveRedirectUri,
    code_verifier: codeVerifier,
  });

  // Ein Authorization Code ist einmalig verwendbar: kein Retry.
  const response = await keycloakFetch(
    tokenEndpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: bodyParams.toString(),
    },
    { retries: 0, requestId },
  );

  if (!response.ok) {
    throw new Error(`oidc_token_exchange_failed (${response.status})`);
  }

  const data = (await response.json()) as KeycloakTokenResponse;
  if (!data.access_token) {
    throw new Error('oidc_token_exchange_missing_access_token');
  }

  return data;
}

export async function refreshAccessToken(
  refreshToken: string,
  requestId?: string,
): Promise<KeycloakTokenResponse> {
  const tokenEndpoint = `${issuerBase()}/protocol/openid-connect/token`;

  const bodyParams = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: serverEnvironment.keycloakClientId,
    client_secret: requireClientSecret(),
    refresh_token: refreshToken,
  });

  // Mit aktivierter Rotation (`revokeRefreshToken`) darf ein Refresh-Token nur
  // einmal eingelöst werden: kein Retry.
  const response = await keycloakFetch(
    tokenEndpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: bodyParams.toString(),
    },
    { retries: 0, requestId },
  );

  if (!response.ok) {
    throw new Error(`oidc_token_refresh_failed (${response.status})`);
  }

  const data = (await response.json()) as KeycloakTokenResponse;
  if (!data.access_token) {
    throw new Error('oidc_token_refresh_missing_access_token');
  }

  return data;
}

/**
 * Backchannel-Logout. Fehlschläge werden strukturiert protokolliert und als
 * Ergebnis zurückgegeben, damit die Logout-Antwort sie berücksichtigen kann.
 */
export async function logoutFromKeycloak(refreshToken?: string, requestId?: string): Promise<boolean> {
  if (!refreshToken) return false;
  const logoutEndpoint = `${issuerBase()}/protocol/openid-connect/logout`;

  const bodyParams = new URLSearchParams({
    client_id: serverEnvironment.keycloakClientId,
    client_secret: requireClientSecret(),
    refresh_token: refreshToken,
  });

  try {
    const response = await keycloakFetch(
      logoutEndpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString(),
      },
      { retries: 1, requestId },
    );

    if (!response.ok) {
      logSecurityEvent({
        event: 'oidc_backchannel_logout',
        outcome: 'failed',
        errorClass: `http_${response.status}`,
        correlationId: requestId,
      });
      return false;
    }

    return true;
  } catch (error) {
    logSecurityEvent({
      event: 'oidc_backchannel_logout',
      outcome: 'failed',
      errorClass: (error as Error).name || 'unknown_error',
      correlationId: requestId,
    });
    return false;
  }
}

export function buildEndSessionUrl(options?: { idTokenHint?: string; postLogoutRedirectUri?: string }): string {
  const logoutEndpoint = `${issuerBase()}/protocol/openid-connect/logout`;
  const postLogoutRedirect = options?.postLogoutRedirectUri || `${serverEnvironment.publicBaseUrl}/web/login`;

  const params = new URLSearchParams({
    post_logout_redirect_uri: postLogoutRedirect,
    client_id: serverEnvironment.keycloakClientId,
  });

  if (options?.idTokenHint) {
    params.set('id_token_hint', options.idTokenHint);
  }

  return `${logoutEndpoint}?${params.toString()}`;
}

/**
 * Dekodiert den Payload eines JWT **ohne** jede Prüfung.
 *
 * Nur für Diagnose und Protokollierung zulässig. Identitäten und Rollen dürfen
 * ausschließlich aus `extractIdentityFromVerifiedTokens` stammen.
 */
export function parseJwtClaims(token: string): Record<string, unknown> {
  if (!token || typeof token !== 'string') return {};
  const parts = token.split('.');
  if (parts.length < 2) return {};
  try {
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function collectStrings(value: unknown, target: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) if (typeof entry === 'string' && entry) target.add(entry);
  } else if (typeof value === 'string' && value) {
    for (const entry of value.split(' ')) if (entry) target.add(entry);
  }
}

/**
 * Setzt den verbindlichen Claim-Vertrag aus `docs/authentifizierung.md` um.
 * Unbekannte Rollennamen werden verworfen (`deny by default`).
 */
export function extractIdentityFromTokenClaims(claims: Record<string, unknown>): RequestIdentity {
  const uid = typeof claims['sub'] === 'string' ? claims['sub'] : '';
  if (!uid) {
    throw new Error('invalid_token_missing_subject');
  }

  const email = typeof claims['email'] === 'string' ? claims['email'] : undefined;
  const displayName =
    typeof claims['name'] === 'string'
      ? claims['name']
      : typeof claims['preferred_username'] === 'string'
        ? claims['preferred_username']
        : undefined;

  const rawRoles = new Set<string>();

  // 1. Flacher `roles`-Claim
  collectStrings(claims['roles'], rawRoles);

  // 2. realm_access.roles
  const realmAccess = claims['realm_access'];
  if (realmAccess && typeof realmAccess === 'object') {
    collectStrings((realmAccess as Record<string, unknown>)['roles'], rawRoles);
  }

  // 3. resource_access.*.roles
  const resourceAccess = claims['resource_access'];
  if (resourceAccess && typeof resourceAccess === 'object') {
    for (const clientData of Object.values(resourceAccess as Record<string, unknown>)) {
      if (clientData && typeof clientData === 'object') {
        collectStrings((clientData as Record<string, unknown>)['roles'], rawRoles);
      }
    }
  }

  const roles: UserRole[] = [];
  for (const role of rawRoles) {
    if (VALID_USER_ROLES.has(role as UserRole)) {
      roles.push(role as UserRole);
    }
  }

  let boardRole: BoardRole | undefined;
  const boardRoleClaim = claims['board_role'];
  if (typeof boardRoleClaim === 'string' && VALID_BOARD_ROLES.has(boardRoleClaim as BoardRole)) {
    boardRole = boardRoleClaim as BoardRole;
  } else {
    for (const role of rawRoles) {
      if (VALID_BOARD_ROLES.has(role as BoardRole)) {
        boardRole = role as BoardRole;
        break;
      }
    }
  }

  const drinkRecorder =
    claims['drink_recorder'] === true ||
    claims['tabletRecorder'] === true ||
    rawRoles.has('tabletRecorder') ||
    rawRoles.has('drink_recorder');

  // Permissions aus `permissions` und `scope` gemäß Claim-Vertrag.
  const permissionSet = new Set<string>();
  collectStrings(claims['permissions'], permissionSet);
  collectStrings(claims['scope'], permissionSet);
  for (const oidcScope of ['openid', 'profile', 'email', 'roles', 'address', 'phone', 'offline_access']) {
    permissionSet.delete(oidcScope);
  }

  const eventScopes = new Set<string>();
  collectStrings(claims['event_scopes'], eventScopes);

  return {
    uid,
    email,
    displayName,
    roles,
    boardRole,
    drinkRecorder,
    permissions: permissionSet.size ? [...permissionSet] : undefined,
    eventScopes: eventScopes.size ? [...eventScopes] : undefined,
  };
}

export interface VerifiedTokenIdentity {
  identity: RequestIdentity;
  idTokenClaims: Record<string, unknown>;
  accessTokenClaims: Record<string, unknown>;
}

export interface VerifyTokensOptions {
  /** Erwarteter `nonce` aus dem Transaktionsstate des Logins. */
  nonce?: string;
  /** Erwarteter Subject bei einem Refresh (Subjektwechsel ist unzulässig). */
  expectedSubject?: string;
}

/**
 * Prüft Access- und ID-Token kryptografisch und leitet erst danach die
 * Identität ab. Schlägt eine Prüfung fehl, bricht der Vorgang ab; leere Claims
 * werden nie zurückgegeben.
 */
export async function extractIdentityFromVerifiedTokens(
  tokens: KeycloakTokenResponse,
  options?: VerifyTokensOptions,
): Promise<VerifiedTokenIdentity> {
  const accessTokenClaims = (await verifyAccessToken(tokens.access_token)) as Record<string, unknown>;

  let idTokenClaims: Record<string, unknown> = {};
  if (tokens.id_token) {
    idTokenClaims = (await verifyIdToken(tokens.id_token, { nonce: options?.nonce })) as Record<string, unknown>;

    if (idTokenClaims['sub'] !== accessTokenClaims['sub']) {
      throw new TokenVerificationError('token_subject_mismatch');
    }
  } else if (options?.nonce !== undefined) {
    throw new TokenVerificationError('token_missing_id_token');
  }

  if (options?.expectedSubject && accessTokenClaims['sub'] !== options.expectedSubject) {
    throw new TokenVerificationError('token_subject_mismatch');
  }

  const mergedClaims: Record<string, unknown> = {
    ...idTokenClaims,
    ...accessTokenClaims,
  };

  return {
    identity: extractIdentityFromTokenClaims(mergedClaims),
    idTokenClaims,
    accessTokenClaims,
  };
}
