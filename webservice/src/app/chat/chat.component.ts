import {
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, map, type Subscription } from 'rxjs';
import type { ConversationSummary, FriendContact } from '../api/api.types';
import { describeApiError } from '../api/api-client.service';
import { AsyncState } from '../member/async-state';
import { formatChatTime } from '../member/member-format';
import { AvatarBadgeComponent, BottomSheetComponent } from '../ui';
import { IconComponent } from '../ui/icon.component';
import type { IconName } from '../ui/icons';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe, translate } from '../i18n';
import { CHAT_LIST_REFRESH_MS, ChatApiService } from './chat-api.service';
import { CHAT_LAYOUT_STYLES, CHAT_WIDE_QUERY } from './chat-styles';
import { ChatThreadComponent } from './chat-thread.component';
import { ChatUnreadStore } from './chat-unread.store';
import { LiveUpdatesService } from '../live/live-updates.service';

interface ChatPageData {
  myId: string;
  conversations: ConversationSummary[];
}

/** Filter-Chips über der Liste; keine eigenen Seiten, nur eine Auswahl. */
export type ChatFilter = 'all' | 'unread' | 'club' | 'event' | 'direct' | 'moment';

/** Schritte von „Neue Nachricht“: erst die Art, dann wohin. */
type ComposeStep = 'kind' | 'club' | 'event' | 'direct' | 'moment';

const FILTERS: readonly ChatFilter[] = ['all', 'unread', 'club', 'event', 'direct', 'moment'];

/**
 * Alle Chats auf einer Seite (`/chat`), aufgebaut wie bei bekannten
 * Messengern.
 *
 * Eine Liste zeigt Gruppenchats und Event-Chats aller eigenen Gruppen sowie
 * die gruppenübergreifenden Direktnachrichten gemeinsam, neueste Nachricht
 * zuerst, mit Vorschau, Uhrzeit und Ungelesen-Zähler (`GET /chats`). Suche und
 * Filter-Chips (Alle, Ungelesen, Gruppen, Events, Direkt) grenzen die Liste
 * ein, ohne Unterseiten. „Neue Nachricht“ fragt erst die Art ab (Gruppe,
 * Event, Direkt) und dann, wohin die Nachricht geht.
 *
 * Web und Tablet zeigen Liste und Verlauf nebeneinander; mobil öffnet ein Chat
 * im Vollbild und „Zurück“ führt zur Liste. Gruppen- und Event-Chats anderer
 * Gruppen öffnen, ohne die gewählte Gruppe zu wechseln: Die App nennt dem
 * Server die Gruppe des Chats, der Fachservice prüft wie immer die
 * Mitgliedschaft (`deny by default`).
 *
 * Private Chats werden ausschließlich im Browser geladen und gerendert, damit
 * kein Inhalt ins SSR-HTML gelangt und nichts gecacht wird (siehe `AGENTS.md`).
 */
