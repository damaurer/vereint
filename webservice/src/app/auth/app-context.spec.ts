import {
  contextForPath,
  CONTEXT_DEFAULT_ROUTES,
  defaultRouteForSession,
  loginRouteForPath,
  PUBLIC_LOGIN_ROUTE,
} from './app-context';
import { AuthSessionUser } from './auth.types';

const session = (roles: AuthSessionUser['roles'], boardRole?: AuthSessionUser['boardRole']): AuthSessionUser => ({
  uid: 'sub-1',
  email: null,
  provider: 'keycloak',
  roles,
  boardRole,
});

describe('app-context navigation', () => {
  describe('defaultRouteForSession', () => {
    it('sends unauthenticated visitors to the public login', () => {
      expect(defaultRouteForSession(null)).toBe(PUBLIC_LOGIN_ROUTE);
    });

    it('prefers admin over board and member', () => {
      expect(defaultRouteForSession(session(['member', 'board', 'admin']))).toBe(CONTEXT_DEFAULT_ROUTES.admin);
    });

    it('routes board members to their board resort', () => {
      expect(defaultRouteForSession(session(['board']))).toBe(CONTEXT_DEFAULT_ROUTES.boardGeneral);
      expect(defaultRouteForSession(session(['board'], 'treasurer'))).toBe(CONTEXT_DEFAULT_ROUTES.boardTreasury);
      expect(defaultRouteForSession(session(['board'], 'secretary'))).toBe(CONTEXT_DEFAULT_ROUTES.boardCommunications);
    });

    it('routes members to the member PWA', () => {
      expect(defaultRouteForSession(session(['member']))).toBe(CONTEXT_DEFAULT_ROUTES.memberPwa);
    });

    it('does not assume a role for an authenticated user without a known role', () => {
      expect(defaultRouteForSession(session([]))).toBe(CONTEXT_DEFAULT_ROUTES.memberPwa);
    });
  });

  describe('loginRouteForPath', () => {
    it('uses the web login for board, admin and tablet contexts', () => {
      expect(loginRouteForPath('/board')).toBe('/web/login');
      expect(loginRouteForPath('/board/treasury')).toBe('/web/login');
      expect(loginRouteForPath('/admin')).toBe('/web/login');
      expect(loginRouteForPath('/tablet')).toBe('/web/login');
    });

    it('uses the pwa login for member and unknown contexts', () => {
      expect(loginRouteForPath('/app')).toBe('/pwa/login');
      expect(loginRouteForPath('/events/42')).toBe('/pwa/login');
      expect(loginRouteForPath('/anything')).toBe('/pwa/login');
    });
  });

  describe('contextForPath', () => {
    it('mirrors the server path-to-context mapping', () => {
      expect(contextForPath('/admin/users')).toBe('admin');
      expect(contextForPath('/board/treasury')).toBe('boardTreasury');
      expect(contextForPath('/board/communications')).toBe('boardCommunications');
      expect(contextForPath('/board')).toBe('boardGeneral');
      expect(contextForPath('/tablet')).toBe('tabletRecorder');
      expect(contextForPath('/guest/7')).toBe('eventGuest');
      expect(contextForPath('/events/7/manage')).toBe('eventOwner');
      expect(contextForPath('/events/7')).toBe('event');
      expect(contextForPath('/app')).toBeNull();
    });
  });
});
