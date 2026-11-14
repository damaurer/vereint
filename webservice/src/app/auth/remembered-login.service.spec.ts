import { vi } from 'vitest';
import { REMEMBERED_LOGIN_STORAGE_KEY } from './auth.types';
import { RememberedLoginService } from './remembered-login.service';

const createStorageStub = () => {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
  };
};

describe('RememberedLoginService', () => {
  const browser = 'browser' as unknown as object;
  let service: RememberedLoginService;

  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageStub());
    service = new RememberedLoginService(browser);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when no email address was remembered', () => {
    expect(service.read()).toBeNull();
  });

  it('remembers the normalized email address', () => {
    service.remember('  Member@Example.COM ');

    expect(service.read()).toEqual({ email: 'member@example.com' });
  });

  it('ignores values that are not email addresses', () => {
    localStorage.setItem(REMEMBERED_LOGIN_STORAGE_KEY, 'not-an-email');

    expect(service.read()).toBeNull();
  });

  it('does not read the storage during SSR', () => {
    const ssrService = new RememberedLoginService('server' as unknown as object);
    localStorage.setItem(REMEMBERED_LOGIN_STORAGE_KEY, 'member@example.com');

    expect(ssrService.read()).toBeNull();
  });

  it('forgets the remembered email address', () => {
    service.remember('member@example.com');
    service.forget();

    expect(service.read()).toBeNull();
  });
});
