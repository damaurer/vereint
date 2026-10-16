import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestIdentity } from '../auth/auth.types';
import {
  ACCESS_DECISION_TTL_MS,
  accessDecisionCacheSize,
} from './access-decision-cache';
import {
  RESOLVER_TIMEOUT_MS,
  checkResourceAccess,
  clearAccessDecisionCache,
  fetchRolePermissionMatrix,
  hasAnyRole,
  hasBoardRole,
  invalidateAccessDecision,
  invalidateAccessDecisionsForSubject,
  resolveAccessDecision,
  resolvePathAppContext,
} from './authorization.service';
import type { ResolvedAccessDecision } from './authorization.types';
import { denyAllDecision, normalizeDecision } from './authorization.types';

const memberIdentity: RequestIdentity = {
  uid: 'sub-member',
  roles: ['member'],
  drinkRecorder: false,
};

function decision(overrides: Partial<ResolvedAccessDecision> = {}): ResolvedAccessDecision {
  return {
    subject: 'sub-member',
    disabled: false,
    roles: ['member'],
    drinkRecorder: false,
    permissions: ['profile.read.self'],
    eventScopes: [],
    ownedEvents: [],
    allowedAppContexts: ['memberPwa'],
    matrixVersion: 1,
    ...overrides,
  };
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function problemResponse(status: number, body: Record<string, unknown>) {
  return { ok: false, status, json: async () => body };
}

describe('Authorization & Access Resolver Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearAccessDecisionCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    clearAccessDecisionCache();
  });

  describe('resolvePathAppContext', () => {
    it('correctly maps URL paths to target AppContext', () => {
      expect(resolvePathAppContext('/admin')).toEqual({ appContext: 'admin' });
      expect(resolvePathAppContext('/admin/users')).toEqual({ appContext: 'admin' });
      expect(resolvePathAppContext('/board/treasury')).toEqual({ appContext: 'boardTreasury' });
      expect(resolvePathAppContext('/board/communications')).toEqual({ appContext: 'boardCommunications' });
      expect(resolvePathAppContext('/board')).toEqual({ appContext: 'boardGeneral' });
      expect(resolvePathAppContext('/tablet')).toEqual({ appContext: 'tabletRecorder' });
      expect(resolvePathAppContext('/events/evt-100/manage')).toEqual({
        appContext: 'eventOwner',
        eventId: 'evt-100',
        isManage: true,
      });
      expect(resolvePathAppContext('/events/evt-100')).toEqual({
        appContext: 'event',
        eventId: 'evt-100',
      });
      expect(resolvePathAppContext('/guest/evt-200')).toEqual({
        appContext: 'eventGuest',
        eventId: 'evt-200',
      });
      expect(resolvePathAppContext('/app')).toEqual({ appContext: 'memberPwa' });
      expect(resolvePathAppContext('/dashboard')).toEqual({ appContext: 'memberPwa' });
      expect(resolvePathAppContext('/wallet')).toEqual({ appContext: 'memberPwa' });
      expect(resolvePathAppContext('/events/new')).toEqual({ appContext: 'memberPwa' });
      expect(resolvePathAppContext('/unknown')).toBeNull();
    });
  });

  describe('deny by default', () => {
    it('denies everything without an identity', async () => {
      const result = await resolveAccessDecision({});

      expect(result.outcome).toBe('unauthenticated');
      expect(result.decision).toEqual(denyAllDecision());
    });

    it('normalizes a partial resolver payload into a complete decision', () => {
      const normalized = normalizeDecision({ subject: 'sub-x' });

      expect(normalized).toEqual({
        subject: 'sub-x',
        userId: undefined,
        displayName: undefined,
        email: undefined,
        disabled: false,
        roles: [],
        boardRole: undefined,
        drinkRecorder: false,
        permissions: [],
        eventScopes: [],
        ownedEvents: [],
        allowedAppContexts: [],
        matrixVersion: undefined,
      });
    });

    it('rejects a payload without subject', () => {
      expect(normalizeDecision({ roles: ['admin'] })).toBeUndefined();
      expect(normalizeDecision(null)).toBeUndefined();
    });
  });

  describe('eventOwner derives from ownedEvents only', () => {
    it('denies a mere participant even when the event is in eventScopes', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          okResponse(
            decision({
              eventScopes: ['evt-joined'],
              ownedEvents: [],
              allowedAppContexts: ['memberPwa', 'event'],
            }),
          ),
        ),
      );

      const result = await checkResourceAccess({
        appContext: 'eventOwner',
        eventId: 'evt-joined',
        identity: memberIdentity,
        accessToken: 'token',
      });

      expect(result.outcome).toBe('denied');
    });

    it('allows the owner of the event', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          okResponse(
            decision({
              eventScopes: ['evt-owned', 'evt-joined'],
              ownedEvents: ['evt-owned'],
              allowedAppContexts: ['memberPwa', 'event', 'eventOwner'],
            }),
          ),
        ),
      );

      const allowed = await checkResourceAccess({
        appContext: 'eventOwner',
        eventId: 'evt-owned',
        identity: memberIdentity,
        accessToken: 'token',
      });
      expect(allowed.outcome).toBe('allowed');

      const foreign = await checkResourceAccess({
        appContext: 'eventOwner',
        eventId: 'evt-joined',
        identity: memberIdentity,
        accessToken: 'token',
      });
      expect(foreign.outcome).toBe('denied');
    });

    it('allows everyone with event.manage in the Stammtisch to manage every event', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          okResponse(
            decision({
              roles: ['admin'],
              permissions: ['event.manage'],
              ownedEvents: [],
              allowedAppContexts: ['memberPwa', 'event', 'eventOwner', 'admin'],
            }),
          ),
        ),
      );

      const result = await checkResourceAccess({
        appContext: 'eventOwner',
        eventId: 'any-event',
        identity: { uid: 'sub-admin', roles: ['admin'], drinkRecorder: false },
        accessToken: 'token',
      });

      expect(result.outcome).toBe('allowed');
    });
  });

  describe('fail closed', () => {
    it('reports unavailable when the resolver cannot be reached', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      const result = await checkResourceAccess({
        appContext: 'admin',
        identity: { uid: 'sub-admin', roles: ['admin'], drinkRecorder: false },
        accessToken: 'token',
        sessionId: 'session-down',
      });

      expect(result.outcome).toBe('unavailable');
    });

    it('reports unavailable on a server error instead of deriving from claims', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          problemResponse(500, {
            code: 'internal_error',
            detail: 'Datenbank nicht erreichbar',
            traceId: 'trace-500',
          }),
        ),
      );

      const result = await resolveAccessDecision({
        identity: { uid: 'sub-admin', roles: ['admin'], drinkRecorder: false },
        accessToken: 'token',
      });

      expect(result.outcome).toBe('unavailable');
      expect(result.traceId).toBe('trace-500');
    });

    it('treats a rejection of the resolver as a full denial', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(problemResponse(403, { code: 'account_disabled', detail: 'gesperrt' })),
      );

      const result = await checkResourceAccess({
        appContext: 'memberPwa',
        identity: memberIdentity,
        accessToken: 'token',
      });

      expect(result.outcome).toBe('denied');
    });

    it('never grants access without an access token', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const result = await checkResourceAccess({
        appContext: 'memberPwa',
        identity: memberIdentity,
      });

      expect(result.outcome).toBe('unavailable');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('denies a disabled account reported by the resolver', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(denyAllDecision('sub-member'))));

      const result = await checkResourceAccess({
        appContext: 'memberPwa',
        identity: memberIdentity,
        accessToken: 'token',
      });

      expect(result.outcome).toBe('denied');
    });
  });

  describe('resolver request contract', () => {
    it('sends X-Request-Id and the bearer token', async () => {
      const mockFetch = vi.fn().mockResolvedValue(okResponse(decision()));
      vi.stubGlobal('fetch', mockFetch);

      await resolveAccessDecision({
        identity: memberIdentity,
        accessToken: 'valid-access-token',
        requestId: 'req-42',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/access'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-access-token',
            'X-Request-Id': 'req-42',
          }),
          signal: expect.anything(),
        }),
      );
    });

    it('aborts the resolver call after the configured timeout', async () => {
      expect(RESOLVER_TIMEOUT_MS).toBeGreaterThanOrEqual(500);
      expect(RESOLVER_TIMEOUT_MS).toBeLessThanOrEqual(1000);

      const mockFetch = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const pending = resolveAccessDecision({
        identity: memberIdentity,
        accessToken: 'token',
        sessionId: 'session-timeout',
      });

      await vi.waitFor(async () => {
        expect(await pending).toEqual({ outcome: 'unavailable' });
      });
    });

    it('reads the versioned matrix from the resolver', async () => {
      const matrix = {
        version: 1,
        roles: { member: ['profile.read.self'] },
        assignableRoles: ['member', 'board', 'admin', 'tabletRecorder'],
        knownPermissions: ['profile.read.self'],
        appContexts: ['memberPwa'],
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(matrix)));

      await expect(fetchRolePermissionMatrix('token')).resolves.toEqual(matrix);
    });
  });

  describe('short lived cache', () => {
    it('reuses the decision within the ttl and calls the resolver only once', async () => {
      const mockFetch = vi.fn().mockResolvedValue(okResponse(decision()));
      vi.stubGlobal('fetch', mockFetch);

      const first = await resolveAccessDecision({
        identity: memberIdentity,
        accessToken: 'token',
        sessionId: 'session-1',
      });
      const second = await resolveAccessDecision({
        identity: memberIdentity,
        accessToken: 'token',
        sessionId: 'session-1',
      });

      expect(first.fromCache).toBeUndefined();
      expect(second.fromCache).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(accessDecisionCacheSize()).toBe(1);
    });

    it('re-checks a cached event denial once, so freshly invited members get in', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(okResponse(decision({ allowedAppContexts: ['memberPwa'] })))
        .mockResolvedValueOnce(
          okResponse(decision({ allowedAppContexts: ['memberPwa', 'event'], eventScopes: ['evt-new'] })),
        );
      vi.stubGlobal('fetch', mockFetch);
      const options = { identity: memberIdentity, accessToken: 'token', sessionId: 'session-invite' };

      await resolveAccessDecision(options);
      const result = await checkResourceAccess({ ...options, appContext: 'event', eventId: 'evt-new' });

      expect(result.outcome).toBe('allowed');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('stays denied when the fresh decision denies too', async () => {
      const mockFetch = vi.fn().mockResolvedValue(okResponse(decision()));
      vi.stubGlobal('fetch', mockFetch);
      const options = { identity: memberIdentity, accessToken: 'token', sessionId: 'session-denied' };

      await resolveAccessDecision(options);
      const result = await checkResourceAccess({ ...options, appContext: 'event', eventId: 'evt-other' });

      expect(result.outcome).toBe('denied');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('keeps the ttl short', () => {
      expect(ACCESS_DECISION_TTL_MS).toBeGreaterThanOrEqual(30_000);
      expect(ACCESS_DECISION_TTL_MS).toBeLessThanOrEqual(60_000);
    });

    it('drops the cached decision on logout', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(decision())));

      await resolveAccessDecision({ identity: memberIdentity, accessToken: 'token', sessionId: 'session-2' });
      expect(accessDecisionCacheSize()).toBe(1);

      invalidateAccessDecision('session-2');
      expect(accessDecisionCacheSize()).toBe(0);
    });

    it('drops all decisions of a subject on role or status changes', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(decision({ subject: 'sub-member' }))));

      await resolveAccessDecision({ identity: memberIdentity, accessToken: 'token', sessionId: 'session-a' });
      await resolveAccessDecision({ identity: memberIdentity, accessToken: 'token', sessionId: 'session-b' });
      expect(accessDecisionCacheSize()).toBe(2);

      invalidateAccessDecisionsForSubject('sub-member');
      expect(accessDecisionCacheSize()).toBe(0);
    });

    it('reuses a previously successful decision while the resolver is down', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(okResponse(decision())).mockRejectedValue(new Error('down'));
      vi.stubGlobal('fetch', mockFetch);

      await resolveAccessDecision({ identity: memberIdentity, accessToken: 'token', sessionId: 'session-3' });

      // TTL abgelaufen, Gnadenfrist noch aktiv
      const later = Date.now() + ACCESS_DECISION_TTL_MS + 1_000;
      vi.spyOn(Date, 'now').mockReturnValue(later);

      const result = await resolveAccessDecision({
        identity: memberIdentity,
        accessToken: 'token',
        sessionId: 'session-3',
      });

      expect(result.outcome).toBe('resolved');
      expect(result.fromCache).toBe(true);
    });
  });

  describe('guest access', () => {
    it('validates guest access via the Spring endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue(okResponse({ allowed: true }));
      vi.stubGlobal('fetch', mockFetch);

      const result = await checkResourceAccess({
        appContext: 'eventGuest',
        eventId: 'evt-123',
        guestToken: 'token-abc',
      });

      expect(result.outcome).toBe('allowed');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/access/guest'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('denies guest access without a token', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const result = await checkResourceAccess({ appContext: 'eventGuest', eventId: 'evt-123' });

      expect(result.outcome).toBe('denied');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('treats a rate limited guest check as denied', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(problemResponse(429, { code: 'rate_limit_exceeded' })),
      );

      const result = await checkResourceAccess({
        appContext: 'eventGuest',
        eventId: 'evt-123',
        guestToken: 'brute-force',
      });

      expect(result.outcome).toBe('denied');
    });

    it('reports unavailable when the guest endpoint is down', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));

      const result = await checkResourceAccess({
        appContext: 'eventGuest',
        eventId: 'evt-123',
        guestToken: 'token-abc',
      });

      expect(result.outcome).toBe('unavailable');
    });
  });

  describe('role checking helper functions', () => {
    it('hasAnyRole and hasBoardRole work correctly', () => {
      const boardIdentity: RequestIdentity = {
        uid: 'u1',
        roles: ['board'],
        boardRole: 'treasurer',
        drinkRecorder: false,
      };
      expect(hasAnyRole(boardIdentity, ['board', 'admin'])).toBe(true);
      expect(hasAnyRole(boardIdentity, ['admin'])).toBe(false);
      expect(hasBoardRole(boardIdentity, ['treasurer'])).toBe(true);
      expect(hasBoardRole(boardIdentity, ['secretary'])).toBe(false);

      const adminIdentity: RequestIdentity = { uid: 'u2', roles: ['admin'], drinkRecorder: false };
      expect(hasBoardRole(adminIdentity, ['secretary'])).toBe(true);
    });
  });
});
