import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID, signal, Signal } from '@angular/core';

/**
 * Gerätegröße der responsiven `AppShell` (TICKET-032).
 *
 * `mobile` ≤ 640px (PWA-Bottom-Bar), `tablet` 641–1024px (Icon-Rail) und
 * `web` > 1024px (Sidebar + Topbar). SSR rendert serverseitig den neutralen
 * Default `web`; die tatsächliche Erkennung über `matchMedia` läuft
 * ausschließlich im Browser, damit kein gerätespezifisches Markup ins
 * SSR-HTML gelangt (siehe `AGENTS.md`, Browser-APIs nur clientseitig).
 */
export type Viewport = 'mobile' | 'tablet' | 'web';

/** Obere Grenze (inklusive) des mobilen Bereichs in CSS-Pixeln. */
export const MOBILE_MAX_WIDTH = 640;

/** Obere Grenze (inklusive) des Tablet-Bereichs in CSS-Pixeln. */
export const TABLET_MAX_WIDTH = 1024;

@Injectable({ providedIn: 'root' })
export class BreakpointService {
  private readonly viewportSignal = signal<Viewport>('web');

  constructor(@Inject(PLATFORM_ID) private readonly platformId: object) {
    this.initialize();
  }

  /** Read-only-Signal des aktuellen Viewports. */
  get viewport(): Signal<Viewport> {
    return this.viewportSignal.asReadonly();
  }

  /** Klassifiziert eine Breite in einen Viewport. */
  static classify(width: number): Viewport {
    if (width <= MOBILE_MAX_WIDTH) return 'mobile';
    if (width <= TABLET_MAX_WIDTH) return 'tablet';
    return 'web';
  }

  /**
   * Registriert `matchMedia`-Listener und setzt den initialen Viewport. Ohne
   * Browser (SSR) oder ohne `matchMedia`-Unterstützung bleibt der neutrale
   * Default `web` erhalten.
   */
  private initialize(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (typeof globalThis.matchMedia !== 'function') return;

    const mobile = globalThis.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
    const tablet = globalThis.matchMedia(
      `(min-width: ${MOBILE_MAX_WIDTH + 1}px) and (max-width: ${TABLET_MAX_WIDTH}px)`,
    );

    const update = (): void => {
      if (mobile.matches) this.viewportSignal.set('mobile');
      else if (tablet.matches) this.viewportSignal.set('tablet');
      else this.viewportSignal.set('web');
    };

    update();
    this.listen(mobile, update);
    this.listen(tablet, update);
  }

  /** Kompatibles Listener-Registrieren (moderne und ältere `MediaQueryList`). */
  private listen(query: MediaQueryList, handler: () => void): void {
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handler);
    } else if (typeof query.addListener === 'function') {
      query.addListener(handler);
    }
  }
}
