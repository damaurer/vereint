import {
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AsyncState } from '../member/async-state';
import { formatDateTime } from '../member/member-format';
import { AvatarBadgeComponent, InfoPanelComponent } from '../ui';
import { ChatDataService } from './chat-data.service';
import { DRINK_EMOJI, type ChatMessage, type ChatOverview } from './chat.model';
import { StateComponent } from '../ui/state.component';

/** Zusammengefasste Konversationszeile für die Seitenliste. */
interface ConversationRow {
  id: string;
  name: string;
  preview: string;
  timeLabel: string;
  unreadCount: number;
  online: boolean;
  isGroup: boolean;
}

/**
 * Stammtisch-Messenger (TICKET-035).
 *
 * Vereint Gruppen-Chat und Direktnachrichten in einem geräteübergreifenden
 * Verlaufslayout: Web und Tablet zeigen zweispaltig Konversationsliste und
 * Verlauf, Mobil eine einspaltige Liste, die zum Verlauf navigiert. Oben im
 * Gruppen-Chat steht das gepinnte Schriftwart-Info-Panel; Nachrichtenblasen
 * tragen Autor und Zeit, tragen Emoji-Reaktionen mit Zähler und der Composer
 * bietet Anhang, Getränk und Senden.
 *
 * Private Chats werden ausschließlich im Browser geladen und gerendert, damit
 * kein Inhalt ins SSR-HTML gelangt und nichts gecacht wird (siehe `AGENTS.md`).
 * Die Sichtbarkeit der Konversationen bestimmt serverseitig der Fachservice
 * (`deny by default`); das gepinnte Info-Panel erscheint nur, wenn geliefert.
 */
