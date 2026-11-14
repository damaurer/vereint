import { createHash, randomBytes } from 'node:crypto';

/**
 * PKCE (Proof Key for Code Exchange) Werkzeuge nach RFC 7636
 * zur Absicherung des OAuth2/OIDC Authorization Code Flows.
 */

export type CodeChallengeMethod = 'S256' | 'plain';

/** RFC 7636 Abschnitt 4.1: 43 bis 128 Zeichen aus dem unreserved-Zeichensatz. */
export const MIN_CODE_VERIFIER_LENGTH = 43;
export const MAX_CODE_VERIFIER_LENGTH = 128;

const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]+$/;

/** Prüft einen `code_verifier` gegen RFC 7636 Abschnitt 4.1. */
export function isValidCodeVerifier(verifier: unknown): verifier is string {
  return (
    typeof verifier === 'string' &&
    verifier.length >= MIN_CODE_VERIFIER_LENGTH &&
    verifier.length <= MAX_CODE_VERIFIER_LENGTH &&
    CODE_VERIFIER_PATTERN.test(verifier)
  );
}

/**
 * Erzeugt einen kryptografisch sicheren `code_verifier`.
 * RFC 7636 verlangt eine Länge zwischen 43 und 128 Zeichen aus Base64URL-Zeichen.
 */
export function generateCodeVerifier(byteLength = 32): string {
  // 32 Bytes Base64URL erzeugen genau 43 Zeichen.
  const bytes = Math.max(32, Math.min(byteLength, 96));
  return randomBytes(bytes).toString('base64url');
}

/**
 * Erzeugt die `code_challenge` zum übergebenen `code_verifier`.
 * Standardverfahren ist SHA-256 (S256).
 */
export function generateCodeChallenge(verifier: string, method: CodeChallengeMethod = 'S256'): string {
  if (!isValidCodeVerifier(verifier)) {
    throw new Error('invalid_code_verifier');
  }

  // `plain` ist nach RFC 7636 Abschnitt 7.2 unsicher und wird abgelehnt.
  if (method !== 'S256') {
    throw new Error('unsupported_code_challenge_method');
  }

  return createHash('sha256').update(verifier, 'utf8').digest('base64url');
}

/**
 * Überprüft, ob ein `code_verifier` zur gespeicherten `code_challenge` passt.
 */
export function verifyCodeChallenge(
  verifier: string,
  expectedChallenge: string,
  method: CodeChallengeMethod = 'S256',
): boolean {
  if (!expectedChallenge || !isValidCodeVerifier(verifier)) {
    return false;
  }
  try {
    const calculated = generateCodeChallenge(verifier, method);
    return calculated === expectedChallenge;
  } catch {
    return false;
  }
}

/**
 * Erzeugt einen zufälligen State-Parameter zur Absicherung gegen CSRF-Angriffe.
 */
export function generateOAuthState(byteLength = 24): string {
  return randomBytes(byteLength).toString('base64url');
}

export interface KeycloakAuthUrlOptions {
  issuerUri: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod?: CodeChallengeMethod;
  scope?: string;
  responseType?: string;
}

/**
 * Baut die vollständige Authorization-URL für den Keycloak-Login mit PKCE zusammen.
 */
export function buildKeycloakAuthorizationUrl(options: KeycloakAuthUrlOptions): string {
  const base = options.issuerUri.replace(/\/+$/, '');
  const authEndpoint = `${base}/protocol/openid-connect/auth`;
  
  const method = options.codeChallengeMethod ?? 'S256';
  if (method !== 'S256') {
    throw new Error('unsupported_code_challenge_method');
  }

  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: options.responseType ?? 'code',
    scope: options.scope ?? 'openid profile email roles',
    state: options.state,
    code_challenge: options.codeChallenge,
    code_challenge_method: method,
  });

  return `${authEndpoint}?${params.toString()}`;
}
