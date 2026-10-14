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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, map, type Subscription } from 'rxjs';
import type { ConversationSummary } from '../api/api.types';
import { AsyncState } from '../member/async-state';
import { formatDateTime } from '../member/member-format';
import { IconComponent } from '../ui/icon.component';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { CHAT_LIST_REFRESH_MS, ChatApiService } from './chat-api.service';
import { CHAT_LAYOUT_STYLES } from './chat-styles';
import { ChatThreadComponent } from './chat-thread.component';

interface ChatPageData {
  myId: string;
  conversations: ConversationSummary[];
}

/**
 * Vereinschat (`/chat`).
 *
 * Zeigt den Vereinschat mit Infotafel (nur lesend; der Vorstand pflegt sie an
 * anderer Stelle), Nachrichten, Reaktionen und Composer. Daneben stehen die
 * Event-Chats des Mitglieds mit Ungelesen-Zähler; Direktnachrichten haben eine
 * eigene Seite. Web und Tablet zeigen Liste und Verlauf zweispaltig, mobil
 * navigiert die Liste zum Verlauf.
 *
 * Private Chats werden ausschließlich im Browser geladen und gerendert, damit
 * kein Inhalt ins SSR-HTML gelangt und nichts gecacht wird (siehe `AGENTS.md`).
 * Sichtbarkeit und Schreibrecht bestimmt der Fachservice (`deny by default`).
 */