@Component({
  selector: 'app-chat',
  imports: [StateComponent, IconComponent, FormsModule, RouterLink, AvatarBadgeComponent, InfoPanelComponent],
  template: `
    <main class="page-shell">
      <section class="page-card chat-card" aria-labelledby="chat-title">
        <div class="chat-head">
          <div>
            <span class="eyebrow">Stammtisch-Messenger</span>
            <h1 id="chat-title">Chat</h1>
          </div>
          <a class="member-back" routerLink="/direktnachrichten">Direktnachrichten →</a>
        </div>

        @if (isBusy()) {
          <vereint-state
            kind="loading"
            title="Wird geladen …"
            message="Die Konversationen werden abgerufen."
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            title="Chat nicht verfügbar"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (model(); as data) {
          <div class="chat-layout" [class.is-thread]="mobileView() === 'thread'">
            <aside class="chat-aside" aria-label="Konversationen">
              <button type="button" class="member-button chat-new">+ Neue Nachricht</button>
              <ul class="chat-conversations">
                @for (row of rows(); track row.id) {
                  <li>
                    <button
                      type="button"
                      class="chat-conversation"
                      [class.is-active]="row.id === selectedId()"
                      [attr.aria-current]="row.id === selectedId() ? 'true' : null"
                      (click)="select(row.id)"
                    >
                      <span class="chat-avatar-wrap">
                        <vereint-avatar-badge [name]="row.name" />
                        @if (row.online) {
                          <span class="chat-online" aria-label="online"></span>
                        }
                      </span>
                      <span class="chat-conversation-body">
                        <span class="chat-conversation-top">
                          <span class="chat-conversation-name">{{ row.name }}</span>
                          <span class="chat-conversation-time">{{ row.timeLabel }}</span>
                        </span>
                        <span class="chat-conversation-preview">{{ row.preview }}</span>
                      </span>
                      @if (row.unreadCount > 0) {
                        <span class="chat-unread" [attr.aria-label]="row.unreadCount + ' ungelesen'">
                          {{ row.unreadCount }}
                        </span>
                      }
                    </button>
                  </li>
                }
              </ul>
            </aside>

            <div class="chat-thread">
              <header class="chat-thread-head">
                <button type="button" class="chat-back" (click)="backToList()">← Zurück</button>
                <div>
                  <strong>{{ selectedName() }}</strong>
                  @if (isGroupSelected()) {
                    <span class="chat-thread-sub">{{ data.group.membersOnline }} Mitglieder online</span>
                  }
                </div>
              </header>

              @if (isGroupSelected() && data.group.pinned; as pinned) {
                <vereint-info-panel [title]="'Info vom Schriftwart (' + pinned.authorName + ')'">
                  {{ pinned.text }}
                </vereint-info-panel>
              }

              <div class="chat-history">
                @if (selectedMessages().length === 0) {
                  <vereint-state
                    kind="empty"
                    title="Noch keine Nachrichten"
                    message="Schreibe die erste Nachricht in diese Konversation."
                  />
                } @else {
                  @for (message of selectedMessages(); track message.id) {
                    <article class="chat-message" [class.is-own]="message.authorId === data.currentUserId">
                      <vereint-avatar-badge class="chat-message-avatar" [name]="message.authorName" />
                      <div class="chat-message-body">
                        <div class="chat-message-head">
                          <span class="chat-message-author">{{ message.authorName }}</span>
                          <span class="chat-message-time">{{ formatDateTime(message.createdAt) }}</span>
                        </div>
                        <p class="chat-bubble">{{ message.text }}</p>
                        <div class="chat-reactions">
                          @for (reaction of message.reactions; track reaction.emoji) {
                            <button
                              type="button"
                              class="chat-reaction"
                              [class.is-active]="reaction.reactedByMe"
                              (click)="toggleReaction(message.id, reaction.emoji)"
                            >
                              <span aria-hidden="true">{{ reaction.emoji }}</span>
                              <span class="chat-reaction-count">{{ reaction.count }}</span>
                            </button>
                          }
                          <button
                            type="button"
                            class="chat-reaction chat-reaction-add"
                            aria-label="Reaktion hinzufügen"
                            (click)="toggleReaction(message.id, '👍')"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </article>
                  }
                }
              </div>

              @if (sendError()) {
                <p class="manage-action-error" role="alert">{{ sendError() }}</p>
              }

              <form class="chat-composer" (ngSubmit)="send()">
                <button
                  type="button"
                  class="chat-icon-button"
                  aria-label="Anhang hinzufügen"
                  (click)="attach()"
                >
                  <vereint-icon name="attach" />
                </button>
                <input
                  name="draft"
                  class="chat-input"
                  autocomplete="off"
                  placeholder="Schreibe eine Nachricht…"
                  [(ngModel)]="draft"
                  [disabled]="sending()"
                />
                <button
                  type="button"
                  class="chat-icon-button"
                  aria-label="Getränk einfügen"
                  (click)="addDrink()"
                >
                  {{ drinkEmoji }}
                </button>
                <button
                  type="submit"
                  class="chat-send"
                  aria-label="Senden"
                  [disabled]="sending() || draft.trim().length === 0"
                >
                  <vereint-icon name="send" />
                </button>
              </form>
            </div>
          </div>
        }
      </section>
    </main>
  `,
  styles: [
    `
      .chat-card {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .chat-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .chat-layout {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--space-3);
        min-height: 0;
      }
      .chat-aside {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        min-width: 0;
      }
      .chat-new {
        width: 100%;
      }
      .chat-conversations {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--space-2);
      }
      .chat-conversation {
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
      .chat-conversation.is-active {
        border-color: var(--color-brand);
        background-color: var(--color-brand-soft);
      }
      .chat-avatar-wrap {
        position: relative;
        flex: none;
      }
      .chat-online {
        position: absolute;
        right: -1px;
        bottom: -1px;
        width: 0.65rem;
        height: 0.65rem;
        border-radius: 50%;
        background-color: #16a34a;
        border: 2px solid var(--color-surface-raised);
      }
      .chat-conversation-body {
        flex: 1;
        min-width: 0;
      }
      .chat-conversation-top {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .chat-conversation-name {
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      .chat-conversation-time {
        color: var(--color-text-muted);
        font-size: 0.8rem;
        white-space: nowrap;
      }
      .chat-conversation-preview {
        display: block;
        color: var(--color-text-muted);
        font-size: 0.85rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .chat-unread {
        flex: none;
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
      .chat-thread {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        min-width: 0;
      }
      .chat-thread-head {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      .chat-thread-sub {
        display: block;
        color: var(--color-text-muted);
        font-size: 0.85rem;
      }
      .chat-back {
        border: none;
        background: none;
        color: var(--color-brand);
        font: inherit;
        cursor: pointer;
        padding: 0;
      }
      .chat-history {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-2) 0;
      }
      .chat-message {
        display: flex;
        gap: var(--space-2);
        align-items: flex-start;
      }
      .chat-message-avatar {
        flex: none;
      }
      .chat-message-body {
        min-width: 0;
        flex: 1;
      }
      .chat-message-head {
        display: flex;
        align-items: baseline;
        gap: var(--space-2);
      }
      .chat-message-author {
        color: var(--color-brand);
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      .chat-message-time {
        color: var(--color-text-muted);
        font-size: 0.8rem;
      }
      .chat-bubble {
        margin: 0.3rem 0 0;
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        border: 1px solid var(--color-border);
        overflow-wrap: anywhere;
      }
      .chat-message.is-own .chat-bubble {
        background-color: var(--color-brand-soft);
        border-color: var(--color-brand);
      }
      .chat-reactions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 0.4rem;
      }
      .chat-reaction {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background-color: var(--color-surface);
        color: inherit;
        font: inherit;
        font-size: 0.85rem;
        cursor: pointer;
      }
      .chat-reaction.is-active {
        border-color: var(--color-brand);
        background-color: var(--color-brand-soft);
      }
      .chat-reaction-count {
        font-weight: 700;
      }
      .chat-reaction-add {
        color: var(--color-text-muted);
      }
      .chat-composer {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding-top: var(--space-2);
        border-top: 1px solid var(--color-border);
      }
      .chat-input {
        flex: 1;
        min-width: 0;
        padding: 0.7rem 0.9rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
        color: inherit;
        font: inherit;
      }
      .chat-icon-button {
        flex: none;
        border: none;
        background: none;
        font-size: 1.2rem;
        cursor: pointer;
        color: var(--color-text-muted);
        padding: 0.3rem;
      }
      .chat-send {
        flex: none;
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 50%;
        border: none;
        background-color: var(--color-brand);
        color: #1a1206;
        font-size: 1.1rem;
        cursor: pointer;
      }
      .chat-send:disabled {
        opacity: 0.5;
        cursor: default;
      }

      /* Mobil: einspaltig, Liste ODER Verlauf. */
      .chat-thread {
        display: none;
      }
      .chat-layout:not(.is-thread) .chat-aside {
        display: flex;
      }
      .chat-layout.is-thread .chat-aside {
        display: none;
      }
      .chat-layout.is-thread .chat-thread {
        display: flex;
      }

      /* Tablet/Web: zweispaltig, Liste und Verlauf gleichzeitig. */
      @media (min-width: 641px) {
        .chat-layout {
          grid-template-columns: minmax(14rem, 22rem) 1fr;
        }
        .chat-layout .chat-aside,
        .chat-layout .chat-thread {
          display: flex;
        }
        .chat-back {
          display: none;
        }
      }
    `,
  ],
})
export class ChatComponent implements OnInit, OnDestroy {
  private readonly data = inject(ChatDataService);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly load = new AsyncState<ChatOverview>();
  protected readonly model = signal<ChatOverview | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly mobileView = signal<'list' | 'thread'>('list');
  protected readonly sending = signal(false);
  protected readonly sendError = signal<string | null>(null);

