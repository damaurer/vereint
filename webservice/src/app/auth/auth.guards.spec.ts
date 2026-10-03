import { PLATFORM_ID, runInInjectionContext, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthNavigationService } from './auth-navigation.service';
import { authGuard, guestGuard, homeGuard, permissionGuard, roleGuard } from './auth.guards';
import { AuthService } from './auth.service';
import { AuthSessionUser } from './auth.types';

type NavStub = {
  redirectToLogin: ReturnType<typeof vi.fn>;
  forbiddenUrlTree: ReturnType<typeof vi.fn>;
  defaultRouteUrlTree: ReturnType<typeof vi.fn>;
};

const FORBIDDEN_TREE = { redirect: '403' } as unknown;
const DEFAULT_TREE = { redirect: 'default' } as unknown;

const routeWith = (data: Record<string, unknown> = {}, token?: string): ActivatedRouteSnapshot =>
  ({
    data,
    queryParamMap: { get: (key: string) => (key === 'token' ? token ?? null : null) },
  }) as unknown as ActivatedRouteSnapshot;

const stateWith = (url: string): RouterStateSnapshot => ({ url }) as unknown as RouterStateSnapshot;

describe('auth navigation guards', () => {
  let authStub: { getSession: ReturnType<typeof vi.fn> };
  let navStub: NavStub;

  const configure = (platform: 'browser' | 'server', session: AuthSessionUser | null) => {
    authStub = { getSession: vi.fn(async () => session) };
    navStub = {
      redirectToLogin: vi.fn(() => false),
      forbiddenUrlTree: vi.fn(() => FORBIDDEN_TREE),
      defaultRouteUrlTree: vi.fn(() => DEFAULT_TREE),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: AuthService, useValue: authStub },
        { provide: AuthNavigationService, useValue: navStub },
      ],
    });
  };

  const run = <T>(fn: () => T): T =>
    runInInjectionContext(TestBed.inject(Injector), fn);

  const member = (roles: AuthSessionUser['roles'], permissions: string[] = []): AuthSessionUser => ({
    uid: 'sub-1',
    email: null,
    provider: 'keycloak',
    roles,
    permissions,
  });

  describe('authGuard', () => {
    it('allows server-side rendering without touching the session', async () => {
      configure('server', null);
      const result = await run(() => authGuard(routeWith(), stateWith('/app')));
      expect(result).toBe(true);
      expect(authStub.getSession).not.toHaveBeenCalled();
    });

    it('allows an authenticated browser session', async () => {
      configure('browser', member(['member']));
      const result = await run(() => authGuard(routeWith(), stateWith('/app')));
      expect(result).toBe(true);
    });

    it('redirects an expired session to the login', async () => {
      configure('browser', null);
      const result = await run(() => authGuard(routeWith(), stateWith('/app')));
      expect(result).toBe(false);
      expect(navStub.redirectToLogin).toHaveBeenCalledWith('/app');
    });
  });

  describe('roleGuard', () => {
    it('allows a matching role', async () => {
      configure('browser', member(['board']));
      const result = await run(() => roleGuard(routeWith({ roles: ['board', 'admin'] }), stateWith('/board')));
      expect(result).toBe(true);
    });

    it('forbids a missing role', async () => {
      configure('browser', member(['member']));
      const result = await run(() => roleGuard(routeWith({ roles: ['admin'] }), stateWith('/admin')));
      expect(result).toBe(FORBIDDEN_TREE);
    });

    it('sends an anonymous request to the login', async () => {
      configure('browser', null);
      const result = await run(() => roleGuard(routeWith({ roles: ['admin'] }), stateWith('/admin')));
      expect(result).toBe(false);
      expect(navStub.redirectToLogin).toHaveBeenCalledWith('/admin');
    });
  });

  describe('permissionGuard', () => {
    it('allows a matching permission', async () => {
      configure('browser', member(['admin'], ['purchase.tablet']));
      const result = await run(() =>
        permissionGuard(routeWith({ permissions: ['purchase.tablet'] }), stateWith('/tablet')),
      );
      expect(result).toBe(true);
    });

    it('forbids a missing permission', async () => {
      configure('browser', member(['member'], ['purchase.self']));
      const result = await run(() =>
        permissionGuard(routeWith({ permissions: ['purchase.tablet'] }), stateWith('/tablet')),
      );
      expect(result).toBe(FORBIDDEN_TREE);
    });

    it('sends an anonymous request to the login', async () => {
      configure('browser', null);
      const result = await run(() =>
        permissionGuard(routeWith({ permissions: ['purchase.tablet'] }), stateWith('/tablet')),
      );
      expect(result).toBe(false);
      expect(navStub.redirectToLogin).toHaveBeenCalledWith('/tablet');
    });
  });

  describe('guestGuard', () => {
    it('allows a guest with a token', async () => {
      configure('browser', null);
      const result = await run(() => guestGuard(routeWith({}, 'guest-token'), stateWith('/guest/7')));
      expect(result).toBe(true);
    });

    it('forbids a guest without a token', async () => {
      configure('browser', null);
      const result = await run(() => guestGuard(routeWith({}), stateWith('/guest/7')));
      expect(result).toBe(FORBIDDEN_TREE);
    });
  });

  describe('homeGuard', () => {
    it('routes an authenticated browser user to the default route', async () => {
      const authMember = member(['admin']);
      configure('browser', authMember);
      const result = await run(() => homeGuard(routeWith(), stateWith('/')));
      expect(result).toBe(DEFAULT_TREE);
      expect(navStub.defaultRouteUrlTree).toHaveBeenCalledWith(authMember);
    });

    it('sends an anonymous user to the login', async () => {
      configure('browser', null);
      const result = await run(() => homeGuard(routeWith(), stateWith('/')));
      expect(result).toBe(false);
      expect(navStub.redirectToLogin).toHaveBeenCalledWith('');
    });

    it('renders on the server without redirecting', async () => {
      configure('server', null);
      const result = await run(() => homeGuard(routeWith(), stateWith('/')));
      expect(result).toBe(true);
      expect(authStub.getSession).not.toHaveBeenCalled();
      expect(navStub.redirectToLogin).not.toHaveBeenCalled();
    });
  });
});
