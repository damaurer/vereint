import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { serverEnvironment } from '../config/environment';
import { sessionDurationMs } from '../config/server-config';
import type { KeycloakTokenResponse, RequestIdentity, SessionData } from './auth.types';
import {
  MAX_SESSION_COOKIE_CHUNKS,
  SESSION_COOKIE_CHUNK_SIZE,
  clearLegacySessionCookie,
  clearSessionCookie,
  readLegacySessionCookie,
  readSessionCookie,
  sessionCookieName,
  setSessionCookie,
} from './cookie.service';
import {
  extractIdentityFromVerifiedTokens,
  logoutFromKeycloak,
  refreshAccessToken,
} from './oidc.service';
import { createCorrelationId, logSecurityEvent } from './security-log';

/**
 * Serverseitige Sessionverwaltung. Access-, ID- und Refresh-Token verlassen den
 * Server ausschließlich als AES-256-GCM-verschlüsselter HttpOnly-Cookie-Inhalt.
 */

const ALGORITHM = 'aes-256-gcm';

/** Info-Label der HKDF-Ableitung; trennt den Sessionschlüssel von jedem anderen Zweck. */
const HKDF_INFO = 'vereint.session.cookie.v1';
const HKDF_SALT = 'vereint.session.hkdf.salt';
const KEY_LENGTH_BYTES = 32;

/**
 * Präfix der Schlüsselversion im Cookie. Die Version wird aus dem Secret selbst
 * abgeleitet, damit ein Schlüsselwechsel bestehende Sessions nicht invalidiert:
 * Cookies der Vorgängerversion bleiben lesbar, solange
 * `SESSION_SECRET_PREVIOUS` gesetzt ist.
 */
const KEY_VERSION_PREFIX = 'k';
const KEY_VERSION_LENGTH = 8;

/**
 * Browser verwerfen einzelne Cookies über 4 KB. Der verschlüsselte Wert wird
 * daher in `cookie.service` auf mehrere Teil-Cookies verteilt; diese Obergrenze
 * ist die Gesamtkapazität aller Teile. Eine Überschreitung ist ein expliziter
 * Fehler und kein stiller Sessionverlust (`deny by default`).
 */
export const MAX_SESSION_COOKIE_BYTES = SESSION_COOKIE_CHUNK_SIZE * MAX_SESSION_COOKIE_CHUNKS;

/** Karenzzeit vor Ablauf des Access-Tokens, in der bereits erneuert wird. */
export const REFRESH_GRACE_MS = 30_000;

/** Laufende Refresh-Vorgänge je `sessionId`, damit die Rotation nicht kollidiert. */
const inFlightRefreshes = new Map<string, Promise<SessionData | undefined>>();

function configuredSecrets(): { current: string; previous?: string | null } {
  return {
    current: serverEnvironment.sessionSecretCurrent,
    previous: serverEnvironment.sessionSecretPrevious,
  };
}

interface SessionKey {
  version: string;
  key: Buffer;
}

/** Stabile, nicht umkehrbare Version eines Secrets. */
export function sessionKeyVersion(secret: string): string {
  const digest = createHash('sha256').update(`${HKDF_INFO}:${secret}`, 'utf8').digest('hex');
  return `${KEY_VERSION_PREFIX}${digest.slice(0, KEY_VERSION_LENGTH)}`;
}

function deriveSessionKey(secret: string): SessionKey {
  if (!secret) {
    throw new Error('session_secret_missing');
  }
  return {
    version: sessionKeyVersion(secret),
    key: Buffer.from(hkdfSync('sha256', secret, HKDF_SALT, HKDF_INFO, KEY_LENGTH_BYTES)),
  };
}

function currentSessionKey(secret?: string): SessionKey {
  return deriveSessionKey(secret ?? configuredSecrets().current);
}

/** Alle akzeptierten Schlüssel: aktueller Schlüssel und optional der vorherige. */
function acceptedSessionKeys(secret?: string): SessionKey[] {
  if (secret) {
    return [deriveSessionKey(secret)];
  }

  const { current, previous } = configuredSecrets();
  const keys: SessionKey[] = [deriveSessionKey(current)];
  if (previous) {
    keys.push(deriveSessionKey(previous));
  }
  return keys;
}

