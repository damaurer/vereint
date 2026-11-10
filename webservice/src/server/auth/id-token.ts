import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { serverEnvironment } from '../config/environment';

/**
 * Kryptografische Prüfung der von Keycloak ausgestellten Tokens.
 *
 * Signatur, `iss`, `aud`/`azp` und `exp` werden gegen den JWKS des Realms
 * geprüft. Ein Token, dessen Prüfung fehlschlägt, führt zum Abbruch des
 * Logins; ungeprüfte Claims werden niemals in eine Identität übersetzt
 * (`deny by default`, siehe `docs/backend-for-frontend/03-authentication-and-session.md`).
 */

export const ID_TOKEN_CLOCK_TOLERANCE_SECONDS = 60;

/** Cachedauer des JWKS; Keycloak rotiert Realm-Schlüssel selten. */
const JWKS_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const JWKS_COOLDOWN_MS = 30 * 1000;

export class TokenVerificationError extends Error {
  constructor(
    readonly code: string,
    override readonly cause?: unknown,
  ) {
    super(code);
    this.name = 'TokenVerificationError';
  }
}

let cachedIssuer: string | null = null;
let cachedKeySet: JWTVerifyGetKey | null = null;

function normalizeIssuer(issuerUri: string): string {
  return issuerUri.replace(/\/+$/, '');
}

export function jwksUri(issuerUri = serverEnvironment.keycloakIssuerUri): string {
  return `${normalizeIssuer(issuerUri)}/protocol/openid-connect/certs`;
}

/**
 * Liefert den zwischengespeicherten JWKS-Resolver des Realms. `jose` cacht die
 * Schlüssel selbst und lädt sie bei unbekannter `kid` kontrolliert nach.
 */
export function resolveKeySet(issuerUri = serverEnvironment.keycloakIssuerUri): JWTVerifyGetKey {
  const issuer = normalizeIssuer(issuerUri);
  if (cachedKeySet && cachedIssuer === issuer) {
    return cachedKeySet;
  }

  cachedIssuer = issuer;
  cachedKeySet = createRemoteJWKSet(new URL(jwksUri(issuer)), {
    cacheMaxAge: JWKS_CACHE_MAX_AGE_MS,
    cooldownDuration: JWKS_COOLDOWN_MS,
    timeoutDuration: serverEnvironment.keycloakRequestTimeoutMs,
  });

  return cachedKeySet;
}

/**
 * Ersetzt den JWKS-Resolver. Wird von Tests genutzt, die mit einem lokal
 * erzeugten Schlüsselpaar arbeiten; im Betrieb bleibt der Remote-JWKS aktiv.
 */
export function setKeySetForTesting(keySet: JWTVerifyGetKey | null): void {
  cachedKeySet = keySet;
  cachedIssuer = keySet ? normalizeIssuer(serverEnvironment.keycloakIssuerUri) : null;
}

export interface VerifyTokenOptions {
  /** Erwartete Audience; für ID-Tokens die Client-ID. */
  audience?: string;
  /** Erwarteter `azp`-Claim (Keycloak Access-Tokens tragen `aud: account`). */
  authorizedParty?: string;
  /** Erwarteter `nonce` aus dem Transaktionsstate. */
  nonce?: string;
  issuerUri?: string;
}

async function verifyToken(token: string, options: VerifyTokenOptions): Promise<JWTPayload> {
  if (!token || typeof token !== 'string') {
    throw new TokenVerificationError('token_missing');
  }

  const issuer = normalizeIssuer(options.issuerUri ?? serverEnvironment.keycloakIssuerUri);

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, resolveKeySet(issuer), {
      issuer,
      audience: options.audience,
      clockTolerance: ID_TOKEN_CLOCK_TOLERANCE_SECONDS,
    });
    payload = result.payload;
  } catch (error) {
    throw new TokenVerificationError('token_verification_failed', error);
  }

  if (options.authorizedParty && payload['azp'] !== options.authorizedParty) {
    throw new TokenVerificationError('token_azp_mismatch');
  }

  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new TokenVerificationError('token_missing_subject');
  }

  return payload;
}

/**
 * Prüft ein ID-Token vollständig inklusive `nonce`-Gegenprüfung.
 */
export async function verifyIdToken(idToken: string, options?: VerifyTokenOptions): Promise<JWTPayload> {
  const payload = await verifyToken(idToken, {
    ...options,
    audience: options?.audience ?? serverEnvironment.keycloakClientId,
    authorizedParty: options?.authorizedParty,
  });

  if (options?.nonce !== undefined) {
    if (typeof payload['nonce'] !== 'string' || payload['nonce'] !== options.nonce) {
      throw new TokenVerificationError('token_nonce_mismatch');
    }
  }

  return payload;
}

/**
 * Prüft ein Access-Token. Keycloak setzt dort `aud` je Client-Scope; verbindlich
 * ist daher `azp` gegen die eigene Client-ID.
 */
export async function verifyAccessToken(accessToken: string, options?: VerifyTokenOptions): Promise<JWTPayload> {
  return verifyToken(accessToken, {
    ...options,
    audience: options?.audience,
    authorizedParty: options?.authorizedParty ?? serverEnvironment.keycloakClientId,
  });
}
