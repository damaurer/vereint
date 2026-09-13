import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestIdentity } from '../auth/auth.types';
import { authorizePages, buildLoginRedirect, loginPathForContext } from './authorization.middleware';
import { clearAccessDecisionCache } from './authorization.service';
import type { ResolvedAccessDecision } from './authorization.types';

function accessDecision(overrides: Partial<ResolvedAccessDecision> = {}): ResolvedAccessDecision {
  return {
    subject: 'sub-test',
    disabled: false,
    roles: ['member'],
    drinkRecorder: false,
    permissions: [],
    eventScopes: [],
    ownedEvents: [],
    allowedAppContexts: ['memberPwa'],
    matrixVersion: 1,
    ...overrides,
  };
}

/** Resolver-Antwort für `GET /api/v1/auth/access`. */
function stubResolver(decision: ResolvedAccessDecision) {
  const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => decision });
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

function stubGuest(allowed: boolean) {
  const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ allowed }) });
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

function createMockReqRes(options: {
  path: string;
  originalUrl?: string;
  identity?: RequestIdentity;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  sessionId?: string;
  accessToken?: string;
}) {
  const req = {
    path: options.path,
    method: 'GET',
    originalUrl: options.originalUrl || options.path,
    identity: options.identity,
    query: options.query || {},
    headers: options.headers || {},
    sessionData: options.identity
      ? {
          sessionId: options.sessionId ?? `session-${options.path}`,
          uid: options.identity.uid,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
          tokens: { accessToken: options.accessToken ?? 'access-token' },
          identity: options.identity,
        }
      : undefined,
  } as unknown as Request;

  const setHeader = vi.fn();
  const redirect = vi.fn();
  const send = vi.fn();
  const json = vi.fn();
  const type = vi.fn();
  const status = vi.fn();

  const res = {
    setHeader,
    redirect,
    send,
    json,
    type,
    status,
  } as unknown as Response;

  type.mockReturnValue(res);
  status.mockReturnValue(res);

  const next = vi.fn();

  return { req, res, next, setHeader, redirect, send, json, status };
}

