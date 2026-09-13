import { Router, UrlTree } from '@angular/router';
import { vi } from 'vitest';
import { AuthNavigationService } from './auth-navigation.service';
import { AuthService } from './auth.service';
import { AuthSessionUser } from './auth.types';
import { RememberedLoginService } from './remembered-login.service';

describe('AuthNavigationService', () => {
  const browser = 'browser' as unknown as object;
  const server = 'server' as unknown as object;

  let auth: { getSession: ReturnType<typeof vi.fn>; signOut: ReturnType<typeof vi.fn>; clearClientState: ReturnType<typeof vi.fn> };
  let router: {
    navigateByUrl: ReturnType<typeof vi.fn>;
    parseUrl: ReturnType<typeof vi.fn>;
    createUrlTree: ReturnType<typeof vi.fn>;
  };
  let remembered: { forget: ReturnType<typeof vi.fn> };

  const create = (platformId: object) =>
    new AuthNavigationService(
      platformId,
      auth as unknown as AuthService,
      router as unknown as Router,
      remembered as unknown as RememberedLoginService,
    );

  beforeEach(() => {
    auth = {
      getSession: vi.fn(async () => null),
      signOut: vi.fn(async () => undefined),
      clearClientState: vi.fn(),
    };
    router = {
      navigateByUrl: vi.fn(async () => true),
      parseUrl: vi.fn((url: string) => ({ url }) as unknown as UrlTree),
      createUrlTree: vi.fn((commands: unknown[], extras: unknown) => ({ commands, extras }) as unknown as UrlTree),
    };
    remembered = { forget: vi.fn() };
  });

  describe('goToDefaultRoute', () => {
    it('navigates to the role-specific default route in the browser', async () => {
      auth.getSession.mockResolvedValue({
        uid: 'sub-1',
        email: null,
        provider: 'keycloak',
        roles: ['admin'],
      } as AuthSessionUser);

      await create(browser).goToDefaultRoute();

      expect(auth.getSession).toHaveBeenCalledWith(true);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/admin');
    });

    it('does nothing during server-side rendering', async () => {
      const result = await create(server).goToDefaultRoute();

      expect(result).toBe(false);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  describe('loginUrlTree', () => {
    it('keeps a safe returnUrl and picks the context login', () => {
      create(browser).loginUrlTree('/board/treasury');

      expect(router.createUrlTree).toHaveBeenCalledWith(['/web/login'], {
        queryParams: { returnUrl: '/board/treasury' },
      });
    });

    it('drops an unsafe returnUrl and falls back to the pwa login', () => {
      create(browser).loginUrlTree('//evil.example');

      expect(router.parseUrl).toHaveBeenCalledWith('/pwa/login');
      expect(router.createUrlTree).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('ends the session, forgets client data and navigates to the login', async () => {
      await create(browser).logout();

      expect(auth.signOut).toHaveBeenCalled();
      expect(remembered.forget).toHaveBeenCalled();
      expect(auth.clearClientState).toHaveBeenCalled();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/pwa/login');
    });
  });
});
