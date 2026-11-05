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

  describe('GET /api/auth/account-security', () => {
    it('redirects to the two-factor page of the Keycloak account console', async () => {
      const response = await originalFetch(`${baseUrl}/api/auth/account-security`, { redirect: 'manual' });

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toMatch(
        /\/realms\/vereint\/account\/account-security\/signing-in$/,
      );
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

    it('returns only subject, displayName, roles, boardRole, permissions and the Stammtisch fields', async () => {
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
        'appContexts',
        'boardRole',
        'displayName',
        'memberships',
        'permissions',
        'platformAdmin',
        'roles',
        'stammtisch',
        'subject',
      ]);
      expect(meData.identity['email']).toBeUndefined();
    });
  });

  describe('GET /api/auth/me permissions', () => {
    it('adds the permissions of the backend role matrix to the identity', async () => {
      const tokens = await signTokenPair({
        subject: 'u-terminal',
        nonce: 'nonce-terminal',
        accessClaims: { realm_access: { roles: ['tabletRecorder', 'member'] } },
        idClaims: { name: 'Theke' },
      });
      mockTokenEndpoint(tokens);
      const tokenFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.endsWith('/api/v1/auth/access')) {
          return new Response(
            JSON.stringify({
              subject: 'u-terminal',
              roles: ['tabletRecorder', 'member'],
              drinkRecorder: true,
              permissions: ['purchase.tablet', 'profile.read.self'],
              allowedAppContexts: ['memberPwa', 'tabletRecorder'],
              eventScopes: [],
              ownedEvents: [],
              disabled: false,
              matrixVersion: 2,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return (tokenFetch as typeof fetch)(url, init);
      });

      const loginRes = await originalFetch(`${baseUrl}/api/auth/callback?code=code2&state=valid_state_abc`, {
        headers: { Cookie: stateCookie({ nonce: 'nonce-terminal' }) },
        redirect: 'manual',
      });
      const sessionCookie = loginRes.headers.getSetCookie().find((c) => c.startsWith('vereint_session='));

      const meRes = await originalFetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: sessionCookie!.split(';')[0] },
      });
      const meData = (await meRes.json()) as { identity: { permissions: string[] } };

      expect(meData.identity.permissions).toContain('purchase.tablet');
    });
  });

  describe('POST /api/auth/stammtisch', () => {
    const memberOf = '11111111-1111-4111-8111-111111111111';
    const foreign = '22222222-2222-4222-8222-222222222222';

    async function loginWithStammtischBackend(
      memberships: { id: string; name: string; roles: string[]; imageVersion?: number }[] = [
        { id: memberOf, name: 'Stammtisch A', roles: ['board'], imageVersion: 7 },
        { id: '33333333-3333-4333-8333-333333333333', name: 'Stammtisch C', roles: ['member'] },
      ],
    ): Promise<string> {
      const tokens = await signTokenPair({
        subject: 'u-multi',
        nonce: 'nonce-multi',
        accessClaims: { realm_access: { roles: ['member'] } },
        idClaims: { name: 'Mehrfachmitglied' },
      });
      mockTokenEndpoint(tokens);
      const tokenFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.endsWith('/api/v1/auth/access')) {
          const selected = (init?.headers as Record<string, string> | undefined)?.['X-Stammtisch-Id'];
          if (selected === foreign) {
            return new Response(JSON.stringify({ code: 'stammtisch_access_denied' }), {
              status: 403,
              headers: { 'Content-Type': 'application/problem+json' },
            });
          }
          return new Response(
            JSON.stringify({
              subject: 'u-multi',
              roles: selected ? ['board'] : [],
              permissions: selected ? ['event.manage'] : [],
              allowedAppContexts: selected ? ['memberPwa', 'boardGeneral'] : [],
              eventScopes: [],
              ownedEvents: [],
              disabled: false,
              stammtischId: selected,
              stammtischName: selected ? 'Stammtisch A' : undefined,
              platformAdmin: false,
              memberships,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return (tokenFetch as typeof fetch)(url, init);
      });

      const loginRes = await originalFetch(`${baseUrl}/api/auth/callback?code=code3&state=valid_state_abc`, {
        headers: { Cookie: stateCookie({ nonce: 'nonce-multi' }) },
        redirect: 'manual',
      });
      const sessionCookie = loginRes.headers.getSetCookie().find((c) => c.startsWith('vereint_session='));
      return sessionCookie!.split(';')[0];
    }

    it('remembers a Stammtisch the person belongs to and reports its roles', async () => {
      const session = await loginWithStammtischBackend();

      const before = await originalFetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: session } });
      const beforeData = (await before.json()) as {
        identity: { stammtisch: unknown; memberships: { id: string; imageVersion: number | null }[] };
      };
      expect(beforeData.identity.stammtisch).toBeNull();
      expect(beforeData.identity.memberships).toHaveLength(2);
      // Die Bildversion der Gruppe wird durchgereicht; ohne Bild `null`.
      expect(beforeData.identity.memberships.map((m) => m.imageVersion)).toEqual([7, null]);

      const select = await originalFetch(`${baseUrl}/api/auth/stammtisch`, {
        method: 'POST',
        headers: { Cookie: session, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stammtischId: memberOf }),
      });
      expect(select.status).toBe(204);
      const cookie = select.headers.getSetCookie().find((c) => c.startsWith('vereint.stammtisch='));
      expect(cookie).toContain(memberOf);
      expect(cookie).toContain('HttpOnly');

      const after = await originalFetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: `${session}; vereint.stammtisch=${memberOf}` },
      });
      const afterData = (await after.json()) as {
        identity: { stammtisch: { id: string; name: string; imageVersion: number | null }; roles: string[]; appContexts: string[] };
      };
      expect(afterData.identity.stammtisch).toEqual({ id: memberOf, name: 'Stammtisch A', imageVersion: 7 });
      expect(afterData.identity.roles).toEqual(['board']);
      expect(afterData.identity.appContexts).toContain('boardGeneral');
    });

    it('refuses a Stammtisch without membership and drops a stale cookie', async () => {
      const session = await loginWithStammtischBackend();

      const select = await originalFetch(`${baseUrl}/api/auth/stammtisch`, {
        method: 'POST',
        headers: { Cookie: session, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stammtischId: foreign }),
      });
      expect(select.status).toBe(403);
      expect(select.headers.getSetCookie().some((c) => c.startsWith(`vereint.stammtisch=${foreign}`))).toBe(false);

      const me = await originalFetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: `${session}; vereint.stammtisch=${foreign}` },
      });
      const meData = (await me.json()) as { identity: { stammtisch: unknown } };
      expect(meData.identity.stammtisch).toBeNull();
      expect(me.headers.getSetCookie().some((c) => c.startsWith('vereint.stammtisch=;') && c.includes('Max-Age=0'))).toBe(true);
    });

    it('drops cached decisions on selection so a new membership shows up everywhere', async () => {
      const memberships = [{ id: memberOf, name: 'Stammtisch A', roles: ['board'] }];
      const session = await loginWithStammtischBackend(memberships);

      const before = await originalFetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: session } });
      expect(((await before.json()) as { identity: { memberships: unknown[] } }).identity.memberships).toHaveLength(1);

      // Eigenen Stammtisch eröffnet: Der Fachservice kennt jetzt zwei Mitgliedschaften.
      const created = '44444444-4444-4444-8444-444444444444';
      memberships.push({ id: created, name: 'Neuer Stammtisch', roles: ['admin'] });
      const select = await originalFetch(`${baseUrl}/api/auth/stammtisch`, {
        method: 'POST',
        headers: { Cookie: session, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stammtischId: created }),
      });
      expect(select.status).toBe(204);

      // Auch die zuvor gecachte Entscheidung ohne Auswahl ist verworfen.
      const after = await originalFetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: session } });
      const afterData = (await after.json()) as { identity: { memberships: { id: string }[] } };
      expect(afterData.identity.memberships.map((m) => m.id)).toEqual([memberOf, created]);
    });

    it('rejects values that are not a Stammtisch id', async () => {
      const session = await loginWithStammtischBackend();

      const select = await originalFetch(`${baseUrl}/api/auth/stammtisch`, {
        method: 'POST',
        headers: { Cookie: session, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stammtischId: '../admin' }),
      });
      expect(select.status).toBe(400);
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