@Component({
  selector: 'app-chat',
  imports: [
    StateComponent,
    FormsModule,
    IconComponent,
    AvatarBadgeComponent,
    BottomSheetComponent,
    ChatThreadComponent,
    TranslatePipe,
  ],
  template: `
    <main class="page-shell">
      <section class="page-card chat-card" aria-labelledby="chat-title">
        @if (isBusy()) {
          <h1 id="chat-title" class="chat-page-title">{{ 'chat.title' | t }}</h1>
          <vereint-state kind="loading" [title]="'common.loading' | t" [message]="'chat.loadingMessage' | t" />
        } @else if (load.isError()) {
          <h1 id="chat-title" class="chat-page-title">{{ 'chat.title' | t }}</h1>
          <vereint-state
            kind="error"
            [title]="'chat.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (data(); as page) {
          <div class="chat-layout" [class.is-thread]="mobileView() === 'thread'">
            <aside class="chat-aside" [attr.aria-label]="'chat.list.ariaLabel' | t">
              <div class="chat-list-head">
                <h1 id="chat-title" class="chat-page-title">{{ 'chat.title' | t }}</h1>
                <button
                  type="button"
                  class="chat-new"
                  [attr.aria-label]="'chat.list.newMessage' | t"
                  [attr.title]="'chat.list.newMessage' | t"
                  (click)="openCompose()"
                >
                  <vereint-icon name="plus" />
                </button>
              </div>

              <label class="chat-search">
                <span class="chat-search-label">{{ 'chat.list.searchLabel' | t }}</span>
                <vereint-icon class="chat-search-icon" name="search" />
                <input
                  name="search"
                  type="search"
                  autocomplete="off"
                  [placeholder]="'chat.list.searchPlaceholder' | t"
                  [ngModel]="term()"
                  (ngModelChange)="term.set($event)"
                />
              </label>

              <div class="chat-filters" role="group" [attr.aria-label]="'chat.filter.ariaLabel' | t">
                @for (option of filters; track option) {
                  <button
                    type="button"
                    class="chat-filter"
                    [class.is-active]="filter() === option"
                    [attr.aria-pressed]="filter() === option"
                    (click)="filter.set(option)"
                  >
                    {{ 'chat.filter.' + option | t }}
                    @if (option === 'unread' && unreadChats() > 0) {
                      <span class="chat-filter-count">{{ unreadChats() }}</span>
                    }
                  </button>
                }
              </div>

              @if (rows().length === 0) {
                <vereint-state
                  kind="empty"
                  [title]="'chat.list.emptyTitle' | t"
                  [message]="(page.conversations.length === 0 ? 'chat.list.emptyStart' : 'chat.list.emptyFiltered') | t"
                />
              } @else {
                <ul class="chat-conversations">
                  @for (row of rows(); track row.id) {
                    <li>
                      <button
                        type="button"
                        class="chat-conversation"
                        [class.is-active]="row.id === selectedId()"
                        [class.has-unread]="row.unreadCount > 0"
                        [attr.aria-current]="row.id === selectedId() ? 'true' : null"
                        [attr.data-type]="row.type"
                        (click)="select(row.id)"
                      >
                        @if (row.type === 'direct') {
                          <vereint-avatar-badge class="chat-conversation-avatar" [name]="nameOf(row)" />
                        } @else {
                          <span class="chat-conversation-icon" [attr.data-type]="row.type" aria-hidden="true">
                            <vereint-icon [name]="iconOf(row)" />
                          </span>
                        }
                        <span class="chat-conversation-body">
                          <span class="chat-conversation-top">
                            <span class="chat-conversation-name">{{ nameOf(row) }}</span>
                            @if (row.lastMessage; as last) {
                              <span class="chat-conversation-time">{{ formatChatTime(last.createdAt) }}</span>
                            }
                          </span>
                          <span class="chat-conversation-bottom">
                            <span class="chat-conversation-preview">
                              <span class="chat-conversation-kind">{{ kindOf(row) }}</span>
                              @if (row.lastMessage; as last) {
                                {{ previewOf(row) }}
                              } @else {
                                {{ 'chat.list.noMessages' | t }}
                              }
                            </span>
                            @if (row.unreadCount > 0) {
                              <span class="chat-unread" [attr.aria-label]="'chat.unread' | t: { count: row.unreadCount }">
                                {{ row.unreadCount }}
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
                @if (wide() || mobileView() === 'thread') {
                  <app-chat-thread
                    [conversation]="conversation"
                    [myId]="page.myId"
                    [fill]="true"
                    (read)="onRead($event)"
                    (sent)="refreshList()"
                    (back)="backToList()"
                  />
                }
              } @else {
                <div class="chat-placeholder">
                  <span class="chat-placeholder-icon" aria-hidden="true"><vereint-icon name="chat" /></span>
                  <p class="chat-placeholder-title">{{ 'chat.list.noneSelectedTitle' | t }}</p>
                  <p class="chat-placeholder-text">{{ 'chat.list.noneSelectedMessage' | t }}</p>
                </div>
              }
            </div>
          </div>
        }
      </section>

      <vereint-bottom-sheet [open]="composeOpen()" [title]="composeTitle()" (closed)="closeCompose()">
        <div class="compose">
          @if (step() !== 'kind') {
            <button type="button" class="compose-back" (click)="step.set('kind')">
              <vereint-icon name="chevron-left" />
              {{ 'chat.compose.changeKind' | t }}
            </button>
          }
          @if (startError()) {
            <p class="manage-action-error" role="alert">{{ startError() }}</p>
          }

          @switch (step()) {
            @case ('kind') {
              <p class="compose-hint">{{ 'chat.compose.kindHint' | t }}</p>
              <ul class="compose-options">
                @for (kind of composeKinds; track kind.step) {
                  <li>
                    <button type="button" class="compose-option" [attr.data-kind]="kind.step" (click)="chooseKind(kind.step)">
                      <span class="chat-conversation-icon" [attr.data-type]="kind.step" aria-hidden="true">
                        <vereint-icon [name]="kind.icon" />
                      </span>
                      <span class="compose-option-text">
                        <span class="compose-option-title">{{ kind.titleKey | t }}</span>
                        <span class="compose-option-hint">{{ kind.hintKey | t }}</span>
                      </span>
                      <vereint-icon class="compose-option-chevron" name="chevron-right" />
                    </button>
                  </li>
                }
              </ul>
            }
            @case ('direct') {
              <label class="compose-search">
                <span>{{ 'chat.compose.personLabel' | t }}</span>
                <input
                  name="memberSearch"
                  type="search"
                  autocomplete="off"
                  [placeholder]="'chat.compose.personPlaceholder' | t"
                  [ngModel]="memberTerm()"
                  (ngModelChange)="memberTerm.set($event)"
                />
              </label>
              @if (directory.isLoading() || directory.status() === 'idle') {
                <vereint-state kind="loading" [title]="'common.loading' | t" [message]="'chat.compose.contactsLoading' | t" />
              } @else if (directory.isError()) {
                <vereint-state
                  kind="error"
                  [title]="'chat.compose.contactsUnavailable' | t"
                  [message]="directory.errorMessage()"
                  (retry)="loadDirectory()"
                />
              } @else if (members().length === 0) {
                <vereint-state
                  kind="empty"
                  [title]="'chat.compose.nobodyTitle' | t"
                  [message]="'chat.compose.nobodyMessage' | t"
                />
              } @else {
                <ul class="compose-targets compose-members">
                  @for (member of members(); track member.userId) {
                    <li>
                      <button
                        type="button"
                        class="compose-target"
                        [disabled]="starting() !== null"
                        (click)="startWith(member)"
                      >
                        <vereint-avatar-badge [name]="member.displayName" />
                        <span class="compose-option-text">
                          <span class="compose-option-title">{{ member.displayName }}</span>
                          <span class="compose-option-hint">{{ contactHint(member) }}</span>
                        </span>
                        @if (starting() === member.userId) {
                          <span class="compose-option-hint">{{ 'chat.compose.opening' | t }}</span>
                        }
                      </button>
                    </li>
                  }
                </ul>
              }
            }
            @default {
              @if (targets().length === 0) {
                <vereint-state
                  kind="empty"
                  [title]="'chat.compose.noTargetsTitle' | t"
                  [message]="(step() === 'event' ? 'chat.compose.noEvents' : 'chat.compose.noGroups') | t"
                />
              } @else {
                <ul class="compose-targets">
                  @for (target of targets(); track target.id) {
                    <li>
                      <button type="button" class="compose-target" (click)="openTarget(target.id)">
                        <span class="chat-conversation-icon" [attr.data-type]="target.type" aria-hidden="true">
                          <vereint-icon [name]="iconOf(target)" />
                        </span>
                        <span class="compose-option-text">
                          <span class="compose-option-title">{{ nameOf(target) }}</span>
                          @if (target.type === 'event' && target.stammtischName) {
                            <span class="compose-option-hint">{{ target.stammtischName }}</span>
                          }
                        </span>
                      </button>
                    </li>
                  }
                </ul>
              }
            }
          }
        </div>
      </vereint-bottom-sheet>
    </main>
  `,
  styles: [
    CHAT_LAYOUT_STYLES,
    `
      .compose {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .compose-hint {
        margin: 0;
        color: var(--color-text-muted);
      }
      .compose-back {
        align-self: flex-start;
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        border: none;
        background: none;
        padding: 0.25rem 0;
        color: var(--color-brand);
        font: inherit;
        cursor: pointer;
      }
      .compose-options,
      .compose-targets {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--space-2);
      }
      .compose-option,
      .compose-target {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .compose-option:hover,
      .compose-target:hover {
        background-color: var(--color-surface-subtle);
      }
      .compose-option-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .compose-option-title {
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      .compose-option-hint {
        color: var(--color-text-muted);
        font-size: 0.85rem;
        overflow-wrap: anywhere;
      }
      .compose-option-chevron {
        color: var(--color-text-muted);
      }
      .compose-search {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        font-weight: 600;
      }
      .compose-search input {
        width: 100%;
        padding: 0.7rem 0.9rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
        color: inherit;
        font: inherit;
        font-weight: 400;
      }
    `,
  ],
})
export class ChatComponent implements OnInit, OnDestroy {
  private readonly api = inject(ChatApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly live = inject(LiveUpdatesService);
  private readonly unreadStore = inject(ChatUnreadStore);
  private readonly destroyRef = inject(DestroyRef);
  private liveSub?: Subscription;

  protected readonly load = new AsyncState<ChatPageData>();
  protected readonly directory = new AsyncState<FriendContact[]>();
  protected readonly data = signal<ChatPageData | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly mobileView = signal<'list' | 'thread'>('list');
  /** Liste und Verlauf nebeneinander (Tablet/Web). */
  protected readonly wide = signal(false);
  protected readonly term = signal('');
  protected readonly filter = signal<ChatFilter>('all');
  protected readonly filters = FILTERS;
  protected readonly formatChatTime = formatChatTime;

  protected readonly composeOpen = signal(false);
  protected readonly step = signal<ComposeStep>('kind');
  protected readonly memberTerm = signal('');
  protected readonly starting = signal<string | null>(null);
  protected readonly startError = signal<string | null>(null);
  protected readonly composeKinds: readonly { step: ComposeStep; icon: IconName; titleKey: string; hintKey: string }[] = [
    { step: 'club', icon: 'users', titleKey: 'chat.compose.club', hintKey: 'chat.compose.clubHint' },
    { step: 'event', icon: 'events', titleKey: 'chat.compose.event', hintKey: 'chat.compose.eventHint' },
    { step: 'direct', icon: 'direct-message', titleKey: 'chat.compose.direct', hintKey: 'chat.compose.directHint' },
    { step: 'moment', icon: 'sparkle', titleKey: 'chat.compose.moment', hintKey: 'chat.compose.momentHint' },
  ];

  private listTimer: ReturnType<typeof setInterval> | null = null;
  private listSub?: Subscription;

  /** Alle Chats in Server-Reihenfolge (neueste Nachricht zuerst). */
  private readonly all = computed<ConversationSummary[]>(() => this.data()?.conversations ?? []);

  /** Chats mit ungelesenen Nachrichten, für den Chip „Ungelesen“. */
  protected readonly unreadChats = computed(() => this.all().filter((row) => row.unreadCount > 0).length);

  /** Liste nach Filter-Chip und Suche (Name, Gruppe, letzte Nachricht). */
  protected readonly rows = computed<ConversationSummary[]>(() => {
    const filter = this.filter();
    const needle = this.term().trim().toLowerCase();
    return this.all().filter((row) => {
      if (filter === 'unread' && row.unreadCount === 0) return false;
      if (filter !== 'all' && filter !== 'unread' && row.type !== filter) return false;
      if (!needle) return true;
      return [this.nameOf(row), row.stammtischName ?? '', row.lastMessage?.message ?? '', row.lastMessage?.senderName ?? '']
        .some((value) => value.toLowerCase().includes(needle));
    });
  });

  protected readonly selected = computed<ConversationSummary | null>(() => {
    const id = this.selectedId();
    return this.all().find((conversation) => conversation.id === id) ?? null;
  });

  /** Ziele für „Neue Nachricht“ an eine Gruppe bzw. in einen Event-Chat. */
  protected readonly targets = computed<ConversationSummary[]>(() => {
    const step = this.step();
    if (step !== 'club' && step !== 'event') return [];
    return this.all()
      .filter((row) => row.type === step && row.canWrite)
      .sort((a, b) => this.nameOf(a).localeCompare(this.nameOf(b), 'de'));
  });

  /** Personen für eine Direktnachricht: wem ich schreiben darf, nach Name gefiltert und sortiert. */
  protected readonly members = computed<FriendContact[]>(() => {
    const myId = this.data()?.myId;
    const needle = this.memberTerm().trim().toLowerCase();
    return (this.directory.data() ?? [])
      .filter((member) => member.userId !== myId && member.canMessage)
      .filter((member) => !needle || member.displayName.toLowerCase().includes(needle))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'));
  });

  protected readonly composeTitle = computed(() =>
    translate(this.step() === 'kind' ? 'chat.compose.title' : `chat.compose.title_${this.step()}`),
  );

  ngOnInit(): void {
    // Private Chats ausschließlich im Browser laden; SSR bleibt inhaltsleer.
    if (!isPlatformBrowser(this.platformId)) return;
    this.watchWidth();
    this.reload();
    // Neue Nachrichten und Lesestände kommen sofort; die Abfrage ist nur der Rückfall.
    this.liveSub = this.live.on('chat', 'direct', 'read').subscribe(() => this.refreshList());
    this.listTimer = setInterval(() => {
      if (this.live.connected()) return;
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') this.refreshList();
    }, CHAT_LIST_REFRESH_MS);
  }

  ngOnDestroy(): void {
    this.load.destroy();
    this.directory.destroy();
    this.listSub?.unsubscribe();
    this.liveSub?.unsubscribe();
    if (this.listTimer !== null) clearInterval(this.listTimer);
    this.listTimer = null;
  }

  protected reload(): void {
    const source = forkJoin({ me: this.api.me(), conversations: this.api.allChats() }).pipe(
      map(({ me, conversations }) => ({ myId: me.id, conversations })),
    );
    this.load.run(source, (page) => {
      this.data.set(page);
      const wanted = this.route.snapshot.queryParamMap.get('id');
      const match = page.conversations.find((conversation) => conversation.id === wanted);
      if (match) {
        this.select(match.id);
      }
      // Sonst zuerst die Liste: Nichts wird ungefragt geöffnet und als gelesen markiert.
    });
  }

  protected isBusy(): boolean {
    return !this.load.isError() && this.data() === null;
  }

  /** Anzeigename: Gruppenchat heißt wie seine Gruppe, Direktnachrichten wie das Gegenüber. */
  protected nameOf(row: ConversationSummary): string {
    if (row.type === 'direct') return row.partnerName ?? row.title;
    if (row.type === 'club') return row.stammtischName || row.title || translate('chat.list.clubChat');
    return row.title;
  }

  protected iconOf(row: ConversationSummary): IconName {
    if (row.type === 'event') return 'events';
    if (row.type === 'moment') return 'sparkle';
    if (row.type === 'direct') return 'direct-message';
    return 'users';
  }

  /** Kurze Art vor der Vorschau, z. B. „Event · Gruppe B“. */
  protected kindOf(row: ConversationSummary): string {
    if (row.type === 'event') {
      const kind = translate('chat.kind.event');
      return row.stammtischName ? `${kind} · ${row.stammtischName} · ` : `${kind} · `;
    }
    if (row.type === 'moment') {
      const kind = translate('chat.kind.moment');
      return row.stammtischName ? `${kind} · ${row.stammtischName} · ` : `${kind} · `;
    }
    return '';
  }

  /** Vorschau der letzten Nachricht; in Gruppen- und Event-Chats mit Absender. */
  protected previewOf(row: ConversationSummary): string {
    const last = row.lastMessage;
    if (!last) return '';
    // Nur Foto/Video ohne Text: „📷 Foto“ bzw. „🎥 Video“ wie bei bekannten Messengern.
    const text = last.message || (last.mediaKind ? translate(last.mediaKind === 'video' ? 'chat.list.video' : 'chat.list.photo') : '');
    if (row.type === 'direct') return text;
    return `${last.senderName}: ${text}`;
  }

  protected select(id: string): void {
    this.selectedId.set(id);
    this.mobileView.set('thread');
  }

  protected backToList(): void {
    this.mobileView.set('list');
    // Der Link aus einer Mitteilung (`?id=`) soll beim Neuladen nicht wieder den Chat öffnen.
    if (this.route.snapshot.queryParamMap.has('id')) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { id: null }, replaceUrl: true });
    }
  }

  /** Übernimmt den neuen Lesestand in die Liste. */
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

  // --- Neue Nachricht ---

  protected openCompose(): void {
    this.startError.set(null);
    this.memberTerm.set('');
    this.step.set('kind');
    this.composeOpen.set(true);
  }

  protected closeCompose(): void {
    this.composeOpen.set(false);
  }

  protected chooseKind(step: ComposeStep): void {
    this.startError.set(null);
    // Ein Moment startet im gewohnten Dialog der Moments-Seite; danach geht es in seinen Chat.
    if (step === 'moment') {
      this.composeOpen.set(false);
      void this.router.navigate(['/moments'], { queryParams: { start: 'chat' } });
      return;
    }
    this.step.set(step);
    if (step === 'direct' && !this.directory.isSuccess()) this.loadDirectory();
  }

  protected loadDirectory(): void {
    this.directory.run(this.api.contacts());
  }

  /** Öffnet einen Gruppen- oder Event-Chat aus der Auswahl. */
  protected openTarget(id: string): void {
    this.composeOpen.set(false);
    this.term.set('');
    this.filter.set('all');
    this.select(id);
  }

  /** Gemeinsame Gruppen bzw. „Freund“ unter dem Namen in der Auswahl. */
  protected contactHint(member: FriendContact): string {
    const groups = member.sharedGroups.map((group) => group.name).join(', ');
    if (member.friendStatus === 'friend') {
      return groups ? `${translate('chat.compose.friend')} · ${groups}` : translate('chat.compose.friend');
    }
    return groups;
  }

  /** Startet bzw. öffnet den Direktchat mit dieser Person (ein Gespräch je Paar). */
  protected startWith(member: FriendContact): void {
    if (this.starting() !== null) return;
    this.starting.set(member.userId);
    this.startError.set(null);
    this.api.startDirect(member.userId).subscribe({
      next: (conversation) => {
        this.starting.set(null);
        const current = this.data();
        if (current && !current.conversations.some((entry) => entry.id === conversation.id)) {
          this.data.set({ ...current, conversations: [conversation, ...current.conversations] });
        }
        this.openTarget(conversation.id);
      },
      error: (error: unknown) => {
        this.starting.set(null);
        this.startError.set(describeApiError(error));
      },
    });
  }

  /** Lädt die Liste still nach (Ungelesen-Zähler, Vorschau, Reihenfolge). */
  protected refreshList(): void {
    if (this.data() === null) return;
    this.listSub?.unsubscribe();
    this.listSub = this.api.allChats().subscribe({
      next: (conversations) => {
        const current = this.data();
        if (!current) return;
        // Frisch angelegte Direktchats ohne Nachricht behalten, falls der Server sie noch nicht liefert.
        const missing = current.conversations.filter(
          (entry) => entry.type === 'direct' && !conversations.some((fresh) => fresh.id === entry.id),
        );
        this.data.set({ ...current, conversations: [...conversations, ...missing] });
        this.unreadStore.refresh();
      },
      error: () => undefined,
    });
  }

  private watchWidth(): void {
    const query = globalThis.matchMedia?.(CHAT_WIDE_QUERY);
    if (!query) return;
    this.wide.set(query.matches);
    const onChange = (event: MediaQueryListEvent) => this.wide.set(event.matches);
    query.addEventListener?.('change', onChange);
    this.destroyRef.onDestroy(() => query.removeEventListener?.('change', onChange));
  }
}
