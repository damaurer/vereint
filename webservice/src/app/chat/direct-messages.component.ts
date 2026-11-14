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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, map, type Subscription } from 'rxjs';
import type { ConversationSummary, FriendContact } from '../api/api.types';
import { describeApiError } from '../api/api-client.service';
import { AsyncState } from '../member/async-state';
import { formatChatTime, formatDateTime } from '../member/member-format';
import { AvatarBadgeComponent, BottomSheetComponent } from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe, translate } from '../i18n';
import { CHAT_LIST_REFRESH_MS, ChatApiService } from './chat-api.service';
import { CHAT_LAYOUT_STYLES } from './chat-styles';
import { IconComponent } from '../ui/icon.component';
import { ChatThreadComponent } from './chat-thread.component';

interface DirectPageData {
  myId: string;
  conversations: ConversationSummary[];
}

/**
 * Direktnachrichten (`/direktnachrichten`).
 *
 * Direktnachrichten sind gruppenübergreifend: genau ein Gespräch je Person,
 * egal aus welcher Gruppe. Listet die eigenen Einzelgespräche (Name, letzte
 * Nachricht, Ungelesen-Badge) mit Suchfeld, öffnet den Verlauf daneben bzw.
 * mobil als eigene Ansicht und startet über „Neue Nachricht“ ein Gespräch mit
 * einer Person aus den eigenen Gruppen oder der Freundesliste
 * (`POST /direct-conversations` liefert bestehende Gespräche zurück).
 *
 * Lädt und rendert ausschließlich im Browser; im SSR-HTML erscheinen keine
 * privaten Konversationen und es wird nichts gecacht (siehe `AGENTS.md`).
 */