@Component({
  selector: 'app-chat',
  imports: [StateComponent, IconComponent, RouterLink, ChatThreadComponent, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card chat-card" aria-labelledby="chat-title">
        <div class="chat-head">
          <div>
            <span class="eyebrow">{{ 'chat.eyebrow' | t }}</span>
            <h1 id="chat-title">{{ 'chat.title' | t }}</h1>
          </div>
          <a class="member-back" routerLink="/direktnachrichten">{{ 'chat.toDirectMessages' | t }}</a>
        </div>

        @if (isBusy()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'chat.loadingMessage' | t"
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            [title]="'chat.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (data(); as page) {
          <div class="chat-layout" [class.is-thread]="mobileView() === 'thread'">
            <aside class="chat-aside" [attr.aria-label]="'chat.list.ariaLabel' | t">
              <ul class="chat-conversations">
                @for (row of rows(); track row.id) {
                  @if (row.type === 'event' && row.id === firstEventId()) {
                    <li><p class="chat-aside-title">{{ 'chat.list.eventChats' | t }}</p></li>
                  }
                  <li>
                    <button
                      type="button"
                      class="chat-conversation"
                      [class.is-active]="row.id === selectedId()"
                      [attr.aria-current]="row.id === selectedId() ? 'true' : null"
                      (click)="select(row.id)"
                    >
                      <span class="chat-conversation-icon" aria-hidden="true">
                        <vereint-icon [name]="row.type === 'event' ? 'events' : 'chat'" />
                      </span>
                      <span class="chat-conversation-body">
                        <span class="chat-conversation-top">
                          <span class="chat-conversation-name">{{
                            row.type === 'club' ? ('chat.list.clubChat' | t) : row.title
                          }}</span>
                          @if (row.lastMessage; as last) {
                            <span class="chat-conversation-time">{{ formatDateTime(last.createdAt) }}</span>
                          }
                        </span>
                        <span class="chat-conversation-preview">
                          @if (row.lastMessage; as last) {
                            {{ last.senderName }}: {{ last.message }}
                          } @else {
                            {{ 'chat.list.noMessages' | t }}
                          }
                        </span>
                      </span>
                      @if (row.unreadCount > 0) {
                        <span class="chat-unread" [attr.aria-label]="'chat.unread' | t: { count: row.unreadCount }">
                          {{ row.unreadCount }}
                        </span>
                      }
                    </button>
                  </li>
                }
              </ul>
              @if (firstEventId() === null) {
                <p class="chat-aside-hint">{{ 'chat.list.noEventChats' | t }}</p>
              }
            </aside>

            <div class="chat-main">
              @if (selected(); as conversation) {
                <app-chat-thread
                  [conversation]="conversation"
                  [myId]="page.myId"
                  (read)="onRead($event)"
                  (sent)="onSent()"
                  (back)="backToList()"
                />
              }
            </div>
          </div>
        }
      </section>
    </main>
  `,
  styles: [
    CHAT_LAYOUT_STYLES,
    `
      .chat-aside-hint {
        margin: 0;
        color: var(--color-text-muted);
        font-size: 0.85rem;
      }
    `,
  ],
})
export class ChatComponent implements OnInit, OnDestroy {
  private readonly api = inject(ChatApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly load = new AsyncState<ChatPageData>();
  protected readonly data = signal<ChatPageData | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly mobileView = signal<'list' | 'thread'>('list');
  protected readonly formatDateTime = formatDateTime;

  private listTimer: ReturnType<typeof setInterval> | null = null;
  private listSub?: Subscription;

  /** Vereinschat zuerst, danach Event-Chats (Reihenfolge vom Server). */
  protected readonly rows = computed<ConversationSummary[]>(() =>
    (this.data()?.conversations ?? []).filter(
      (conversation) => conversation.type === 'club' || conversation.type === 'event',
    ),
  );

  protected readonly firstEventId = computed(
    () => this.rows().find((conversation) => conversation.type === 'event')?.id ?? null,
  );

  protected readonly selected = computed<ConversationSummary | null>(() => {
    const id = this.selectedId();
    return this.rows().find((conversation) => conversation.id === id) ?? null;
  });

  ngOnInit(): void {
    // Private Chats ausschließlich im Browser laden; SSR bleibt inhaltsleer.
    if (!isPlatformBrowser(this.platformId)) return;
    this.reload();
    this.listTimer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') this.refreshList();
    }, CHAT_LIST_REFRESH_MS);
  }

  ngOnDestroy(): void {
    this.load.destroy();
    this.listSub?.unsubscribe();
    if (this.listTimer !== null) clearInterval(this.listTimer);
    this.listTimer = null;
  }

  protected reload(): void {
    const source = forkJoin({ me: this.api.me(), conversations: this.api.conversations() }).pipe(
      map(({ me, conversations }) => ({ myId: me.id, conversations })),
    );
    this.load.run(source, (page) => {
      this.data.set(page);
      const wanted = this.route.snapshot.queryParamMap.get('id');
      const rows = this.rows();
      const initial =
        rows.find((conversation) => conversation.id === wanted) ??
        rows.find((conversation) => conversation.type === 'club') ??
        rows[0];
      this.selectedId.set(initial?.id ?? null);
      if (wanted && initial?.id === wanted) this.mobileView.set('thread');
    });
  }

  protected isBusy(): boolean {
    return !this.load.isError() && this.data() === null;
  }

  protected select(id: string): void {
    this.selectedId.set(id);
    this.mobileView.set('thread');
  }

  protected backToList(): void {
    this.mobileView.set('list');
  }

  /** Übernimmt den neuen Lesestand in die Liste. */
  protected onRead(summary: ConversationSummary): void {
    this.replace(summary.id, (conversation) => ({
      ...conversation,
      unreadCount: summary.unreadCount,
      lastMessage: summary.lastMessage ?? conversation.lastMessage,
    }));
  }

  /** Eigene Nachricht: Vorschau aktualisieren. */
  protected onSent(): void {
    this.refreshList();
  }

  /** Lädt die Liste still nach (Ungelesen-Zähler, Vorschau). */
  private refreshList(): void {
    if (this.data() === null) return;
    this.listSub?.unsubscribe();
    this.listSub = this.api.conversations().subscribe({
      next: (conversations) => {
        const current = this.data();
        if (current) this.data.set({ ...current, conversations });
      },
      error: () => undefined,
    });
  }

  private replace(id: string, update: (conversation: ConversationSummary) => ConversationSummary): void {
    const current = this.data();
    if (!current) return;
    this.data.set({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === id ? update(conversation) : conversation,
      ),
    });
  }
}
