import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';

/**
 * Gemeinsamer Zähler ungelesener Mitteilungen.
 *
 * Die Shell füllt ihn für das Glocken-Badge, die Mitteilungsseite aktualisiert
 * ihn beim Lesen. So stimmt das Badge sofort, ohne erneuten Serveraufruf. Bei
 * installierter App erscheint der Zähler zusätzlich am App-Symbol.
 */
@Injectable({ providedIn: 'root' })
export class UnreadBadgeStore {
  readonly count = signal(0);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect(() => setAppBadge(this.count()));
  }
}

function setAppBadge(count: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  const update = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
  update?.catch(() => undefined);
}
