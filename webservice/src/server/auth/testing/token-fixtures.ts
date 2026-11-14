import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from 'jose';
import { applyTestEnvironmentOverrides, serverEnvironment } from '../../config/environment';
import { setKeySetForTesting } from '../id-token';

/**
 * Testhilfen für echte, signierte Keycloak-Tokens.
 *
 * Ausschließlich für Unit-Tests bestimmt: Die Fixtures erzeugen ein lokales
 * RSA-Schlüsselpaar, registrieren dessen JWKS in `id-token.ts` und signieren
 * damit Access- und ID-Tokens. So werden Signaturprüfung, `iss`, `aud`, `azp`,
 * `exp` und `nonce` mit denselben Codepfaden wie im Betrieb getestet.
 */

export const TEST_KEY_ID = 'vereint-test-key';

/** Session-Secret für Tests (mindestens 32 Byte). */
export const TEST_SESSION_SECRET = 'vereint_test_session_secret_0123456789abcdef';
export const TEST_PREVIOUS_SESSION_SECRET = 'vereint_test_previous_secret_0123456789abcd';
export const TEST_CLIENT_SECRET = 'vereint_test_client_secret';

/** Stellt die Pflicht-Secrets bereit, die im Betrieb aus der Umgebung kommen. */
export function installTestSecrets(previousSessionSecret?: string | null): void {
  applyTestEnvironmentOverrides({
    keycloakClientSecret: TEST_CLIENT_SECRET,
    sessionSecretCurrent: TEST_SESSION_SECRET,
    sessionSecretPrevious: previousSessionSecret ?? null,
  });
}

export interface TokenFixtureContext {
  privateKey: CryptoKey;
  keySet: JWTVerifyGetKey;
  issuer: string;
  clientId: string;
}

let context: TokenFixtureContext | null = null;

export async function installTestKeySet(): Promise<TokenFixtureContext> {
  if (!context) {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    const jwk = await exportJWK(publicKey);
    jwk.kid = TEST_KEY_ID;
    jwk.alg = 'RS256';

    context = {
      privateKey: privateKey as CryptoKey,
      keySet: createLocalJWKSet({ keys: [jwk] }),
      issuer: serverEnvironment.keycloakIssuerUri.replace(/\/+$/, ''),
      clientId: serverEnvironment.keycloakClientId,
    };
  }

  setKeySetForTesting(context.keySet);
  return context;
}

export function uninstallTestKeySet(): void {
  setKeySetForTesting(null);
}

export interface SignOptions {
  issuer?: string;
  audience?: string | string[];
  authorizedParty?: string | null;
  expiresInSeconds?: number;
  issuedAtSeconds?: number;
  keyId?: string;
  /** Signiert mit einem fremden Schlüssel (manipulierte Signatur). */
  foreignKey?: boolean;
}

async function signToken(
  payload: Record<string, unknown>,
  options: SignOptions = {},
): Promise<string> {
  const ctx = await installTestKeySet();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issuedAt = options.issuedAtSeconds ?? nowSeconds;
  const expiresIn = options.expiresInSeconds ?? 300;

  const authorizedParty =
    options.authorizedParty === null ? undefined : (options.authorizedParty ?? ctx.clientId);

  const claims: Record<string, unknown> = { ...payload };
  if (authorizedParty !== undefined) {
    claims['azp'] = authorizedParty;
  }

  let signingKey = ctx.privateKey;
  if (options.foreignKey) {
    const foreign = await generateKeyPair('RS256', { extractable: true });
    signingKey = foreign.privateKey as CryptoKey;
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: options.keyId ?? TEST_KEY_ID })
    .setIssuedAt(issuedAt)
    .setIssuer(options.issuer ?? ctx.issuer)
    .setAudience(options.audience ?? ['account'])
    .setExpirationTime(issuedAt + expiresIn)
    .sign(signingKey);
}

/** Signiertes Access-Token (Keycloak setzt `aud: account`, verbindlich ist `azp`). */
export async function signAccessToken(
  payload: Record<string, unknown>,
  options?: SignOptions,
): Promise<string> {
  return signToken(payload, options);
}

/** Signiertes ID-Token; `aud` ist die Client-ID. */
export async function signIdToken(
  payload: Record<string, unknown>,
  options?: SignOptions,
): Promise<string> {
  const ctx = await installTestKeySet();
  return signToken(payload, { audience: ctx.clientId, ...options });
}

export interface TokenPairOptions {
  subject?: string;
  nonce?: string;
  accessClaims?: Record<string, unknown>;
  idClaims?: Record<string, unknown>;
  expiresInSeconds?: number;
}

/** Vollständiges Tokenpaar, wie Keycloak es am Token-Endpunkt liefert. */
export async function signTokenPair(options: TokenPairOptions = {}): Promise<{
  access_token: string;
  id_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}> {
  const subject = options.subject ?? 'u-test-subject';
  const expiresIn = options.expiresInSeconds ?? 300;

  const access_token = await signAccessToken(
    { sub: subject, ...options.accessClaims },
    { expiresInSeconds: expiresIn },
  );
  const id_token = await signIdToken(
    {
      sub: subject,
      ...(options.nonce ? { nonce: options.nonce } : {}),
      ...options.idClaims,
    },
    { expiresInSeconds: expiresIn },
  );

  return {
    access_token,
    id_token,
    refresh_token: 'refresh-token-fixture',
    expires_in: expiresIn,
    token_type: 'Bearer',
  };
}
