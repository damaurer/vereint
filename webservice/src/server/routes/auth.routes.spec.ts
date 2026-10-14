import express from 'express';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachIdentity } from '../auth/auth.middleware';
import type { OidcTransactionState } from '../auth/auth.types';
import { installTestKeySet, installTestSecrets, signTokenPair } from '../auth/testing/token-fixtures';
import { serverEnvironment } from '../config/environment';
import { authRoutes } from './auth.routes';

describe('auth.routes', () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;
  const originalFetch = globalThis.fetch;

  function stateCookie(state: Partial<OidcTransactionState>): string {
    const value: OidcTransactionState = {
      state: 'valid_state_abc',
      codeVerifier: 'verifier_xyz_123456789012345678901234567890',
      returnTo: '/app',
      createdAt: Date.now(),
      ...state,
    };
    return `__oidc_state=${encodeURIComponent(JSON.stringify(value))}`;
  }

  function mockTokenEndpoint(body: unknown, status = 200): void {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes('/protocol/openid-connect/token')) {
        return new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/protocol/openid-connect/logout')) {
        return new Response(null, { status: 204 });
      }
      return originalFetch(url, init);
    });
  }

  beforeAll(async () => {
    installTestSecrets();
    await installTestKeySet();

    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(attachIdentity);
    app.use('/api/auth', authRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    installTestSecrets();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('GET /api/auth/login', () => {
    it('redirects to Keycloak authorization endpoint and sets __oidc_state cookie', async () => {
      const response = await originalFetch(`${baseUrl}/api/auth/login?returnTo=/events/test-event`, {
        redirect: 'manual',
      });

      expect(response.status).toBe(302);
      const location = response.headers.get('location') ?? '';
      expect(location).toContain('/protocol/openid-connect/auth');
      expect(location).toContain('client_id=vereint-web');
      expect(location).toContain('code_challenge_method=S256');
      expect(location).toContain('nonce=');

      const setCookie = response.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain('__oidc_state=');
      expect(setCookie).toContain('HttpOnly');

      const state = JSON.parse(
        decodeURIComponent(setCookie.split('__oidc_state=')[1].split(';')[0]),
      ) as OidcTransactionState;
      expect(state.returnTo).toBe('/events/test-event');
    });

    it('passes the app language to Keycloak as ui_locales', async () => {
      const chosen = await originalFetch(`${baseUrl}/api/auth/login`, {
        redirect: 'manual',
        headers: { cookie: 'vereint.lang=en', 'accept-language': 'de-DE' },
      });
      expect(chosen.headers.get('location')).toContain('ui_locales=en');

      const browser = await originalFetch(`${baseUrl}/api/auth/login`, {
        redirect: 'manual',
        headers: { 'accept-language': 'en-US,en;q=0.9' },
      });
      expect(browser.headers.get('location')).toContain('ui_locales=en');

      const unsupported = await originalFetch(`${baseUrl}/api/auth/login`, {
        redirect: 'manual',
        headers: { 'accept-language': 'fr-FR' },
      });
      expect(unsupported.headers.get('location')).toContain('ui_locales=de');
    });

    it('drops a malicious returnTo before storing the transaction state', async () => {
      for (const malicious of ['//evil.example.com', 'https://evil.example.com/app', '/unknown-area']) {
        const response = await originalFetch(
          `${baseUrl}/api/auth/login?returnTo=${encodeURIComponent(malicious)}`,
          { redirect: 'manual' },
        );

        const setCookie = response.headers.get('set-cookie') ?? '';
        const state = JSON.parse(
          decodeURIComponent(setCookie.split('__oidc_state=')[1].split(';')[0]),
        ) as OidcTransactionState;

        expect(state.returnTo).toBe('/app');
      }
    });
  });

  describe('GET /api/auth/callback', () => {
    it('handles successful OIDC code exchange, creates session and redirects to returnTo', async () => {
      const tokens = await signTokenPair({
        subject: 'u-12345',
        nonce: 'nonce-ok',
        accessClaims: { realm_access: { roles: ['member'] } },
        idClaims: { email: 'user@vereint.local', name: 'Member User' },
      });
      mockTokenEndpoint(tokens);

      const response = await originalFetch(`${baseUrl}/api/auth/callback?code=good_code&state=valid_state_abc`, {
        headers: {
          Cookie: stateCookie({ returnTo: '/events/my-event', nonce: 'nonce-ok' }),
          Accept: 'text/html',
        },
        redirect: 'manual',
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/events/my-event');

      const setCookies = response.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes('vereint_session='))).toBe(true);
      expect(setCookies.some((c) => c.includes('__oidc_state=') && c.includes('Max-Age=0'))).toBe(true);
    });

    it('redirects to a safe default when returnTo in the state is malicious', async () => {
      const tokens = await signTokenPair({ subject: 'u-12345', nonce: 'nonce-ok' });
      mockTokenEndpoint(tokens);

      const response = await originalFetch(`${baseUrl}/api/auth/callback?code=good_code&state=valid_state_abc`, {
        headers: {
          Cookie: stateCookie({ returnTo: '//evil.example.com', nonce: 'nonce-ok' }),
          Accept: 'text/html',
        },
        redirect: 'manual',
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/app');
    });

    it('rejects a callback whose id token nonce does not match the transaction', async () => {
      const tokens = await signTokenPair({ subject: 'u-12345', nonce: 'nonce-from-attacker' });
      mockTokenEndpoint(tokens);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const response = await originalFetch(`${baseUrl}/api/auth/callback?code=good_code&state=valid_state_abc`, {
        headers: { Cookie: stateCookie({ nonce: 'nonce-expected' }), Accept: 'text/html' },
        redirect: 'manual',
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain('/auth/error?error=oidc_login_failed');
      expect(response.headers.getSetCookie().some((c) => c.includes('vereint_session='))).toBe(false);
      expect(warn).toHaveBeenCalled();
    });

    it('rejects a callback with a tampered id token signature', async () => {
      const tokens = await signTokenPair({ subject: 'u-12345', nonce: 'nonce-ok' });
      const [header, payload, signature] = tokens.id_token.split('.');
      mockTokenEndpoint({ ...tokens, id_token: `${header}.${payload}.${signature.slice(0, -4)}AAAA` });
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const response = await originalFetch(`${baseUrl}/api/auth/callback?code=good_code&state=valid_state_abc`, {
        headers: { Cookie: stateCookie({ nonce: 'nonce-ok' }), Accept: 'text/html' },
        redirect: 'manual',
      });

      expect(response.headers.get('location')).toContain('/auth/error?error=oidc_login_failed');
      expect(response.headers.getSetCookie().some((c) => c.includes('vereint_session='))).toBe(false);
    });

    it('rejects a callback with mismatched state parameter and logs the event', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const response = await originalFetch(`${baseUrl}/api/auth/callback?code=good_code&state=different_state`, {
        headers: { Cookie: stateCookie({ state: 'correct_state' }), Accept: 'text/html' },
        redirect: 'manual',
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain('/auth/error?error=invalid_state');

      const entry = JSON.parse(warn.mock.calls[0][0] as string);
      expect(entry.event).toBe('oidc_callback');
      expect(entry.errorClass).toBe('state_mismatch');
      expect(entry.correlationId).toBeTruthy();
      expect(entry.timestamp).toBeTruthy();
      expect(entry.remoteAddress).toBeTruthy();
      expect(warn.mock.calls[0][0]).not.toContain('good_code');
      expect(warn.mock.calls[0][0]).not.toContain('verifier_xyz');
    });

    it('rejects an expired transaction state', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const response = await originalFetch(`${baseUrl}/api/auth/callback?code=good_code&state=valid_state_abc`, {
        headers: {
          Cookie: stateCookie({ createdAt: Date.now() - 20 * 60 * 1000 }),
          Accept: 'text/html',
        },
        redirect: 'manual',
      });

      expect(response.headers.get('location')).toContain('/auth/error?error=oidc_login_failed');
    });

    it('handles Keycloak error response during callback', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const response = await originalFetch(
        `${baseUrl}/api/auth/callback?error=access_denied&error_description=User+cancelled`,
        { headers: { Accept: 'text/html' }, redirect: 'manual' },
      );

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain('/auth/error?error=');
    });

    it('answers non-html clients with an error code and trace id', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const response = await originalFetch(`${baseUrl}/api/auth/callback?code=c&state=x`, {
        headers: { Accept: 'application/json' },
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { code: string; traceId: string };
      expect(body.code).toBe('oidc_login_failed');
      expect(body.traceId).toBeTruthy();
    });
  });

  describe('GET /api/auth/me & GET /api/auth/session', () => {
    it('returns 401 unauthenticated when no session is present', async () => {
      const response = await originalFetch(`${baseUrl}/api/auth/me`);
      expect(response.status).toBe(401);

      const data = (await response.json()) as { authenticated: boolean; code: string };
      expect(data.authenticated).toBe(false);
      expect(data.code).toBe('oidc_session_expired');
    });

    it('returns only subject, displayName, roles, boardRole and permissions', async () => {
      const tokens = await signTokenPair({
        subject: 'u-auth-test',
        nonce: 'nonce-me',
        accessClaims: {
          realm_access: { roles: ['board', 'member'] },
          board_role: 'chair',
          permissions: ['ledger.read'],
        },
        idClaims: { email: 'board@vereint.local', name: 'Board Member' },
      });
      mockTokenEndpoint(tokens);

      const loginRes = await originalFetch(`${baseUrl}/api/auth/callback?code=code1&state=valid_state_abc`, {
        headers: { Cookie: stateCookie({ nonce: 'nonce-me' }) },
        redirect: 'manual',
      });

      const sessionCookie = loginRes.headers.getSetCookie().find((c) => c.startsWith('vereint_session='));
      expect(sessionCookie).toBeDefined();

      const meRes = await originalFetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: sessionCookie!.split(';')[0] },
      });

      expect(meRes.status).toBe(200);
      const meData = (await meRes.json()) as {
        authenticated: boolean;
        identity: Record<string, unknown>;
      };

      expect(meData.authenticated).toBe(true);
      expect(meData.identity['subject']).toBe('u-auth-test');
      expect(meData.identity['roles']).toContain('board');
      expect(meData.identity['boardRole']).toBe('chair');
      expect(meData.identity['permissions']).toContain('ledger.read');
      expect(Object.keys(meData.identity).sort()).toEqual([
        'boardRole',
        'displayName',
        'permissions',
        'roles',
        'subject',
      ]);
      expect(meData.identity['email']).toBeUndefined();
    });
  });

  describe('POST /api/auth/session', () => {
    it('rejects the removed legacy id token endpoint', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const response = await originalFetch(`${baseUrl}/api/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'irrelevant' }),
      });

      expect(response.status).toBe(410);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe('invalid_request');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears session cookie and returns 204', async () => {
      mockTokenEndpoint({});

      const response = await originalFetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });

      expect(response.status).toBe(204);
      const setCookies = response.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes('vereint_session=') && c.includes('Max-Age=0'))).toBe(true);
    });
  });

  describe('GET /api/auth/logout', () => {
    it('redirects to end-session URL with /auth/logged-out', async () => {
      mockTokenEndpoint({});

      const response = await originalFetch(`${baseUrl}/api/auth/logout`, {
        headers: { Accept: 'text/html' },
        redirect: 'manual',
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toContain('/protocol/openid-connect/logout');
      expect(response.headers.get('location')).toContain(
        `post_logout_redirect_uri=${encodeURIComponent(`${serverEnvironment.publicBaseUrl}/auth/logged-out`)}`,
      );
    });
  });
});
