import { vi } from 'vitest';
import { AuthService } from './auth.service';

const browser = 'browser' as unknown as object;

const meResponse = (roles: string[], permissions: string[]) => ({
  ok: true,
  json: async () => ({
    authenticated: true,
    identity: { subject: 'sub-1', displayName: 'Member', roles, boardRole: null, permissions },
  }),
});

describe('AuthService session cache', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => meResponse(['member'], ['purchase.self']) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps roles and permissions from the identity response', async () => {
    const service = new AuthService(browser);

    const session = await service.loadSession();

    expect(session).toEqual({
      uid: 'sub-1',
      email: null,
      displayName: 'Member',
      provider: 'keycloak',
      roles: ['member'],
      boardRole: undefined,
      permissions: ['purchase.self'],
    });
  });

  it('bundles parallel session reads into a single request', async () => {
    const service = new AuthService(browser);

    await Promise.all([service.getSession(), service.getSession()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reloads the session after the client state is cleared', async () => {
    const service = new AuthService(browser);

    await service.getSession();
    service.clearClientState();
    await service.getSession();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('drops the cached session on sign out', async () => {
    const service = new AuthService(browser);

    await service.getSession();
    await service.signOut();
    await service.getSession();

    // signOut posts to logout and reloads afterwards → logout + two me reads.
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
