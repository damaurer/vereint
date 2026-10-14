import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  PLATFORM_ID,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';
import type { ChatMessageDto, ConversationSummary } from '../api/api.types';
import { describeApiError } from '../api/api-client.service';
import { formatDateTime } from '../member/member-format';
import { AvatarBadgeComponent, InfoPanelComponent } from '../ui';
import { IconComponent } from '../ui/icon.component';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';
import { ChatApiService } from './chat-api.service';
import { ChatUnreadStore } from './chat-unread.store';

/** Abstand der Abfrage neuer Nachrichten (es gibt keine Websockets). */
export const CHAT_POLL_INTERVAL_MS = 10_000;

/** Getränke-Emoji für Composer und Schnellreaktion. */
export const DRINK_EMOJI = '🍺';

/** Schnellauswahl für Reaktionen; jedes Emoji schaltet die eigene Reaktion um. */
export const QUICK_REACTIONS = [DRINK_EMOJI, '👍', '❤️', '😂', '🎉'] as const;

/**
 * Verlauf einer Konversation mit Infotafel, Nachrichten, Reaktionen und
 * Composer. Wird von Vereinschat und Direktnachrichten gemeinsam genutzt.
 *
 * Lädt die Nachrichten beim Öffnen, markiert die Konversation als gelesen und
 * fragt alle 10 Sekunden nach neuen Nachrichten, solange die Seite sichtbar
 * ist. Neue Nachrichten setzen den Lesestand erneut. Nur im Browser aktiv; im
 * SSR-HTML erscheinen keine privaten Inhalte.
 */
