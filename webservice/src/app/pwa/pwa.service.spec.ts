import { vi } from 'vitest';
import { ALLOWED_SERVICE_WORKER_SCRIPT, PwaService } from './pwa.service';

describe('PwaService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('registers the vereint service worker in the browser', async () => {
    const registration = {} as ServiceWorkerRegistration;
    const register = vi.fn(async () => registration);
    vi.stubGlobal('navigator', { serviceWorker: { register } });

    const service = new PwaService('browser' as unknown as object);

    await expect(service.register()).resolves.toBe(registration);
    expect(register).toHaveBeenCalledWith(ALLOWED_SERVICE_WORKER_SCRIPT);
    expect(ALLOWED_SERVICE_WORKER_SCRIPT).toBe('/vereint-sw.js');
  });

  it('is a no-op during SSR', async () => {
    const register = vi.fn(async () => ({}) as ServiceWorkerRegistration);
    vi.stubGlobal('navigator', { serviceWorker: { register } });

    const service = new PwaService('server' as unknown as object);

    await expect(service.register()).resolves.toBeUndefined();
    expect(register).not.toHaveBeenCalled();
  });

  it('swallows registration errors and stays usable', async () => {
    const register = vi.fn(async () => {
      throw new Error('registration failed');
    });
    vi.stubGlobal('navigator', { serviceWorker: { register } });

    const service = new PwaService('browser' as unknown as object);

    await expect(service.register()).resolves.toBeUndefined();
    expect(register).toHaveBeenCalledOnce();
  });
});
