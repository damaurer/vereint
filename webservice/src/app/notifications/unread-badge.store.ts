import { Injectable, signal } from '@angular/core';

/**
 * Gemeinsamer Zähler ungelesener Mitteilungen.
 *
 * Die Shell füllt ihn für das Glocken-Badge, die Mitteilungsseite aktualisiert
 * ihn beim Lesen. So stimmt das Badge sofort, ohne erneuten Serveraufruf.
 */
@Injectable({ providedIn: 'root' })
export class UnreadBadgeStore {
  readonly count = signal(0);
}