@Component({
  selector: 'app-direct-messages',
  imports: [
    StateComponent,
    FormsModule,
    RouterLink,
    AvatarBadgeComponent,
    BottomSheetComponent,
    ChatThreadComponent,
    IconComponent,
    TranslatePipe,
  ],
  template: `
    <main class="page-shell">
      <section class="page-card chat-card" aria-labelledby="dm-title">
        <div class="chat-head">
          <div>
            <span class="eyebrow">{{ 'chat.direct.eyebrow' | t }}</span>
            <h1 id="dm-title">{{ 'chat.direct.title' | t }}</h1>
          </div>
          <a class="dm-head-link" routerLink="/freunde">{{ 'chat.direct.toFriends' | t }}</a>
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
            [title]="'chat.direct.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (data(); as page) {
          <div class="chat-layout" [class.is-thread]="mobileView() === 'thread'">
            <aside class="chat-aside" [attr.aria-label]="'chat.list.ariaLabel' | t">
              <div class="dm-toolbar">
                @if (directs().length > 0) {
                  <label class="chat-search">
                    <span class="chat-search-label">{{ 'chat.direct.searchLabel' | t }}</span>
                    <input
                      name="search"
                      type="search"
                      autocomplete="off"
                      [placeholder]="'chat.direct.searchPlaceholder' | t"
                      [ngModel]="term()"
                      (ngModelChange)="term.set($event)"
                    />
                  </label>
                }
                <button
                  type="button"
                  class="member-button dm-new"
                  [attr.aria-label]="'chat.list.newMessage' | t"
                  [attr.title]="'chat.list.newMessage' | t"
                  (click)="openPicker()"
                >
                  <vereint-icon name="plus" />
                  @if (directs().length === 0) {
                    <span>{{ 'chat.list.newMessage' | t }}</span>
                  }
                </button>
              </div>
              @if (startError()) {
                <p class="manage-action-error" role="alert">{{ startError() }}</p>
              }

              <h2 class="chat-aside-title">
                {{ 'chat.direct.conversations' | t: { count: filtered().length } }}
              </h2>
              @if (filtered().length === 0) {
                <vereint-state
                  kind="empty"
                  [title]="'chat.direct.emptyTitle' | t"
                  [message]="
                    (directs().length === 0 ? 'chat.direct.emptyStart' : 'chat.direct.emptyMessage') | t
                  "
                />
              } @else {
                <ul class="chat-conversations dm-list">
                  @for (conversation of filtered(); track conversation.id) {
                    <li>
                      <button
                        type="button"
                        class="chat-conversation dm-item"
                        [class.is-active]="conversation.id === selectedId()"
                        [attr.aria-current]="conversation.id === selectedId() ? 'true' : null"
                        (click)="select(conversation.id)"
                      >
                        <vereint-avatar-badge [name]="partnerName(conversation)" />
                        <span class="chat-conversation-body">
                          <span class="chat-conversation-top">
                            <span class="chat-conversation-name dm-name">{{ partnerName(conversation) }}</span>
                            @if (conversation.lastMessage; as last) {
                              <span class="chat-conversation-time dm-time">{{
                                formatChatTime(last.createdAt)
                              }}</span>
                            }
                          </span>
                          <span class="chat-conversation-bottom">
                            <span class="chat-conversation-preview dm-preview">
                              @if (conversation.lastMessage; as last) {
                                {{ last.message }}
                              } @else {
                                {{ 'chat.list.noMessages' | t }}
                              }
                            </span>
                            @if (conversation.unreadCount > 0) {
                              <span
                                class="chat-unread dm-unread"
                                [attr.aria-label]="'chat.unread' | t: { count: conversation.unreadCount }"
                              >
                                {{ conversation.unreadCount }}
                              </span>
                            }
                          </span>
                        </span>
                      </button>
                    </li>
                  }
                </ul>
              }
            </aside>

            <div class="chat-main">
              @if (selected(); as conversation) {
                <app-chat-thread
                  [conversation]="conversation"
                  [myId]="page.myId"
                  (read)="onRead($event)"
                  (sent)="refreshList()"
                  (back)="backToList()"
                />
              } @else {
                <vereint-state
                  kind="empty"
                  [title]="'chat.direct.noneSelectedTitle' | t"
                  [message]="'chat.direct.noneSelectedMessage' | t"
                />
              }
            </div>
          </div>
        }
      </section>

      <vereint-bottom-sheet [open]="pickerOpen()" [title]="'chat.direct.pickerTitle' | t" (closed)="closePicker()">
        <div class="dm-picker">
          <label class="dm-picker-search">
            <span>{{ 'chat.direct.pickerSearchLabel' | t }}</span>
            <input
              name="memberSearch"
              type="search"
              autocomplete="off"
              [placeholder]="'chat.direct.pickerSearchPlaceholder' | t"
              [ngModel]="memberTerm()"
              (ngModelChange)="memberTerm.set($event)"
            />
          </label>
          @if (directory.isLoading() || (directory.status() === 'idle' && pickerOpen())) {
            <vereint-state
              kind="loading"
              [title]="'common.loading' | t"
              [message]="'chat.direct.pickerLoading' | t"
            />
          } @else if (directory.isError()) {
            <vereint-state
              kind="error"
              [title]="'chat.direct.pickerUnavailable' | t"
              [message]="directory.errorMessage()"
              (retry)="loadDirectory()"
            />
          } @else if (members().length === 0) {
            <vereint-state
              kind="empty"
              [title]="'chat.direct.pickerEmptyTitle' | t"
              [message]="'chat.direct.pickerEmptyMessage' | t"
            />
          } @else {
            <ul class="dm-members">
              @for (member of members(); track member.userId) {
                <li>
                  <button
                    type="button"
                    class="dm-member"
                    [disabled]="starting() !== null"
                    (click)="startWith(member)"
                  >
                    <vereint-avatar-badge [name]="member.displayName" />
                    <span class="dm-member-text">
                      <span class="dm-member-name">{{ member.displayName }}</span>
                      <span class="dm-member-groups">{{ contactHint(member) }}</span>
                    </span>
                    @if (starting() === member.userId) {
                      <span class="dm-member-hint">{{ 'chat.direct.pickerStarting' | t }}</span>
                    }
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      </vereint-bottom-sheet>
    </main>
  `,
  styles: [
    CHAT_LAYOUT_STYLES,
    `
      .dm-toolbar {
        display: flex;
        gap: var(--space-1);
      }
      .dm-toolbar .chat-search {
        flex: 1;
        min-width: 0;
      }
      .dm-new {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        min-width: 2.75rem;
        min-height: 2.75rem;
        padding: 0 0.75rem;
        font-size: 1.2rem;
      }
      .dm-new span {
        font-size: 0.95rem;
      }
      .dm-head-link {
        align-self: flex-end;
        padding-bottom: 0.35rem;
        font-size: 0.95rem;
      }
      .dm-picker {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .dm-picker-search {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        font-weight: 600;
      }
      .dm-picker-search input {
        width: 100%;
        padding: 0.7rem 0.9rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
        color: inherit;
        font: inherit;
        font-weight: 400;
      }
      .dm-members {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--space-2);
      }
      .dm-member {
        width: 100%;
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .dm-member-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .dm-member-name {
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      .dm-member-groups {
        color: var(--color-text-muted);
        font-size: 0.85rem;
        overflow-wrap: anywhere;
      }
      .dm-links {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3);
      }
      .dm-member-hint {
        color: var(--color-text-muted);
        font-size: 0.85rem;
      }
    `,
  ],
})
export class DirectMessagesComponent implements OnInit, OnDestroy {
  private readonly api = inject(ChatApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly load = new AsyncState<DirectPageData>();
  protected readonly directory = new AsyncState<FriendContact[]>();
  protected readonly data = signal<DirectPageData | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly mobileView = signal<'list' | 'thread'>('list');
  protected readonly term = signal('');
  protected readonly memberTerm = signal('');
  protected readonly pickerOpen = signal(false);
  protected readonly starting = signal<string | null>(null);
  protected readonly startError = signal<string | null>(null);
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatChatTime = formatChatTime;

  private listTimer: ReturnType<typeof setInterval> | null = null;
  private listSub?: Subscription;

  /** Eigene Direktchats in Server-Reihenfolge (neueste Nachricht zuerst). */
  protected readonly directs = computed<ConversationSummary[]>(() =>
    (this.data()?.conversations ?? []).filter((conversation) => conversation.type === 'direct'),
  );

  /** Direktchats gefiltert nach Name oder letzter Nachricht. */
  protected readonly filtered = computed<ConversationSummary[]>(() => {
    const needle = this.term().trim().toLowerCase();
    if (!needle) return this.directs();
    return this.directs().filter(
      (conversation) =>
        this.partnerName(conversation).toLowerCase().includes(needle) ||
        (conversation.lastMessage?.message ?? '').toLowerCase().includes(needle),
    );
  });

  protected readonly selected = computed<ConversationSummary | null>(() => {
    const id = this.selectedId();
    return this.directs().find((conversation) => conversation.id === id) ?? null;
  });

  /** Personen für die Auswahl: wem ich schreiben darf, nach Name gefiltert und sortiert. */
  protected readonly members = computed<FriendContact[]>(() => {
    const myId = this.data()?.myId;
    const needle = this.memberTerm().trim().toLowerCase();
    return (this.directory.data() ?? [])
      .filter((member) => member.userId !== myId && member.canMessage)
      .filter((member) => !needle || member.displayName.toLowerCase().includes(needle))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'));
  });

  ngOnInit(): void {
    // Private Konversationen ausschließlich im Browser laden; SSR bleibt leer.
    if (!isPlatformBrowser(this.platformId)) return;
    this.reload();
    this.listTimer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') this.refreshList();
    }, CHAT_LIST_REFRESH_MS);
  }

  ngOnDestroy(): void {
    this.load.destroy();
    this.directory.destroy();
    this.listSub?.unsubscribe();
    if (this.listTimer !== null) clearInterval(this.listTimer);
    this.listTimer = null;
  }

  protected reload(): void {
    const source = forkJoin({ me: this.api.me(), conversations: this.api.directConversations() }).pipe(
      map(({ me, conversations }) => ({ myId: me.id, conversations })),
    );
    this.load.run(source, (page) => {
      this.data.set(page);
      const wanted = this.route.snapshot.queryParamMap.get('id');
      const match = this.directs().find((conversation) => conversation.id === wanted);
      if (match) {
        this.select(match.id);
      } else if (!this.selected()) {
        this.selectedId.set(this.directs()[0]?.id ?? null);
      }
    });
  }

  protected isBusy(): boolean {
    return !this.load.isError() && this.data() === null;
  }

  protected partnerName(conversation: ConversationSummary): string {
    return conversation.partnerName ?? conversation.title;
  }

  protected select(id: string): void {
    this.selectedId.set(id);
    this.mobileView.set('thread');
  }

  protected backToList(): void {
    this.mobileView.set('list');
  }

  protected onRead(summary: ConversationSummary): void {
    const current = this.data();
    if (!current) return;
    this.data.set({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === summary.id
          ? { ...conversation, unreadCount: summary.unreadCount, lastMessage: summary.lastMessage ?? conversation.lastMessage }
          : conversation,
      ),
    });
  }

  protected openPicker(): void {
    this.startError.set(null);
    this.memberTerm.set('');
    this.pickerOpen.set(true);
    if (!this.directory.isSuccess()) this.loadDirectory();
  }

  protected closePicker(): void {
    this.pickerOpen.set(false);
  }

  protected loadDirectory(): void {
    this.directory.run(this.api.contacts());
  }

  /** Gemeinsame Gruppen bzw. „Freund“ unter dem Namen in der Auswahl. */
  protected contactHint(member: FriendContact): string {
    const groups = member.sharedGroups.map((group) => group.name).join(', ');
    if (member.friendStatus === 'friend') {
      return groups ? `${translate('chat.direct.friend')} · ${groups}` : translate('chat.direct.friend');
    }
    return groups;
  }

  /** Startet bzw. öffnet den Direktchat mit dieser Person. */
  protected startWith(member: FriendContact): void {
    if (this.starting() !== null) return;
    this.starting.set(member.userId);
    this.startError.set(null);
    this.api.startDirect(member.userId).subscribe({
      next: (conversation) => {
        this.starting.set(null);
        this.pickerOpen.set(false);
        const current = this.data();
        if (current && !current.conversations.some((entry) => entry.id === conversation.id)) {
          this.data.set({ ...current, conversations: [conversation, ...current.conversations] });
        }
        this.term.set('');
        this.select(conversation.id);
      },
      error: (error: unknown) => {
        this.starting.set(null);
        this.pickerOpen.set(false);
        this.startError.set(describeApiError(error));
      },
    });
  }

  /** Lädt die Liste still nach (Ungelesen-Zähler, Vorschau). */
  protected refreshList(): void {
    if (this.data() === null) return;
    this.listSub?.unsubscribe();
    this.listSub = this.api.directConversations().subscribe({
      next: (conversations) => {
        const current = this.data();
        if (!current) return;
        // Frisch angelegte Chats ohne Nachricht behalten, falls der Server sie noch nicht liefert.
        const missing = current.conversations.filter(
          (entry) => entry.type === 'direct' && !conversations.some((fresh) => fresh.id === entry.id),
        );
        this.data.set({ ...current, conversations: [...conversations, ...missing] });
      },
      error: () => undefined,
    });
  }
}
