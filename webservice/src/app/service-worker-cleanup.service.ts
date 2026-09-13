import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';

/** Einzig erlaubtes Worker-Skript der Anwendung. */
export const ALLOWED_SERVICE_WORKER_SCRIPT = '/vereint-sw.js';

/**
 * Entfernt veraltete oder fremde Service Worker (zum Beispiel ein früher
 * registriertes `sw.js`) samt zugehörigen Caches. Solche Worker cachen
 * unkontrolliert Requests – unter anderem `chrome-extension:`-Requests von
 * Browsererweiterungen, was zu `Failed to execute 'put' on 'Cache'` führt.
 * Der Aufruf erfolgt ausschließlich browserseitig.
 */
@Injectable({ providedIn: 'root' })
export class ServiceWorkerCleanupService {
  constructor(@Inject(PLATFORM_ID) private readonly platformId: object) {}

  async removeStaleWorkers(): Promise<number> {
    if (!isPlatformBrowser(this.platformId) || !('serviceWorker' in navigator)) return 0;

    let removed = 0;
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        if (this.isAllowed(registration)) continue;
        if (await registration.unregister()) removed += 1;
      }
    } catch {
      // Kein Zugriff auf Registrierungen: Aufräumen bleibt optional.
    }

    if (removed > 0) await this.clearCaches();
    return removed;
  }

  private isAllowed(registration: ServiceWorkerRegistration): boolean {
    const scriptUrl = this.scriptUrl(registration);
    if (!scriptUrl) return true;
    try {
      return new URL(scriptUrl, globalThis.location?.origin).pathname === ALLOWED_SERVICE_WORKER_SCRIPT;
    } catch {
      return false;
    }
  }

  private scriptUrl(registration: ServiceWorkerRegistration): string | null {
    const worker = registration.active ?? registration.waiting ?? registration.installing;
    return worker?.scriptURL ?? null;
  }

  private async clearCaches(): Promise<void> {
    if (!('caches' in globalThis)) return;
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {
      // Cache Storage nicht verfügbar oder blockiert.
    }
  }
}