describe('authorizePages Express Middleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearAccessDecisionCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearAccessDecisionCache();
  });

  it('allows public paths and API endpoints without authentication', async () => {
    const publicTestPaths = [
      '/',
      '/login',
      '/web/login',
      '/pwa/login',
      '/password-reset',
      '/invite/accept',
      '/403',
      '/404',
      '/api/auth/login',
    ];

    for (const path of publicTestPaths) {
      const { req, res, next } = createMockReqRes({ path });
      await authorizePages(req, res, next);
      expect(next).toHaveBeenCalled();
    }
  });

  it('does not set cache headers itself; they belong to the delivery middleware', async () => {
    stubResolver(accessDecision());
    const identity: RequestIdentity = { uid: 'user-member', roles: ['member'], drinkRecorder: false };

    const { req, res, next, setHeader } = createMockReqRes({ path: '/app', identity });
    await authorizePages(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(setHeader).not.toHaveBeenCalledWith('Cache-Control', expect.anything());
  });

  it('redirects unauthenticated navigation to the context specific login', async () => {
    const cases: { path: string; login: string }[] = [
      { path: '/dashboard', login: '/pwa/login' },
      { path: '/app', login: '/pwa/login' },
      { path: '/board/treasury', login: '/web/login' },
      { path: '/board/communications', login: '/web/login' },
      { path: '/admin', login: '/web/login' },
      { path: '/tablet', login: '/web/login' },
    ];

    for (const testCase of cases) {
      const { req, res, next, redirect } = createMockReqRes({ path: testCase.path });
      await authorizePages(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(redirect).toHaveBeenCalledWith(
        `${testCase.login}?returnUrl=${encodeURIComponent(testCase.path)}`,
      );
    }
  });

  describe('returnUrl validation', () => {
    it('accepts only relative paths on known app prefixes', () => {
      expect(buildLoginRedirect('memberPwa', '/wallet?tab=ledger')).toBe(
        `/pwa/login?returnUrl=${encodeURIComponent('/wallet?tab=ledger')}`,
      );
    });

    it('drops protocol relative, absolute and unknown targets', () => {
      expect(buildLoginRedirect('memberPwa', '//evil.example.org/app')).toBe('/pwa/login');
      expect(buildLoginRedirect('memberPwa', 'https://evil.example.org/app')).toBe('/pwa/login');
      expect(buildLoginRedirect('admin', '/unknown-area')).toBe('/web/login');
      expect(buildLoginRedirect('memberPwa', '/app/../../etc/passwd')).toBe('/pwa/login');
    });

    it('maps contexts to the matching login entry', () => {
      expect(loginPathForContext('memberPwa')).toBe('/pwa/login');
      expect(loginPathForContext('event')).toBe('/pwa/login');
      expect(loginPathForContext('eventOwner')).toBe('/pwa/login');
      expect(loginPathForContext('boardGeneral')).toBe('/web/login');
      expect(loginPathForContext('admin')).toBe('/web/login');
      expect(loginPathForContext('tabletRecorder')).toBe('/web/login');
    });

    it('does not append a manipulated returnUrl from the request', async () => {
      const { req, res, next, redirect } = createMockReqRes({
        path: '/app',
        originalUrl: '//evil.example.org/app',
      });

      await authorizePages(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(redirect).toHaveBeenCalledWith('/pwa/login');
    });
  });

  describe('API requests receive status codes instead of HTML redirects', () => {
    it('answers 401 in the problem format without a session', async () => {
      const { req, res, next, redirect, status, json } = createMockReqRes({
        path: '/app',
        headers: { accept: 'application/json' },
      });

      await authorizePages(req, res, next);

      expect(redirect).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 401, code: 'oidc_session_expired' }),
      );
    });

    it('answers 403 in the problem format without the required right', async () => {
      stubResolver(accessDecision({ allowedAppContexts: ['memberPwa'] }));
      const identity: RequestIdentity = { uid: 'user-member', roles: ['member'], drinkRecorder: false };

      const { req, res, next, redirect, status, json } = createMockReqRes({
        path: '/admin',
        identity,
        headers: { accept: 'application/json' },
      });

      await authorizePages(req, res, next);

      expect(redirect).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ status: 403, code: 'access_denied' }));
    });
  });

  describe('fail closed when the resolver is unavailable', () => {
    it('answers 503 with a maintenance page for navigation', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
      const identity: RequestIdentity = { uid: 'user-admin', roles: ['admin'], drinkRecorder: false };

      const { req, res, next, redirect, status, send } = createMockReqRes({
        path: '/admin',
        identity,
        headers: { accept: 'text/html' },
      });

      await authorizePages(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(503);
      expect(send).toHaveBeenCalledWith(expect.stringContaining('nicht prüfbar'));
    });

    it('answers 503 in the problem format for API requests', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
      const identity: RequestIdentity = { uid: 'user-admin', roles: ['admin'], drinkRecorder: false };

      const { req, res, next, status, json } = createMockReqRes({
        path: '/admin',
        identity,
        headers: { accept: 'application/json' },
      });

      await authorizePages(req, res, next);

      expect(status).toHaveBeenCalledWith(503);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 503, code: 'service_unavailable' }),
      );
    });
  });

  describe('context decisions from the resolver response', () => {
    it('allows an authenticated member in the member context', async () => {
      stubResolver(accessDecision());
      const identity: RequestIdentity = { uid: 'user-member', roles: ['member'], drinkRecorder: false };

      const { req, res, next, redirect } = createMockReqRes({ path: '/app', identity });
      await authorizePages(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(redirect).not.toHaveBeenCalled();
    });

    it('redirects a member without board rights to /403', async () => {
      stubResolver(accessDecision());
      const identity: RequestIdentity = { uid: 'user-member', roles: ['member'], drinkRecorder: false };

      const { req, res, next, redirect } = createMockReqRes({ path: '/board/treasury', identity });
      await authorizePages(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(redirect).toHaveBeenCalledWith('/403');
    });

    it('allows a treasurer in the treasury context', async () => {
      stubResolver(
        accessDecision({
          roles: ['board'],
          boardRole: 'treasurer',
          allowedAppContexts: ['memberPwa', 'boardGeneral', 'boardTreasury'],
        }),
      );
      const identity: RequestIdentity = {
        uid: 'user-treasurer',
        roles: ['board'],
        boardRole: 'treasurer',
        drinkRecorder: false,
      };

      const { req, res, next, redirect } = createMockReqRes({ path: '/board/treasury', identity });
      await authorizePages(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(redirect).not.toHaveBeenCalled();
    });

    it('allows a drink recorder on the tablet route', async () => {
      stubResolver(
        accessDecision({ drinkRecorder: true, allowedAppContexts: ['memberPwa', 'tabletRecorder'] }),
      );
      const identity: RequestIdentity = { uid: 'user-tablet', roles: ['member'], drinkRecorder: true };

      const { req, res, next, redirect } = createMockReqRes({ path: '/tablet', identity });
      await authorizePages(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(redirect).not.toHaveBeenCalled();
    });

    it('redirects to /403 when the event is only joined, not owned', async () => {
      stubResolver(
        accessDecision({
          eventScopes: ['evt-foreign'],
          ownedEvents: [],
          allowedAppContexts: ['memberPwa', 'event'],
        }),
      );
      const identity: RequestIdentity = { uid: 'user-member', roles: ['member'], drinkRecorder: false };

      const { req, res, next, redirect } = createMockReqRes({
        path: '/events/evt-foreign/manage',
        identity,
      });
      await authorizePages(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(redirect).toHaveBeenCalledWith('/403');
    });

    it('allows the owner of the event to manage it', async () => {
      stubResolver(
        accessDecision({
          eventScopes: ['evt-owned'],
          ownedEvents: ['evt-owned'],
          allowedAppContexts: ['memberPwa', 'event', 'eventOwner'],
        }),
      );
      const identity: RequestIdentity = { uid: 'user-member', roles: ['member'], drinkRecorder: false };

      const { req, res, next, redirect } = createMockReqRes({ path: '/events/evt-owned/manage', identity });
      await authorizePages(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(redirect).not.toHaveBeenCalled();
    });
  });

  describe('guest context', () => {
    it('allows guest access with a valid guest token', async () => {
      stubGuest(true);

      const { req, res, next, redirect } = createMockReqRes({
        path: '/guest/evt-100',
        query: { token: 'valid-guest-token' },
      });
      await authorizePages(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(redirect).not.toHaveBeenCalled();
    });

    it('redirects to /403 with an invalid guest token', async () => {
      stubGuest(false);

      const { req, res, next, redirect } = createMockReqRes({
        path: '/guest/evt-100',
        query: { token: 'revoked-token' },
      });
      await authorizePages(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(redirect).toHaveBeenCalledWith('/403');
    });
  });
});
