import { describe, expect, it } from 'vitest';
import {
  contextForPath,
  CONTEXT_DEFAULT_ROUTES,
  defaultRouteForSession,
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
