import type { Request, Response } from 'express';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTestEnvironmentOverrides } from '../config/environment';
import type { SessionData } from './auth.types';
import {
  MAX_SESSION_COOKIE_BYTES,
  REFRESH_GRACE_MS,
  createSessionFromTokens,
  decryptSessionData,
  destroySession,
  encryptSessionData,
  estimateSessionCookieBytes,
  sessionKeyVersion,
  verifyRequestSession,
} from './session.service';
import { readSessionCookie } from './cookie.service';
import {
  TEST_PREVIOUS_SESSION_SECRET,
  TEST_SESSION_SECRET,
  installTestKeySet,
  installTestSecrets,
  signTokenPair,
} from './testing/token-fixtures';

function createMockResponse(): Response {
  const headers: Record<string, string | string[]> = {};
  return {
    getHeader: (name: string) => headers[name.toLowerCase()],
    setHeader: (name: string, value: string | string[]) => {
      headers[name.toLowerCase()] = value;
    },
  } as unknown as Response;
}

function createMockRequest(cookieHeader?: string): Request {
  return {
    headers: { cookie: cookieHeader },
  } as unknown as Request;
}

function cookieRequest(encrypted: string): Request {
  return createMockRequest(`vereint_session=${encodeURIComponent(encrypted)}`);
}