  protected draft = '';
  protected readonly drinkEmoji = DRINK_EMOJI;
  protected readonly formatDateTime = formatDateTime;

  /** Konversationszeilen: Gruppe zuerst, danach Direktnachrichten. */
  protected readonly rows = computed<ConversationRow[]>(() => {
    const data = this.model();
    if (!data) return [];
    const group: ConversationRow = {
      id: data.group.id,
      name: data.group.name,
      preview: data.group.messages.at(-1)?.text ?? '',
      timeLabel: `${data.group.membersOnline} online`,
      unreadCount: 0,
      online: true,
      isGroup: true,
    };
    const dms = data.conversations.map<ConversationRow>((conversation) => ({
      id: conversation.id,
      name: conversation.partnerName,
      preview: conversation.lastText,
      timeLabel: conversation.lastLabel,
      unreadCount: conversation.unreadCount,
      online: conversation.online,
      isGroup: false,
    }));
    return [group, ...dms];
  });

  protected readonly isGroupSelected = computed(
    () => this.model()?.group.id === this.selectedId(),
  );

  protected readonly selectedName = computed(() => {
    const data = this.model();
    const id = this.selectedId();
    if (!data || !id) return '';
    if (id === data.group.id) return data.group.name;
    return data.conversations.find((conversation) => conversation.id === id)?.partnerName ?? '';
  });