export function encryptSessionData(session: SessionData, secret?: string): string {
  const { version, key } = currentSessionKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const json = JSON.stringify(session);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    version,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptSessionData(raw: string, secret?: string): SessionData | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const parts = raw.split('.');
  if (parts.length !== 4) return undefined;

  const [version, rawIv, rawTag, rawPayload] = parts;

  let candidates: SessionKey[];
  try {
    candidates = acceptedSessionKeys(secret).filter((candidate) => candidate.version === version);
  } catch {
    return undefined;
  }

  if (!candidates.length) return undefined;

  for (const candidate of candidates) {
    try {
      const iv = Buffer.from(rawIv, 'base64url');
      const authTag = Buffer.from(rawTag, 'base64url');
      const encrypted = Buffer.from(rawPayload, 'base64url');

      if (iv.length !== 12 || authTag.length !== 16) return undefined;

      const decipher = createDecipheriv(ALGORITHM, candidate.key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      const session = JSON.parse(decrypted.toString('utf8')) as SessionData;

      if (!session || typeof session !== 'object' || !session.uid || !session.tokens) {
        return undefined;
      }

      return session;
    } catch {
      // Nächster Schlüssel (Rotation) bzw. `deny by default`.
    }
  }

  return undefined;
}

/** Gesamtlänge des Cookies inklusive Name und Attributen. */
export function estimateSessionCookieBytes(encryptedValue: string): number {
  const value = encodeURIComponent(encryptedValue);
  const attributes = `${sessionCookieName()}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${Math.floor(
    sessionDurationMs / 1000,
  )}`;
  return Buffer.byteLength(`${attributes}${value}`, 'utf8');
}

export function assertSessionCookieWithinLimit(encryptedValue: string, correlationId?: string): void {
  const size = Buffer.byteLength(encodeURIComponent(encryptedValue), 'utf8');
  if (size > MAX_SESSION_COOKIE_BYTES) {
    logSecurityEvent({
      event: 'session_cookie_too_large',
      outcome: 'failed',
      errorClass: 'cookie_size_limit',
      correlationId,
      detail: `size=${size} limit=${MAX_SESSION_COOKIE_BYTES}`,
    });
    throw new Error('session_cookie_too_large');
  }
}

function writeSessionCookie(res: Response, session: SessionData, persistent: boolean, correlationId?: string): void {
  const encrypted = encryptSessionData(session);
  assertSessionCookieWithinLimit(encrypted, correlationId);
  setSessionCookie(res, encrypted, persistent);
}

export interface CreateSessionOptions {
  rememberMe?: boolean;
  /** Erwarteter `nonce` aus dem Transaktionsstate des Logins. */
  nonce?: string;
  correlationId?: string;
}

/**
 * Erzeugt eine Session aus geprüften Tokens. Signatur, `iss`, `aud`, `exp` und
 * `nonce` werden vorher in `extractIdentityFromVerifiedTokens` validiert.
 */
export async function createSessionFromTokens(
  tokens: KeycloakTokenResponse,
  res: Response,
  options?: CreateSessionOptions | boolean,
): Promise<SessionData> {
  const resolved: CreateSessionOptions =
    typeof options === 'boolean' ? { rememberMe: options } : (options ?? {});
  const rememberMe = resolved.rememberMe ?? true;

  const { identity } = await extractIdentityFromVerifiedTokens(tokens, { nonce: resolved.nonce });
  const now = Date.now();

  const sessionTtlMs = rememberMe
    ? sessionDurationMs
    : tokens.expires_in
      ? tokens.expires_in * 1000
      : 3600 * 1000;

  const session: SessionData = {
    sessionId: randomBytes(16).toString('hex'),
    uid: identity.uid,
    createdAt: now,
    expiresAt: now + sessionTtlMs,
    accessTokenExpiresAt: tokens.expires_in ? now + tokens.expires_in * 1000 : undefined,
    tokens: {
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
    },
    identity,
  };

  writeSessionCookie(res, session, rememberMe, resolved.correlationId);

  return session;
}

function needsRefresh(session: SessionData, now: number): boolean {
  if (session.accessTokenExpiresAt === undefined) return false;
  return session.accessTokenExpiresAt - REFRESH_GRACE_MS <= now;
}

async function performRefresh(session: SessionData, correlationId: string): Promise<SessionData | undefined> {
  const refreshToken = session.tokens.refreshToken;
  if (!refreshToken) return undefined;

  try {
    const refreshed = await refreshAccessToken(refreshToken, correlationId);
    const { identity } = await extractIdentityFromVerifiedTokens(refreshed, { expectedSubject: session.uid });
    const now = Date.now();

    return {
      ...session,
      accessTokenExpiresAt: refreshed.expires_in ? now + refreshed.expires_in * 1000 : undefined,
      tokens: {
        accessToken: refreshed.access_token,
        idToken: refreshed.id_token || session.tokens.idToken,
        // Mit aktivierter Rotation liefert Keycloak ein neues Refresh-Token.
        refreshToken: refreshed.refresh_token || session.tokens.refreshToken,
        tokenType: refreshed.token_type || session.tokens.tokenType,
        expiresIn: refreshed.expires_in || session.tokens.expiresIn,
        scope: refreshed.scope || session.tokens.scope,
      },
      identity,
    };
  } catch (error) {
    logSecurityEvent({
      event: 'oidc_token_refresh',
      outcome: 'failed',
      errorClass: (error as Error).message?.split(' ')[0] || 'unknown_error',
      correlationId,
      subject: session.uid,
    });
    return undefined;
  }
}

/**
 * Bündelt gleichzeitige Refresh-Vorgänge einer Session. Ohne diese
 * Serialisierung würden mehrere parallele Requests dasselbe Refresh-Token
 * mehrfach einlösen und die Session durch die Rotation invalidieren.
 */
async function refreshSessionSerialized(session: SessionData, correlationId: string): Promise<SessionData | undefined> {
  const pending = inFlightRefreshes.get(session.sessionId);
  if (pending) return pending;

  const task = performRefresh(session, correlationId).finally(() => {
    inFlightRefreshes.delete(session.sessionId);
  });

  inFlightRefreshes.set(session.sessionId, task);
  return task;
}

export async function verifyRequestSession(
  req: Request,
  res?: Response,
): Promise<RequestIdentity | undefined> {
  let cookie = readSessionCookie(req);
  // Umstellung auf `__Host-`: Eine Session unter dem früheren Namen wird
  // einmalig gelesen, unter dem neuen Namen geschrieben und alt gelöscht.
  const legacy = cookie ? undefined : readLegacySessionCookie(req);
  if (legacy && res) clearLegacySessionCookie(res);
  cookie ??= legacy;
  if (!cookie) return undefined;

  const session = decryptSessionData(cookie);
  if (!session) return undefined;

  const now = Date.now();
  if (session.expiresAt <= now) {
    return undefined;
  }

  if (!needsRefresh(session, now)) {
    if (legacy && res) {
      try {
        writeSessionCookie(res, session, true);
      } catch {
        return undefined;
      }
    }
    req.sessionData = session;
    return session.identity;
  }

  // Ohne `Response` kann das rotierte Refresh-Token nicht persistiert werden;
  // ein Refresh würde die Session zerstören (`deny by default`).
  if (!res) return undefined;

  const correlationId = createCorrelationId();
  const refreshedSession = await refreshSessionSerialized(session, correlationId);
  if (!refreshedSession) return undefined;

  try {
    writeSessionCookie(res, refreshedSession, true, correlationId);
  } catch {
    return undefined;
  }

  req.sessionData = refreshedSession;
  return refreshedSession.identity;
}

export async function destroySession(req: Request, res: Response): Promise<boolean> {
  const correlationId = createCorrelationId();
  const cookie = readSessionCookie(req) ?? readLegacySessionCookie(req);
  let backchannelLogout = true;

  if (cookie) {
    const session = decryptSessionData(cookie);
    if (session?.tokens.refreshToken) {
      backchannelLogout = await logoutFromKeycloak(session.tokens.refreshToken, correlationId);
    }
  }

  clearSessionCookie(res);
  clearLegacySessionCookie(res);
  req.identity = undefined;
  req.sessionData = undefined;

  return backchannelLogout;
}
