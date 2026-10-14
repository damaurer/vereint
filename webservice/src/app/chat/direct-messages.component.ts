import {
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AsyncState } from '../member/async-state';
import { AvatarBadgeComponent, StatusBadgeComponent } from '../ui';
import { ChatDataService } from './chat-data.service';
import type { ChatOverview, DirectConversation } from './chat.model';
import { StateComponent } from '../ui/state.component';

/**
 * Direktnachrichten-Liste (TICKET-035).
 *
 * Zeigt die Einzelgespräche des Mitglieds mit Avatar, letztem Text, Zeitlabel
 * und Ungelesen-Indikator, dazu ein clientseitiges Suchfeld. Der Verlauf einer
 * Konversation öffnet sich im geräteübergreifenden Messenger (`/chat`).
 *
 * Wie der Gruppen-Chat lädt und rendert diese Ansicht ausschließlich im
 * Browser; im SSR-HTML erscheinen keine privaten Konversationen und es wird
 * nichts gecacht (siehe `AGENTS.md`). Die sichtbaren Konversationen bestimmt
 * serverseitig der Fachservice (`deny by default`).
 */
@Component({
  selector: 'app-direct-messages',
  imports: [StateComponent, FormsModule, RouterLink, AvatarBadgeComponent, StatusBadgeComponent],
  template: `
    <main class="page-shell">
      <section class="page-card chat-card" aria-labelledby="dm-title">
        <div class="dm-head">
          <div>
            <span class="eyebrow">Direktnachrichten</span>
            <h1 id="dm-title">Einzelgespräche</h1>
          </div>
          <vereint-status-badge label="DMs" />
        </div>
        <a class="member-back" routerLink="/chat">← Zum Gruppen-Chat</a>

        @if (isBusy()) {
          <vereint-state
            kind="loading"
            title="Wird geladen …"
            message="Die Konversationen werden abgerufen."
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            title="Direktnachrichten nicht verfügbar"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (model(); as data) {
          <label class="dm-search">
            <span class="dm-search-label">Mitglieder durchsuchen</span>
            <input
              name="search"
              type="search"
              autocomplete="off"
              placeholder="Mitglieder durchsuchen…"
              [(ngModel)]="query"
              (ngModelChange)="term.set($event)"
            />
          </label>

          <h2 class="member-subtitle">Konversationen ({{ filtered().length }})</h2>
          @if (filtered().length === 0) {
            <vereint-state
              kind="empty"
              title="Keine Konversationen"
              message="Es gibt keine passenden Einzelgespräche."
            />
          } @else {
            <ul class="dm-list">
              @for (conversation of filtered(); track conversation.id) {
                <li>
                  <a class="dm-item" routerLink="/chat">
                    <span class="dm-avatar-wrap">
                      <vereint-avatar-badge [name]="conversation.partnerName" />
                      @if (conversation.online) {
                        <span class="dm-online" aria-label="online"></span>
                      }
                    </span>
                    <span class="dm-body">
                      <span class="dm-name">{{ conversation.partnerName }}</span>
                      <span class="dm-preview">{{ conversation.lastText }}</span>
                    </span>
                    <span class="dm-meta">
                      <span class="dm-time">{{ conversation.lastLabel }}</span>
                      @if (conversation.unreadCount > 0) {
                        <span
                          class="dm-unread"
                          [attr.aria-label]="conversation.unreadCount + ' ungelesen'"
                        >
                          {{ conversation.unreadCount }}
                        </span>
                      }
                    </span>
                  </a>
                </li>
              }
            </ul>
          }
        }
      </section>
    </main>
  `,
  styles: [
    `
      .dm-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .dm-search {
        display: block;
        margin-top: var(--space-2);
      }
      .dm-search-label {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      .dm-search input {
        width: 100%;
        padding: 0.7rem 0.9rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
        color: inherit;
        font: inherit;
      }
      .dm-list {
        list-style: none;
        margin: 0.5rem 0 0;
        padding: 0;
        display: grid;
        gap: var(--space-2);
      }
      .dm-item {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3);
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
        color: inherit;
        text-decoration: none;
      }
      .dm-avatar-wrap {
        position: relative;
        flex: none;
      }
      .dm-online {
        position: absolute;
        right: -1px;
        bottom: -1px;
        width: 0.65rem;
        height: 0.65rem;
        border-radius: 50%;
        background-color: #16a34a;
        border: 2px solid var(--color-surface-raised);
      }
      .dm-body {
        flex: 1;
        min-width: 0;
      }
      .dm-name {
        display: block;
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      .dm-preview {
        display: block;
        color: var(--color-text-muted);
        font-size: 0.85rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dm-meta {
        flex: none;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.35rem;
      }
      .dm-time {
        color: var(--color-text-muted);
        font-size: 0.8rem;
        white-space: nowrap;
      }
      .dm-unread {
        min-width: 1.4rem;
        height: 1.4rem;
        padding: 0 0.35rem;
        display: grid;
        place-items: center;
        border-radius: 999px;
        background-color: var(--color-brand);
        color: #1a1206;
        font-size: 0.8rem;
        font-weight: 700;
      }
    `,
  ],
})
export class DirectMessagesComponent implements OnInit, OnDestroy {
  private readonly data = inject(ChatDataService);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly load = new AsyncState<ChatOverview>();
  protected readonly model = signal<ChatOverview | null>(null);
  protected readonly term = signal('');

  protected query = '';

  /** Konversationen gefiltert nach dem Suchbegriff (Name oder Text). */
  protected readonly filtered = computed<DirectConversation[]>(() => {
    const data = this.model();
    if (!data) return [];
    const needle = this.term().trim().toLowerCase();
    if (!needle) return data.conversations;
    return data.conversations.filter(
      (conversation) =>
        conversation.partnerName.toLowerCase().includes(needle) ||
        conversation.lastText.toLowerCase().includes(needle),
    );
  });

  ngOnInit(): void {
    // Private Konversationen ausschließlich im Browser laden; SSR bleibt leer.
    if (!isPlatformBrowser(this.platformId)) return;
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.load.run(this.data.loadOverview(), (overview) => this.model.set(overview));
  }

  /** Zeigt an, ob noch geladen wird (inklusive initialem SSR-/Idle-Zustand). */
  protected isBusy(): boolean {
    return !this.load.isError() && this.model() === null;
  }
}