  protected readonly selectedMessages = computed<ChatMessage[]>(() => {
    const data = this.model();
    const id = this.selectedId();
    if (!data || !id) return [];
    if (id === data.group.id) return data.group.messages;
    return data.conversations.find((conversation) => conversation.id === id)?.messages ?? [];
  });

  ngOnInit(): void {
    // Private Chats ausschließlich im Browser laden; SSR bleibt inhaltsleer.
    if (!isPlatformBrowser(this.platformId)) return;
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.load.run(this.data.loadOverview(), (overview) => {
      this.model.set(overview);
      this.selectedId.set(overview.group.id);
    });
  }

  /** Zeigt an, ob noch geladen wird (inklusive initialem SSR-/Idle-Zustand). */
  protected isBusy(): boolean {
    return !this.load.isError() && this.model() === null;
  }

  protected select(id: string): void {
    this.selectedId.set(id);
    this.sendError.set(null);
    this.mobileView.set('thread');
  }

  protected backToList(): void {
    this.mobileView.set('list');
  }

  /** Sendet die Composer-Nachricht über die Datenschicht und leert das Feld. */
  protected send(): void {
    const text = this.draft.trim();
    const id = this.selectedId();
    if (!text || !id || this.sending()) return;

    this.sending.set(true);
    this.sendError.set(null);
    this.data.sendMessage(id, text).subscribe({
      next: (message) => {
        this.appendMessage(id, message);
        this.draft = '';
        this.sending.set(false);
      },
      error: () => {
        // Neutrale Meldung; die Nachricht bleibt zum erneuten Senden im Feld.
        this.sendError.set('Nachricht konnte nicht gesendet werden. Bitte erneut versuchen.');
        this.sending.set(false);
      },
    });
  }

  /** Fügt ein Getränke-Emoji an den Composer-Text an. */
  protected addDrink(): void {
    this.draft = `${this.draft}${DRINK_EMOJI}`;
  }

  /** Platzhalter für Anhänge; ohne Backend nur eine neutrale Rückmeldung. */
  protected attach(): void {
    this.sendError.set('Anhänge sind derzeit nicht verfügbar.');
  }

  /** Schaltet eine Emoji-Reaktion des aktuellen Nutzers um und passt den Zähler an. */
  protected toggleReaction(messageId: string, emoji: string): void {
    const data = this.model();
    const id = this.selectedId();
    if (!data || !id) return;

    const updateMessages = (messages: ChatMessage[]): ChatMessage[] =>
      messages.map((message) => {
        if (message.id !== messageId) return message;
        const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
        let reactions;
        if (!existing) {
          reactions = [...message.reactions, { emoji, count: 1, reactedByMe: true }];
        } else {
          const nextCount = existing.count + (existing.reactedByMe ? -1 : 1);
          reactions = message.reactions
            .map((reaction) =>
              reaction.emoji === emoji
                ? { ...reaction, count: nextCount, reactedByMe: !reaction.reactedByMe }
                : reaction,
            )
            .filter((reaction) => reaction.count > 0);
        }
        return { ...message, reactions };
      });

    if (id === data.group.id) {
      this.model.set({
        ...data,
        group: { ...data.group, messages: updateMessages(data.group.messages) },
      });
      return;
    }
    this.model.set({
      ...data,
      conversations: data.conversations.map((conversation) =>
        conversation.id === id
          ? { ...conversation, messages: updateMessages(conversation.messages) }
          : conversation,
      ),
    });
  }

  /** Hängt eine neue Nachricht immutabel an die gewählte Konversation an. */
  private appendMessage(id: string, message: ChatMessage): void {
    const data = this.model();
    if (!data) return;
    if (id === data.group.id) {
      this.model.set({
        ...data,
        group: { ...data.group, messages: [...data.group.messages, message] },
      });
      return;
    }
    this.model.set({
      ...data,
      conversations: data.conversations.map((conversation) =>
        conversation.id === id
          ? { ...conversation, messages: [...conversation.messages, message] }
          : conversation,
      ),
    });
  }
}