/** Baut aus den gesetzten Teil-Cookies (ohne Löschungen) einen Request-Cookie-Header. */
function sessionHeaderFromResponse(res: Response): string {
  const setCookie = res.getHeader('set-cookie');
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [String(setCookie)] : [];
  return cookies
    .filter((cookie) => /^vereint_session(\.\d+)?=/.test(cookie) && !cookie.includes('Max-Age=0'))
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

describe('session.service', () => {
  const testSecret = TEST_SESSION_SECRET;
  const originalFetch = globalThis.fetch;

  const sampleSession: SessionData = {
    sessionId: 'sess_12345',
    uid: 'u_test_99',
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600 * 1000,
    accessTokenExpiresAt: Date.now() + 300 * 1000,
    tokens: {
      accessToken: 'acc_tok_abc',
      idToken: 'id_tok_xyz',
      refreshToken: 'ref_tok_123',
      tokenType: 'Bearer',
      expiresIn: 300,
    },
    identity: {
      uid: 'u_test_99',
      email: 'user@vereint.local',
      displayName: 'Test User',
      roles: ['member'],
      drinkRecorder: false,
    },
  };

  beforeAll(async () => {
    installTestSecrets();
    await installTestKeySet();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    installTestSecrets();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    installTestSecrets();
  });

  describe('encryption & decryption', () => {
    it('encrypts and decrypts session data losslessly with a versioned prefix', () => {
      const encrypted = encryptSessionData(sampleSession, testSecret);
      const parts = encrypted.split('.');

      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe(sessionKeyVersion(testSecret));
      expect(parts[0]).not.toContain(testSecret);

      const decrypted = decryptSessionData(encrypted, testSecret);
      expect(decrypted?.sessionId).toBe(sampleSession.sessionId);
      expect(decrypted?.uid).toBe(sampleSession.uid);
      expect(decrypted?.tokens.accessToken).toBe(sampleSession.tokens.accessToken);
    });

    it('returns undefined when tampering with encrypted payload or auth tag', () => {
      const encrypted = encryptSessionData(sampleSession, testSecret);
      const parts = encrypted.split('.');

      // Manipulierter Ciphertext
      expect(decryptSessionData([parts[0], parts[1], parts[2], `${parts[3]}tampered`].join('.'), testSecret)).toBeUndefined();

      // Manipulierter Auth-Tag
      const badTag = Buffer.from('bad_tag_16_bytes').toString('base64url');
      expect(decryptSessionData([parts[0], parts[1], badTag, parts[3]].join('.'), testSecret)).toBeUndefined();

      // Manipulierter IV
      const badIv = Buffer.alloc(12, 7).toString('base64url');
      expect(decryptSessionData([parts[0], badIv, parts[2], parts[3]].join('.'), testSecret)).toBeUndefined();

      // Falsches Secret
      expect(decryptSessionData(encrypted, TEST_PREVIOUS_SESSION_SECRET)).toBeUndefined();

      // Formatfehler
      expect(decryptSessionData('invalid.format', testSecret)).toBeUndefined();
      expect(decryptSessionData('', testSecret)).toBeUndefined();
      expect(decryptSessionData(['unknown-version', parts[1], parts[2], parts[3]].join('.'), testSecret)).toBeUndefined();
    });

    it('aborts encryption when no session secret is configured', () => {
      applyTestEnvironmentOverrides({ sessionSecretCurrent: '', sessionSecretPrevious: null });

      expect(() => encryptSessionData(sampleSession)).toThrowError('session_secret_missing');
      expect(decryptSessionData(encryptSessionData(sampleSession, testSecret))).toBeUndefined();
    });

    it('supports key rotation via SESSION_SECRET_PREVIOUS', () => {
      // Cookie mit dem alten Schlüssel erzeugt ...
      applyTestEnvironmentOverrides({
        sessionSecretCurrent: TEST_PREVIOUS_SESSION_SECRET,
        sessionSecretPrevious: null,
      });
      const legacyCookie = encryptSessionData(sampleSession);
      expect(legacyCookie.split('.')[0]).toBe(sessionKeyVersion(TEST_PREVIOUS_SESSION_SECRET));

      // ... bleibt nach der Rotation lesbar.
      applyTestEnvironmentOverrides({
        sessionSecretCurrent: TEST_SESSION_SECRET,
        sessionSecretPrevious: TEST_PREVIOUS_SESSION_SECRET,
      });
      expect(decryptSessionData(legacyCookie)?.uid).toBe(sampleSession.uid);

      // Neue Cookies nutzen die aktuelle Version.
      expect(encryptSessionData(sampleSession).split('.')[0]).toBe(sessionKeyVersion(TEST_SESSION_SECRET));

      // Ohne Vorgängerschlüssel ist das alte Cookie ungültig.
      applyTestEnvironmentOverrides({ sessionSecretPrevious: null });
      expect(decryptSessionData(legacyCookie)).toBeUndefined();
    });
  });

  describe('createSessionFromTokens', () => {
    it('extracts identity from verified tokens and sets a secure cookie', async () => {
      const res = createMockResponse();
      const tokens = await signTokenPair({
        subject: 'user_new',
        nonce: 'nonce-abc',
        accessClaims: { realm_access: { roles: ['member', 'board'] }, board_role: 'treasurer' },
        idClaims: { email: 'treasurer@vereint.local' },
      });

      const session = await createSessionFromTokens(tokens, res, { nonce: 'nonce-abc' });

      expect(session.uid).toBe('user_new');
      expect(session.identity.roles).toEqual(expect.arrayContaining(['member', 'board']));
      expect(session.identity.boardRole).toBe('treasurer');
      expect(session.identity.email).toBe('treasurer@vereint.local');
      expect(session.accessTokenExpiresAt).toBeGreaterThan(Date.now());

      const setCookie = res.getHeader('set-cookie') as string[];
      expect(setCookie.some((cookie) => cookie.startsWith('vereint_session='))).toBe(true);
      expect(setCookie.some((cookie) => cookie.includes('HttpOnly'))).toBe(true);
    });

    it('rejects tokens whose nonce does not match the login transaction', async () => {
      const res = createMockResponse();
      const tokens = await signTokenPair({ subject: 'user_new', nonce: 'nonce-from-attacker' });

      await expect(createSessionFromTokens(tokens, res, { nonce: 'nonce-expected' })).rejects.toMatchObject({
        code: 'token_nonce_mismatch',
      });
      expect(res.getHeader('set-cookie')).toBeUndefined();
    });

    it('stores a realistic large Keycloak session across multiple chunk cookies', async () => {
      const res = createMockResponse();
      const manyRoles = Array.from(
        { length: 90 },
        (_, index) => `role-${index}-with-a-fairly-long-descriptive-name`,
      );
      const tokens = await signTokenPair({
        subject: 'user_chunked',
        accessClaims: { realm_access: { roles: ['member', ...manyRoles] } },
      });

      const session = await createSessionFromTokens(tokens, res);

      const setCookie = res.getHeader('set-cookie') as string[];
      const chunkNames = setCookie
        .filter((cookie) => !cookie.includes('Max-Age=0'))
        .map((cookie) => cookie.split('=')[0]);
      expect(chunkNames.length).toBeGreaterThan(1);
      expect(chunkNames[0]).toBe('vereint_session');

      // Der über mehrere Teil-Cookies verteilte Wert wird lückenlos wieder gelesen.
      const restored = readSessionCookie(createMockRequest(sessionHeaderFromResponse(res)));
      expect(decryptSessionData(restored as string)?.uid).toBe(session.uid);
    });

    it('rejects a session whose encrypted value exceeds the total cookie capacity', async () => {
      const res = createMockResponse();
      const manyRoles = Array.from(
        { length: 500 },
        (_, index) => `bulk-role-${index}-with-a-fairly-long-name`,
      );
      const tokens = await signTokenPair({
        subject: 'user_many_roles',
        accessClaims: {
          realm_access: { roles: ['member', ...manyRoles] },
          resource_access: { 'vereint-web': { roles: manyRoles } },
        },
      });

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await expect(createSessionFromTokens(tokens, res)).rejects.toThrowError('session_cookie_too_large');
      expect(res.getHeader('set-cookie')).toBeUndefined();

      const entry = JSON.parse(warn.mock.calls[0][0] as string);
      expect(entry.event).toBe('session_cookie_too_large');
      expect(entry.detail).toContain(`limit=${MAX_SESSION_COOKIE_BYTES}`);
    });

    it('stays below the cookie limit for a normal session', async () => {
      const tokens = await signTokenPair({
        subject: 'user_normal',
        accessClaims: { realm_access: { roles: ['member'] } },
      });
      const res = createMockResponse();
      const session = await createSessionFromTokens(tokens, res);

      expect(estimateSessionCookieBytes(encryptSessionData(session))).toBeLessThan(MAX_SESSION_COOKIE_BYTES);
    });
  });

  describe('verifyRequestSession', () => {
    it('returns identity for a valid session and attaches sessionData', async () => {
      const encrypted = encryptSessionData(sampleSession);
      const req = cookieRequest(encrypted);

      const identity = await verifyRequestSession(req);
      expect(identity?.uid).toBe(sampleSession.uid);
      expect(req.sessionData?.sessionId).toBe(sampleSession.sessionId);
    });

    it('returns undefined when the session cookie is missing or corrupted', async () => {
      expect(await verifyRequestSession(createMockRequest())).toBeUndefined();
      expect(await verifyRequestSession(createMockRequest('vereint_session=corrupt.data.here.now'))).toBeUndefined();
    });

    it('denies an expired session', async () => {
      const expired = { ...sampleSession, expiresAt: Date.now() - 1000 };
      const req = cookieRequest(encryptSessionData(expired));

      expect(await verifyRequestSession(req)).toBeUndefined();
    });

    it('refreshes within the grace period and persists the rotated refresh token', async () => {
      const nearlyExpired: SessionData = {
        ...sampleSession,
        sessionId: 'sess_refresh_1',
        accessTokenExpiresAt: Date.now() + REFRESH_GRACE_MS - 1000,
      };

      const refreshedTokens = await signTokenPair({
        subject: sampleSession.uid,
        accessClaims: { realm_access: { roles: ['member', 'admin'] } },
      });

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...refreshedTokens, refresh_token: 'rotated_refresh_token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = createMockResponse();
      const req = cookieRequest(encryptSessionData(nearlyExpired));

      const identity = await verifyRequestSession(req, res);
      expect(identity?.roles).toContain('admin');
      expect(req.sessionData?.tokens.refreshToken).toBe('rotated_refresh_token');
      expect(res.getHeader('set-cookie')).toBeDefined();
    });

    it('serializes parallel refreshes of the same session into a single token call', async () => {
      const nearlyExpired: SessionData = {
        ...sampleSession,
        sessionId: 'sess_parallel_1',
        accessTokenExpiresAt: Date.now() - 1000,
      };

      const refreshedTokens = await signTokenPair({ subject: sampleSession.uid });
      let calls = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new Response(JSON.stringify({ ...refreshedTokens, refresh_token: 'rotated_once' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const encrypted = encryptSessionData(nearlyExpired);
      const results = await Promise.all([
        verifyRequestSession(cookieRequest(encrypted), createMockResponse()),
        verifyRequestSession(cookieRequest(encrypted), createMockResponse()),
        verifyRequestSession(cookieRequest(encrypted), createMockResponse()),
      ]);

      expect(calls).toBe(1);
      for (const identity of results) {
        expect(identity?.uid).toBe(sampleSession.uid);
      }
    });

    it('denies the session when the refresh fails and logs it without tokens', async () => {
      const nearlyExpired: SessionData = {
        ...sampleSession,
        sessionId: 'sess_refresh_fail',
        accessTokenExpiresAt: Date.now() - 1000,
      };

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 }));

      const req = cookieRequest(encryptSessionData(nearlyExpired));
      expect(await verifyRequestSession(req, createMockResponse())).toBeUndefined();

      const entry = JSON.parse(warn.mock.calls[0][0] as string);
      expect(entry.event).toBe('oidc_token_refresh');
      expect(warn.mock.calls[0][0]).not.toContain('ref_tok_123');
    });

    it('denies the session when a refresh is due but no refresh token exists', async () => {
      const noRefresh: SessionData = {
        ...sampleSession,
        sessionId: 'sess_no_refresh',
        accessTokenExpiresAt: Date.now() - 1000,
        tokens: { accessToken: 'only_access_token' },
      };

      const req = cookieRequest(encryptSessionData(noRefresh));
      expect(await verifyRequestSession(req, createMockResponse())).toBeUndefined();
    });

    it('denies the refresh when no response object can persist the rotated token', async () => {
      const nearlyExpired: SessionData = {
        ...sampleSession,
        sessionId: 'sess_no_res',
        accessTokenExpiresAt: Date.now() - 1000,
      };

      globalThis.fetch = vi.fn();
      const req = cookieRequest(encryptSessionData(nearlyExpired));

      expect(await verifyRequestSession(req)).toBeUndefined();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('destroySession', () => {
    it('clears the cookie, invalidates the identity and notifies Keycloak', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

      const res = createMockResponse();
      const req = cookieRequest(encryptSessionData(sampleSession));
      req.identity = sampleSession.identity;
      req.sessionData = sampleSession;

      await expect(destroySession(req, res)).resolves.toBe(true);

      expect(req.identity).toBeUndefined();
      expect(req.sessionData).toBeUndefined();
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/protocol/openid-connect/logout'),
        expect.objectContaining({ method: 'POST' }),
      );

      const setCookie = res.getHeader('set-cookie') as string[];
      expect(Array.isArray(setCookie)).toBe(true);
      expect(setCookie.some((cookie) => /^vereint_session=;/.test(cookie) && cookie.includes('Max-Age=0'))).toBe(true);
    });

    it('clears the local session even when the backchannel logout fails', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));

      const res = createMockResponse();
      const req = cookieRequest(encryptSessionData(sampleSession));

      await expect(destroySession(req, res)).resolves.toBe(false);
      const cleared = res.getHeader('set-cookie') as string[];
      expect(cleared.some((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
    });
  });
});
