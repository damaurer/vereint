import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { ChatApiService } from './chat-api.service';

/**
 * Gemeinsamer Zähler ungelesener Chat-Nachrichten.
 *
 * Die Shell zeigt ihn als Badge am Chat-Eintrag und frischt ihn regelmäßig
 * auf; die Chat-Seiten stoßen nach dem Lesen eine Aktualisierung an, damit das
 * Badge sofort stimmt. Fehler lassen das Badge einfach aus.
 */
@Injectable({ providedIn: 'root' })
export class ChatUnreadStore {
  private readonly api = inject(ChatApiService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly count = signal(0);

  refresh(): void {
    if (!this.browser) return;
    this.api.unreadCount().subscribe({
      next: (response) => this.count.set(Math.max(0, response?.unread ?? 0)),
      error: () => this.count.set(0),
    });
  }
}
