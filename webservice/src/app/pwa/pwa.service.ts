import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';

/** Einziges erlaubtes Service-Worker-Skript der Anwendung. */
export const ALLOWED_SERVICE_WORKER_SCRIPT = '/vereint-sw.js';

/**
 * Registriert den eigenständigen VEREINT-Service-Worker (`/vereint-sw.js`).
 *
 * Die Registrierung erfolgt ausschließlich browserseitig (`isPlatformBrowser`)
 * und ist im SSR ein No-op, damit keine Worker-/Cache-Zugriffe auf dem Server
 * versucht werden. Der Worker cacht nur öffentliche statische Assets; die
 * verbindliche Autorisierung bleibt serverseitig.
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  constructor(@Inject(PLATFORM_ID) private readonly platformId: object) {}

  async register(): Promise<ServiceWorkerRegistration | undefined> {
    if (!isPlatformBrowser(this.platformId) || !('serviceWorker' in navigator)) {
      return undefined;
    }
    try {
      return await navigator.serviceWorker.register(ALLOWED_SERVICE_WORKER_SCRIPT);
    } catch {
      // Registrierung ist optional: schlägt sie fehl, bleibt die App nutzbar.
      return undefined;
    }
  }
}