@Component({
  selector: 'app-chat-thread',
  imports: [
    FormsModule,
    RouterLink,
    AvatarBadgeComponent,
    InfoPanelComponent,
    IconComponent,
    StateComponent,
    TranslatePipe,
  ],
  template: `
    <div class="chat-thread">
      <header class="chat-thread-head">
        <button type="button" class="chat-back" (click)="back.emit()">{{ 'chat.thread.back' | t }}</button>
        <div class="chat-thread-title">
          <strong>{{ conversation.title }}</strong>
          @if (conversation.type === 'event' && conversation.eventId) {
            <a class="chat-thread-sub" [routerLink]="['/events', conversation.eventId]">{{
              'chat.thread.toEvent' | t
            }}</a>
          }
        </div>
      </header>

      @if (conversation.pinned; as pinned) {
        <vereint-info-panel [title]="'chat.thread.pinnedTitle' | t: { name: pinned.authorName }">
          <span class="chat-pinned-text">{{ pinned.text }}</span>
        </vereint-info-panel>
      }

      <div class="chat-history" #history>
        @if (messages() === null) {
          @if (loadError(); as error) {
            <vereint-state
              kind="error"
              [title]="'chat.thread.loadFailed' | t"
              [message]="error"
              (retry)="refresh()"
            />
          } @else {
            <vereint-state
              kind="loading"
              [title]="'common.loading' | t"
              [message]="'chat.thread.loadingMessage' | t"
            />
          }
        } @else if (messages()!.length === 0) {
          <vereint-state
            kind="empty"
            [title]="'chat.thread.emptyTitle' | t"
            [message]="'chat.thread.emptyMessage' | t"
          />
        } @else {
          @for (message of messages(); track message.id) {
            <article class="chat-message" [class.is-own]="isOwn(message)">
              <vereint-avatar-badge class="chat-message-avatar" [name]="message.senderName" />
              <div class="chat-message-body">
                <div class="chat-message-head">
                  <span class="chat-message-author">{{
                    isOwn(message) ? ('chat.you' | t) : message.senderName
                  }}</span>
                  @if (message.senderType === 'guest') {
                    <span class="chat-message-guest">{{ 'chat.thread.guest' | t }}</span>
                  }
                  <span class="chat-message-time">{{ formatDateTime(message.createdAt) }}</span>
                </div>
                <p class="chat-bubble">{{ message.message }}</p>
                @if (message.imageUrl) {
                  <img class="chat-image" [src]="message.imageUrl" [alt]="'chat.thread.image' | t" loading="lazy" />
                }
                <div class="chat-reactions">
                  @for (reaction of message.reactions ?? []; track reaction.emoji) {
                    <button
                      type="button"
                      class="chat-reaction"
                      [class.is-active]="reaction.reactedByMe"
                      [attr.aria-pressed]="reaction.reactedByMe"
                      [attr.aria-label]="'chat.thread.reactionLabel' | t: { emoji: reaction.emoji, count: reaction.count }"
                      [disabled]="reacting()"
                      (click)="toggleReaction(message, reaction.emoji)"
                    >
                      <span aria-hidden="true">{{ reaction.emoji }}</span>
                      <span class="chat-reaction-count" aria-hidden="true">{{ reaction.count }}</span>
                    </button>
                  }
                  <button
                    type="button"
                    class="chat-reaction chat-reaction-add"
                    [attr.aria-label]="'chat.thread.addReaction' | t"
                    [attr.aria-expanded]="pickerFor() === message.id"
                    (click)="togglePicker(message.id)"
                  >
                    +
                  </button>
                </div>
                @if (pickerFor() === message.id) {
                  <div class="chat-picker" role="group" [attr.aria-label]="'chat.thread.addReaction' | t">
                    @for (emoji of quickReactions; track emoji) {
                      <button
                        type="button"
                        class="chat-picker-emoji"
                        [attr.aria-label]="'chat.thread.reactWith' | t: { emoji }"
                        [disabled]="reacting()"
                        (click)="toggleReaction(message, emoji)"
                      >
                        {{ emoji }}
                      </button>
                    }
                  </div>
                }
              </div>
            </article>
          }
        }
      </div>

      @if (actionError()) {
        <p class="manage-action-error" role="alert">{{ actionError() }}</p>
      }

      @if (conversation.canWrite) {
        <form class="chat-composer" (ngSubmit)="send()">
          <label class="chat-input-label" for="chat-draft">{{ 'chat.composer.placeholder' | t }}</label>
          <input
            id="chat-draft"
            name="draft"
            class="chat-input"
            autocomplete="off"
            maxlength="2000"
            [placeholder]="'chat.composer.placeholder' | t"
            [(ngModel)]="draft"
            [disabled]="sending()"
          />
          <button
            type="button"
            class="chat-icon-button"
            [attr.aria-label]="'chat.composer.addDrink' | t"
            (click)="addDrink()"
          >
            {{ drinkEmoji }}
          </button>
          <button
            type="submit"
            class="chat-send"
            [attr.aria-label]="'chat.composer.send' | t"
            [disabled]="sending() || draft.trim().length === 0"
          >
            <vereint-icon name="send" />
          </button>
        </form>
      } @else {
        <p class="chat-readonly" role="status">{{ 'chat.composer.readOnly' | t }}</p>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
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
      .chat-thread-title {
        display: flex;
        flex-direction: column;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .chat-thread-sub {
        color: var(--color-brand);
        font-size: 0.85rem;
      }
      .chat-back {
        border: none;
        background: none;
        color: var(--color-brand);
        font: inherit;
        cursor: pointer;
        padding: 0.5rem 0.25rem;
      }
      .chat-pinned-text {
        white-space: pre-line;
      }
      .chat-history {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-2) 0;
        max-height: min(65vh, 40rem);
        overflow-y: auto;
        overscroll-behavior: contain;
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
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .chat-message-author {
        color: var(--color-brand);
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      .chat-message-guest {
        color: var(--color-text-muted);
        font-size: 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0 0.4rem;
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
        white-space: pre-line;
      }
      .chat-message.is-own .chat-bubble {
        background-color: var(--color-brand-soft);
        border-color: var(--color-brand);
      }
      .chat-image {
        display: block;
        max-width: min(100%, 20rem);
        margin-top: 0.4rem;
        border-radius: var(--radius-md);
      }
      .chat-reactions,
      .chat-picker {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 0.4rem;
      }
      .chat-reaction,
      .chat-picker-emoji {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        min-height: 2rem;
        padding: 0.15rem 0.55rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background-color: var(--color-surface);
        color: inherit;
        font: inherit;
        font-size: 0.9rem;
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
      .chat-picker-emoji {
        font-size: 1.1rem;
      }
      .chat-composer {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding-top: var(--space-2);
        border-top: 1px solid var(--color-border);
      }
      .chat-input-label {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
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
        min-width: 2.75rem;
        min-height: 2.75rem;
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
      .chat-readonly {
        margin: 0;
        padding-top: var(--space-2);
        border-top: 1px solid var(--color-border);
        color: var(--color-text-muted);
      }
      @media (min-width: 641px) {
        .chat-back {
          display: none;
        }
      }
    `,
  ],
})
export class ChatThreadComponent implements OnInit, OnChanges, OnDestroy {
  private readonly api = inject(ChatApiService);
  private readonly unreadStore = inject(ChatUnreadStore);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);

  /** Die geöffnete Konversation. */
  @Input({ required: true }) conversation!: ConversationSummary;
  /** Eigene Benutzer-ID, um eigene Nachrichten zu erkennen. */
  @Input() myId: string | null = null;

  /** Lesestand wurde gesetzt; liefert die aktualisierte Zusammenfassung. */
  @Output() readonly read = new EventEmitter<ConversationSummary>();
  /** Neue eigene Nachricht wurde gesendet. */
  @Output() readonly sent = new EventEmitter<ChatMessageDto>();
  /** Mobil: zurück zur Liste. */
  @Output() readonly back = new EventEmitter<void>();

  @ViewChild('history') private historyRef?: ElementRef<HTMLElement>;

  protected readonly messages = signal<ChatMessageDto[] | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly sending = signal(false);
  protected readonly reacting = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly pickerFor = signal<string | null>(null);

  protected draft = '';
  protected readonly drinkEmoji = DRINK_EMOJI;
  protected readonly quickReactions = QUICK_REACTIONS;
  protected readonly formatDateTime = formatDateTime;

  private loadSub?: Subscription;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly onVisibility = () => {
    if (this.isVisible()) this.refresh();
  };

  private get browser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    if (!this.browser) return;
    this.pollTimer = setInterval(() => {
      if (this.isVisible()) this.refresh();
    }, CHAT_POLL_INTERVAL_MS);
    this.document.addEventListener('visibilitychange', this.onVisibility);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['conversation'];
    if (!change) return;
    const previous = change.previousValue as ConversationSummary | undefined;
    if (previous?.id === this.conversation.id) return;
    // Andere Konversation: Zustand zurücksetzen und neu laden.
    this.messages.set(null);
    this.loadError.set(null);
    this.actionError.set(null);
    this.pickerFor.set(null);
    this.draft = '';
    this.refresh();
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
    if (this.pollTimer !== null) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.browser) this.document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /** Lädt die Nachrichten und setzt den Lesestand, wenn etwas Neues da ist. */
  refresh(): void {
    if (!this.browser || !this.conversation) return;
    const id = this.conversation.id;
    const before = this.messages();
    this.loadSub?.unsubscribe();
    this.loadSub = this.api.messages(id).subscribe({
      next: (messages) => {
        if (id !== this.conversation.id) return;
        const isFirst = before === null;
        const hasNew = isFirst || lastId(messages) !== lastId(before);
        this.messages.set(messages);
        this.loadError.set(null);
        if (hasNew) {
          this.scrollToEnd();
          if (isFirst || this.hasForeignAfter(before, messages)) this.markRead();
        }
      },
      error: (error: unknown) => {
        // Beim Nachladen bleiben die bekannten Nachrichten stehen.
        if (this.messages() === null) this.loadError.set(describeApiError(error));
      },
    });
  }

  protected isOwn(message: ChatMessageDto): boolean {
    return !!this.myId && message.senderType === 'member' && message.senderId === this.myId;
  }

  /** Sendet die Composer-Nachricht und leert das Feld. */
  protected send(): void {
    const text = this.draft.trim();
    const id = this.conversation?.id;
    if (!text || !id || this.sending() || !this.conversation.canWrite) return;

    this.sending.set(true);
    this.actionError.set(null);
    this.api.send(id, text).subscribe({
      next: (message) => {
        this.sending.set(false);
        this.draft = '';
        if (id !== this.conversation.id) return;
        this.messages.update((list) =>
          list?.some((entry) => entry.id === message.id) ? list : [...(list ?? []), message],
        );
        this.sent.emit(message);
        this.scrollToEnd();
      },
      error: () => {
        // Neutrale Meldung; die Nachricht bleibt zum erneuten Senden im Feld.
        this.actionError.set(translate('chat.composer.sendFailed'));
        this.sending.set(false);
      },
    });
  }

  protected addDrink(): void {
    this.draft = `${this.draft}${DRINK_EMOJI}`;
  }

  protected togglePicker(messageId: string): void {
    this.pickerFor.update((current) => (current === messageId ? null : messageId));
  }

  /** Schaltet die eigene Reaktion um und übernimmt den Serverstand. */
  protected toggleReaction(message: ChatMessageDto, emoji: string): void {
    const id = this.conversation.id;
    if (this.reacting()) return;
    this.reacting.set(true);
    this.actionError.set(null);
    this.api.toggleReaction(id, message.id, emoji).subscribe({
      next: (updated) => {
        this.reacting.set(false);
        this.pickerFor.set(null);
        if (id !== this.conversation.id) return;
        this.messages.update((list) =>
          (list ?? []).map((entry) => (entry.id === updated.id ? updated : entry)),
        );
      },
      error: () => {
        this.reacting.set(false);
        this.actionError.set(translate('chat.thread.reactionFailed'));
      },
    });
  }

  private markRead(): void {
    const id = this.conversation.id;
    this.api.markRead(id).subscribe({
      next: (summary) => {
        this.read.emit(summary);
        this.unreadStore.refresh();
      },
      // Lesestand ist nicht kritisch; beim nächsten Abruf erneut.
      error: () => undefined,
    });
  }

  /** Neue Nachrichten anderer seit dem letzten bekannten Stand? */
  private hasForeignAfter(before: ChatMessageDto[] | null, after: ChatMessageDto[]): boolean {
    const known = new Set((before ?? []).map((message) => message.id));
    return after.some((message) => !known.has(message.id) && !this.isOwn(message));
  }

  private isVisible(): boolean {
    return this.document.visibilityState !== 'hidden';
  }

  private scrollToEnd(): void {
    if (!this.browser) return;
    setTimeout(() => {
      const element = this.historyRef?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }
}

function lastId(messages: ChatMessageDto[] | null): string | null {
  return messages && messages.length > 0 ? messages[messages.length - 1].id : null;
}
