import { vi } from 'vitest';
import { ServiceWorkerCleanupService } from './service-worker-cleanup.service';

function registration(scriptURL: string, unregister = vi.fn(async () => true)) {
  return { active: { scriptURL }, unregister } as unknown as ServiceWorkerRegistration;
}

describe('ServiceWorkerCleanupService', () => {
  const platformId = 'browser' as unknown as object;
  let service: ServiceWorkerCleanupService;
  let cacheDelete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cacheDelete = vi.fn(async () => true);
    vi.stubGlobal('caches', { keys: vi.fn(async () => ['stale-cache']), delete: cacheDelete });
    service = new ServiceWorkerCleanupService(platformId);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('unregisters a stale worker and clears its caches', async () => {
    const stale = registration('http://localhost:4200/sw.js');
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [stale] } });

    await expect(service.removeStaleWorkers()).resolves.toBe(1);

    expect(stale.unregister).toHaveBeenCalledOnce();
    expect(cacheDelete).toHaveBeenCalledWith('stale-cache');
  });

  it('keeps the vereint service worker of the application', async () => {
    const own = registration('http://localhost:4200/vereint-sw.js');
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [own] } });

    await expect(service.removeStaleWorkers()).resolves.toBe(0);

    expect(own.unregister).not.toHaveBeenCalled();
    expect(cacheDelete).not.toHaveBeenCalled();
  });

  it('does not touch service workers during SSR', async () => {
    const ssrService = new ServiceWorkerCleanupService('server' as unknown as object);

    await expect(ssrService.removeStaleWorkers()).resolves.toBe(0);
  });
});
