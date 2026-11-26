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
  computed,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom, type Subscription } from 'rxjs';
import type { ChatMedia, ChatMessageDto, ConversationSummary, MessageReceipt } from '../api/api.types';
import { describeApiError } from '../api/api-client.service';
import { formatDateTime, formatDayTime, formatShortDateTime, formatTime } from '../member/member-format';
import { AvatarBadgeComponent, InfoPanelComponent } from '../ui';
import { IconComponent } from '../ui/icon.component';
import type { IconName } from '../ui/icons';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';
import { ChatApiService } from './chat-api.service';
import { ChatUnreadStore } from './chat-unread.store';
import { LiveUpdatesService } from '../live/live-updates.service';
import { ChatOutboxService, type OutboxEntry } from './chat-outbox.service';
import { ChatMediaGridComponent, type ChatMediaTile } from './chat-media-grid.component';
import { CHAT_MEDIA_ACCEPT, CHAT_MEDIA_LIMITS, ChatMediaUploader } from './chat-media';
import { EmojiPickerComponent } from '../ui/emoji-picker.component';
import { I18nService } from '../i18n/i18n.service';
import { MediaPrepareError, type PreparedMedia } from '../moments/moment-media';
import { ModerationApiService } from '../moderation/moderation-api.service';
import { ReportDialogComponent, type ReportDialogResult } from '../moderation/report-dialog.component';

/** Ein Anhang im Composer: lokal vorbereitet, wird sofort hochgeladen. */
interface DraftMedia {
  key: string;
  prepared: PreparedMedia;
  progress: number;
  uploaded: ChatMedia | null;
  failed: boolean;
  abort: () => void;
}

/** Abstand der Abfrage neuer Nachrichten, solange keine Live-Verbindung steht. */
export const CHAT_POLL_INTERVAL_MS = 10_000;

/** Höchstens so oft meldet die App beim Tippen „schreibt gerade…“. */
export const TYPING_SEND_INTERVAL_MS = 3_000;

/** So lange bleibt „schreibt gerade…“ ohne neues Signal stehen. */
export const TYPING_DISPLAY_MS = 6_000;

/** Getränke-Emoji für Composer und Schnellreaktion. */
export const DRINK_EMOJI = '🍺';

/** Schnellauswahl für Reaktionen; jedes Emoji schaltet die eigene Reaktion um. */
export const QUICK_REACTIONS = [DRINK_EMOJI, '👍', '❤️', '😂', '🎉'] as const;

/**
 * Verlauf einer Konversation mit Infotafel, Nachrichten, Reaktionen und
 * Composer. Wird von Gruppenchat und Direktnachrichten gemeinsam genutzt.
 *
 * Lädt die Nachrichten beim Öffnen und markiert die Konversation als gelesen,
 * sobald sie sichtbar ist. Neue Nachrichten, Reaktionen und Haken kommen über
 * die Live-Verbindung; ohne sie fragt der Verlauf alle 10 Sekunden nach.
 *
 * Wie bei bekannten Messengern:
 * - Eigene Nachrichten tragen Haken: einer = beim Server, zwei = auf den
 *   Geräten aller Empfänger, zwei farbige = von allen gelesen.
 * - Wer gerade tippt, erscheint als „… schreibt…“ über dem Eingabefeld.
 * - Ohne Netz geht eine Nachricht in die Warteschlange ([ChatOutboxService]),
 *   erscheint mit Uhr und wird automatisch gesendet, sobald das Netz zurück ist.
 *
 * Nur im Browser aktiv; im SSR-HTML erscheinen keine privaten Inhalte.
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
    ChatMediaGridComponent,
    EmojiPickerComponent,
    ReportDialogComponent,
  ],
  template: `
    <div class="chat-thread" [class.is-embedded]="embedded" [class.is-fill]="fill">
      @if (!embedded) {
        <header class="chat-thread-head">
          <button type="button" class="chat-back" [attr.aria-label]="'chat.thread.back' | t" (click)="back.emit()">
            <vereint-icon name="arrow-left" />
          </button>
          @if (conversation.type === 'direct') {
            <vereint-avatar-badge [name]="headTitle()" />
          } @else {
            <span class="chat-thread-icon" [attr.data-type]="conversation.type" aria-hidden="true">
              <vereint-icon [name]="headIcon()" />
            </span>
          }
          <div class="chat-thread-title">
            <strong>{{ headTitle() }}</strong>
            @if (conversation.type === 'event' && conversation.eventId) {
              <a class="chat-thread-sub" [routerLink]="['/events', conversation.eventId]">{{
                conversation.stammtischName
                  ? ('chat.thread.toEventIn' | t: { group: conversation.stammtischName })
                  : ('chat.thread.toEvent' | t)
              }}</a>
            } @else if (conversation.type === 'moment') {
              <a class="chat-thread-sub" routerLink="/moments" [queryParams]="{ momentId: conversation.momentId }">{{
                conversation.expiresAt
                  ? ('chat.thread.momentUntil' | t: { time: untilLabel(conversation.expiresAt) })
                  : ('chat.thread.toMoment' | t)
              }}</a>
            } @else if (conversation.type === 'club') {
              <span class="chat-thread-sub">{{ 'chat.list.clubChat' | t }}</span>
            } @else {
              <span class="chat-thread-sub">{{ 'chat.kind.direct' | t }}</span>
            }
          </div>
        </header>
      }

      @if (conversation.pinned; as pinned) {
        <vereint-info-panel [title]="'chat.thread.pinnedTitle' | t: { name: pinned.authorName }">
          <span class="chat-pinned-text">{{ pinned.text }}</span>
        </vereint-info-panel>
      }

      <div class="chat-history" #history (scroll)="onHistoryScroll()">
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
        } @else if (messages()!.length === 0 && pending().length === 0) {
          <vereint-state
            kind="empty"
            [title]="'chat.thread.emptyTitle' | t"
            [message]="'chat.thread.emptyMessage' | t"
          />
        } @else {
          @for (message of messages(); track message.id; let i = $index) {
            @if (dayBreak(i); as day) {
              <p class="chat-day"><span>{{ day }}</span></p>
            }
            @if (message.kind) {
              <p class="chat-rsvp-note" [attr.data-kind]="message.kind" data-testid="chat-rsvp-note">
                <span>
                  <vereint-icon [name]="message.kind === 'rsvp_accepted' ? 'check' : 'close'" />
                  {{ noteText(message) }}
                  <time [attr.datetime]="message.createdAt">{{ formatTime(message.createdAt) }}</time>
                </span>
              </p>
            } @else {
            <article class="chat-message" [class.is-own]="isOwn(message)" [class.is-direct]="conversation.type === 'direct'">
              @if (!isOwn(message) && conversation.type !== 'direct') {
                <vereint-avatar-badge class="chat-message-avatar" [name]="message.senderName" />
              }
              <div class="chat-message-body">
                <div class="chat-bubble">
                  <span class="chat-message-head">
                    <span class="chat-message-author">{{
                      isOwn(message) ? ('chat.you' | t) : message.senderName
                    }}</span>
                    @if (message.senderType === 'guest') {
                      <span class="chat-message-guest">{{ 'chat.thread.guest' | t }}</span>
                    }
                  </span>
                  @if (message.media?.length) {
                    <app-chat-media-grid [tiles]="tilesOf(message)" (loaded)="onMediaLoaded()" />
                  }
                  @if (message.message) {
                    <span class="chat-bubble-text">{{ message.message }}</span>
                  }
                  @if (message.imageUrl) {
                    <img class="chat-image" [src]="message.imageUrl" [alt]="'chat.thread.image' | t" loading="lazy" />
                  }
                  <span class="chat-message-meta">
                    <time class="chat-message-time" [attr.datetime]="message.createdAt" [attr.title]="formatDateTime(message.createdAt)">{{
                      formatTime(message.createdAt)
                    }}</time>
                    @if (isOwn(message) && message.receipt; as receipt) {
                      <span
                        class="chat-receipt"
                        [class.is-read]="receipt.status === 'read'"
                        [attr.data-status]="receipt.status"
                        role="img"
                        [attr.aria-label]="receiptLabel(receipt)"
                        [attr.title]="receiptLabel(receipt)"
                      >
                        <vereint-icon [name]="receipt.status === 'sent' ? 'check' : 'checkDouble'" />
                      </span>
                    }
                  </span>
                </div>
                @if (message.senderRsvp; as rsvp) {
                  <span class="chat-rsvp-badge" [attr.data-rsvp]="rsvp" data-testid="chat-rsvp-badge">
                    <vereint-icon [name]="rsvp === 'accepted' ? 'check' : 'close'" />
                    {{ (rsvp === 'accepted' ? 'chat.rsvp.badgeAccepted' : 'chat.rsvp.badgeDeclined') | t }}
                  </span>
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
                    <button
                      type="button"
                      class="chat-picker-emoji chat-picker-more"
                      [attr.aria-label]="'emoji.more' | t"
                      [attr.aria-expanded]="fullPicker()"
                      (click)="fullPicker.set(!fullPicker())"
                    >
                      …
                    </button>
                    @if (canReport(message)) {
                      <button type="button" class="chat-picker-report" (click)="openReport(message)">
                        {{ 'moderation.action.reportOrBlock' | t }}
                      </button>
                    }
                  </div>
                  @if (fullPicker()) {
                    <vereint-emoji-picker class="chat-emoji-popup" (pick)="toggleReaction(message, $event)" />
                  }
                }
              </div>
            </article>
            }
          }
          @for (entry of pending(); track entry.clientId) {
            <article class="chat-message is-own is-pending" [class.is-failed]="entry.state === 'failed'">
              <div class="chat-message-body">
                <div class="chat-bubble">
                  <span class="chat-message-head">
                    <span class="chat-message-author">{{ 'chat.you' | t }}</span>
                  </span>
                  @if (entry.mediaIds?.length) {
                    <span class="chat-bubble-text chat-pending-media">📎 {{ 'chat.media.pendingCount' | t: { count: entry.mediaIds!.length } }}</span>
                  }
                  @if (entry.message) {
                    <span class="chat-bubble-text">{{ entry.message }}</span>
                  }
                  <span class="chat-message-meta">
                    <time class="chat-message-time" [attr.datetime]="entry.createdAt" [attr.title]="formatDateTime(entry.createdAt)">{{
                      formatTime(entry.createdAt)
                    }}</time>
                    @if (entry.state === 'pending') {
                      <span class="chat-receipt" data-status="pending" role="img" [attr.aria-label]="'chat.receipt.pending' | t" [attr.title]="'chat.receipt.pending' | t">
                        <vereint-icon name="clock" />
                      </span>
                    }
                  </span>
                </div>
                @if (entry.state === 'failed') {
                  <div class="chat-failed" role="alert">
                    <span>{{ 'chat.outbox.failed' | t }}</span>
                    <button type="button" class="chat-failed-action" (click)="retrySend(entry)">{{ 'chat.outbox.retry' | t }}</button>
                    <button type="button" class="chat-failed-action" (click)="discardSend(entry)">{{ 'chat.outbox.discard' | t }}</button>
                  </div>
                } @else {
                  <p class="chat-pending-hint">{{ 'chat.outbox.waiting' | t }}</p>
                }
              </div>
            </article>
          }
        }
      </div>

      <p class="chat-typing" aria-live="polite">{{ typingText() }}</p>

      @if (actionError()) {
        <p class="manage-action-error" role="alert">{{ actionError() }}</p>
      }
      @if (actionNotice()) {
        <p class="chat-action-notice" role="status">{{ actionNotice() }}</p>
      }

      <app-report-dialog
        [open]="!!reportTarget()"
        [personName]="reportTarget()?.senderName ?? null"
        [handledBy]="conversation.type === 'direct' ? 'platform' : 'group'"
        [busy]="reportBusy()"
        [error]="reportError()"
        (closed)="closeReport()"
        (submitted)="submitReport($event)"
      />

      @if (conversation.canWrite) {
        @if (composerPicker()) {
          <vereint-emoji-picker class="chat-emoji-popup" (pick)="insertEmoji($event)" />
        }
        @if (drafts().length > 0) {
          <app-chat-media-grid class="chat-drafts" [draft]="true" [tiles]="draftTiles()" (remove)="removeDraft($event)" />
        }
        <form class="chat-composer" (ngSubmit)="send()">
          <input
            #fileInput
            type="file"
            class="chat-file-input"
            multiple
            [accept]="mediaAccept"
            (change)="onFiles($event)"
          />
          <button
            type="button"
            class="chat-icon-button chat-attach"
            [attr.aria-label]="'chat.composer.attachMedia' | t"
            [attr.title]="'chat.composer.attachMedia' | t"
            [disabled]="drafts().length >= maxMedia"
            (click)="fileInput.click()"
          >
            <vereint-icon name="attach" />
          </button>
          <label class="chat-input-label" for="chat-draft">{{ 'chat.composer.placeholder' | t }}</label>
          <input
            id="chat-draft"
            name="draft"
            class="chat-input"
            autocomplete="off"
            maxlength="2000"
            [placeholder]="'chat.composer.placeholder' | t"
            #draftInput
            [(ngModel)]="draft"
            (ngModelChange)="onDraftChange()"
          />
          <button
            type="button"
            class="chat-icon-button chat-emoji-toggle"
            [attr.aria-label]="'emoji.open' | t"
            [attr.aria-expanded]="composerPicker()"
            (click)="composerPicker.set(!composerPicker())"
          >
            😊
          </button>
          <button
            type="submit"
            class="chat-send"
            [attr.aria-label]="'chat.composer.send' | t"
            [disabled]="!canSend()"
          >
            <vereint-icon name="send" />
          </button>
        </form>
      } @else {
        <p class="chat-readonly" role="status">
          {{ (conversation.type === 'direct' ? 'chat.composer.readOnlyDirect' : 'chat.composer.readOnly') | t }}
        </p>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        min-height: 0;
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
        padding-bottom: var(--space-2);
        border-bottom: 1px solid var(--color-border);
      }
      .chat-thread-icon {
        flex: none;
        display: grid;
        place-items: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 50%;
        background-color: var(--color-brand);
        color: var(--color-on-brand);
        font-size: 1.15rem;
      }
      .chat-thread-icon[data-type='moment'] {
        background-color: var(--color-warning-light);
        color: var(--color-warning);
      }
      .chat-thread-icon[data-type='event'] {
        background-color: var(--color-brand-soft);
        color: var(--color-brand);
      }
      .chat-thread.is-fill {
        height: 100%;
      }
      .chat-thread.is-fill {
        min-height: 0;
      }
      .chat-thread.is-fill .chat-history {
        flex: 1;
        min-height: 0;
        max-height: none;
      }
      .chat-thread-title {
        display: flex;
        flex-direction: column;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .chat-thread-sub {
        color: var(--color-text-muted);
        font-size: 0.8rem;
      }
      a.chat-thread-sub {
        color: var(--color-brand);
      }
      .chat-back {
        flex: none;
        display: grid;
        place-items: center;
        width: 2.5rem;
        height: 2.5rem;
        border: none;
        border-radius: 50%;
        background: none;
        color: var(--color-text);
        font-size: 1.2rem;
        cursor: pointer;
      }
      .chat-back:hover {
        background-color: var(--color-surface-subtle);
      }
      .chat-pinned-text {
        white-space: pre-line;
      }
      .chat-history {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: var(--space-2);
        max-height: min(65vh, 40rem);
        overflow-y: auto;
        overscroll-behavior: contain;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-subtle);
      }
      /* Datumstrenner zwischen den Tagen, wie bei bekannten Messengern. */
      .chat-day {
        display: flex;
        justify-content: center;
        margin: var(--space-2) 0 0.25rem;
      }
      .chat-day span {
        padding: 0.15rem 0.65rem;
        border-radius: var(--radius-sm);
        background-color: var(--color-surface);
        color: var(--color-text-muted);
        font-size: 0.75rem;
        font-weight: 600;
        box-shadow: 0 1px 1px rgba(15, 23, 42, 0.08);
      }
      /* Zu- und Absagen: Hinweiszeile in der Mitte, grün bzw. rot. */
      .chat-rsvp-note {
        display: flex;
        justify-content: center;
        margin: 0.35rem 0;
      }
      .chat-rsvp-note > span {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        max-width: 90%;
        padding: 0.3rem 0.75rem;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 600;
        text-align: center;
      }
      .chat-rsvp-note[data-kind='rsvp_accepted'] > span {
        background-color: color-mix(in srgb, var(--color-success) 16%, var(--color-surface));
        color: var(--color-success);
      }
      .chat-rsvp-note[data-kind='rsvp_declined'] > span {
        background-color: color-mix(in srgb, var(--color-danger) 14%, var(--color-surface));
        color: var(--color-danger);
      }
      .chat-rsvp-note time {
        font-weight: 400;
        opacity: 0.7;
      }
      /* Antwort unter einer Nachricht, wie die Haken klein und dezent. */
      .chat-rsvp-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        margin-top: 0.15rem;
        font-size: 0.7rem;
        font-weight: 600;
        line-height: 1;
      }
      .chat-message.is-own .chat-rsvp-badge {
        align-self: flex-end;
      }
      .chat-rsvp-badge[data-rsvp='accepted'] {
        color: var(--color-success);
      }
      .chat-rsvp-badge[data-rsvp='declined'] {
        color: var(--color-danger);
      }
      .chat-message {
        display: flex;
        gap: 0.4rem;
        align-items: flex-start;
        max-width: min(85%, 36rem);
      }
      .chat-message.is-own {
        align-self: flex-end;
        flex-direction: row-reverse;
      }
      .chat-message-avatar {
        flex: none;
      }
      .chat-message-body {
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .chat-message.is-own .chat-message-body {
        align-items: flex-end;
      }
      /* Sprechblase: Name oben (nur fremde Nachrichten in Gruppen), Zeit und Haken unten rechts. */
      .chat-bubble {
        position: relative;
        display: flex;
        flex-direction: column;
        min-width: 4.5rem;
        padding: 0.35rem 0.6rem 0.3rem;
        border-radius: var(--radius-md);
        border-top-left-radius: 0.2rem;
        background-color: var(--color-surface);
        box-shadow: 0 1px 1px rgba(15, 23, 42, 0.1);
        overflow-wrap: anywhere;
      }
      .chat-message.is-own .chat-bubble {
        border-top-left-radius: var(--radius-md);
        border-top-right-radius: 0.2rem;
        background-color: var(--color-brand-soft);
      }
      .chat-message-head {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .chat-message-author {
        color: var(--color-brand);
        font-size: 0.8rem;
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      /* Eigene Nachrichten und Direktnachrichten brauchen keinen Namen; Screenreader hören ihn weiter. */
      .chat-message.is-own .chat-message-author,
      .chat-message.is-direct .chat-message-author {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      .chat-message-guest {
        color: var(--color-text-muted);
        font-size: 0.7rem;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0 0.4rem;
      }
      .chat-bubble-text {
        white-space: pre-line;
      }
      .chat-message-meta {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        align-self: flex-end;
        margin-top: 0.1rem;
        line-height: 1;
      }
      .chat-message-time {
        color: var(--color-text-muted);
        font-size: 0.7rem;
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
        margin-top: 0.25rem;
      }
      .chat-reaction,
      .chat-picker-emoji {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        min-height: 1.75rem;
        padding: 0.1rem 0.5rem;
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
      .chat-picker-report {
        border: 0;
        background: none;
        color: var(--color-text-muted);
        font: inherit;
        font-size: 0.85rem;
        text-decoration: underline;
        cursor: pointer;
        padding: 0 var(--space-1);
      }
      .chat-action-notice {
        margin: 0;
        font-size: 0.85rem;
        color: var(--color-text-muted);
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
      .chat-receipt {
        display: inline-flex;
        align-items: center;
        color: var(--color-text-muted);
        font-size: 0.95rem;
      }
      .chat-receipt.is-read {
        color: var(--color-info, #2f8fdc);
      }
      .chat-message.is-pending .chat-bubble {
        opacity: 0.75;
      }
      .chat-message.is-failed .chat-bubble {
        box-shadow: 0 0 0 1px var(--color-danger, #c0392b);
      }
      .chat-pending-hint {
        margin: 0.25rem 0 0;
        color: var(--color-text-muted);
        font-size: 0.8rem;
      }
      .chat-failed {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-2);
        margin-top: 0.3rem;
        color: var(--color-danger, #c0392b);
        font-size: 0.85rem;
      }
      .chat-failed-action {
        border: none;
        background: none;
        color: var(--color-brand);
        font: inherit;
        cursor: pointer;
        padding: 0.4rem 0.2rem;
        min-height: 2.25rem;
      }
      .chat-typing {
        margin: 0;
        min-height: 1.2rem;
        color: var(--color-text-muted);
        font-size: 0.85rem;
        font-style: italic;
      }
      .chat-readonly {
        margin: 0;
        padding-top: var(--space-2);
        border-top: 1px solid var(--color-border);
        color: var(--color-text-muted);
      }
      .chat-file-input {
        display: none;
      }
      .chat-emoji-popup {
        margin-top: 0.25rem;
      }
      .chat-drafts {
        padding-top: var(--space-2);
      }
      .chat-thread.is-embedded .chat-history {
        max-height: min(55vh, 32rem);
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
  private readonly live = inject(LiveUpdatesService);
  private readonly outbox = inject(ChatOutboxService);
  private liveSub?: Subscription;
  private outboxSub?: Subscription;

  /** Die geöffnete Konversation. */
  @Input({ required: true }) conversation!: ConversationSummary;
  /** Eigene Benutzer-ID, um eigene Nachrichten zu erkennen. */
  @Input() myId: string | null = null;
  /** In eine andere Seite eingebettet (Event-Seite): ohne Kopfzeile. */
  @Input() embedded = false;
  /** Füllt die verfügbare Höhe (Chat-Seite, mobil im Vollbild). */
  @Input() fill = false;

  /** Lesestand wurde gesetzt; liefert die aktualisierte Zusammenfassung. */
  @Output() readonly read = new EventEmitter<ConversationSummary>();
  /** Neue eigene Nachricht wurde gesendet. */
  @Output() readonly sent = new EventEmitter<ChatMessageDto>();
  /** Mobil: zurück zur Liste. */
  @Output() readonly back = new EventEmitter<void>();

  @ViewChild('history') private historyRef?: ElementRef<HTMLElement>;
  @ViewChild('draftInput') private draftInputRef?: ElementRef<HTMLInputElement>;
  private readonly uploader = inject(ChatMediaUploader);
  private readonly i18n = inject(I18nService);

  /** Anhänge im Composer (hochgeladen oder im Upload). */
  protected readonly drafts = signal<DraftMedia[]>([]);
  protected readonly draftTiles = computed<ChatMediaTile[]>(() =>
    this.drafts().map((entry) => ({
      key: entry.key,
      kind: entry.prepared.kind,
      src: entry.prepared.previewUrl,
      progress: entry.uploaded ? null : entry.progress,
      failed: entry.failed,
      removable: true,
    })),
  );
  /** Volle Emoji-Auswahl im Composer bzw. bei der Reaktion. */
  protected readonly composerPicker = signal(false);
  protected readonly fullPicker = signal(false);
  protected readonly mediaAccept = CHAT_MEDIA_ACCEPT;
  protected readonly maxMedia = CHAT_MEDIA_LIMITS.maxMediaPerResponse;
  /** Der Entwurf als Signal, damit [canSend] mitzieht. */
  private readonly draftText = signal('');
  protected readonly canSend = computed(() => {
    const drafts = this.drafts();
    if (drafts.some((entry) => !entry.uploaded)) return false;
    return this.draftText().trim().length > 0 || drafts.length > 0;
  });

  protected readonly messages = signal<ChatMessageDto[] | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly reacting = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly pickerFor = signal<string | null>(null);
  private readonly moderation = inject(ModerationApiService);
  /** Nachricht, die gerade gemeldet oder deren Absender blockiert wird (#153). */
  protected readonly reportTarget = signal<ChatMessageDto | null>(null);
  protected readonly reportBusy = signal(false);
  protected readonly reportError = signal<string | null>(null);
  protected readonly actionNotice = signal<string | null>(null);

  /** Id der offenen Konversation als Signal, für die wartenden Nachrichten. */
  private readonly conversationId = signal<string | null>(null);

  /** Wartende und abgelehnte eigene Nachrichten, die der Verlauf noch nicht kennt. */
  protected readonly pending = computed<OutboxEntry[]>(() => {
    const id = this.conversationId();
    if (!id) return [];
    const known = new Set((this.messages() ?? []).map((message) => message.clientId).filter(Boolean));
    return this.outbox.entries().filter((entry) => entry.conversationId === id && !known.has(entry.clientId));
  });

  /** Wer gerade tippt: Id → Name und bis wann es angezeigt wird. */
  private readonly typers = signal<ReadonlyMap<string, { name: string; until: number }>>(new Map());
  protected readonly typingText = computed(() => {
    const names = [...this.typers().values()].map((typer) => typer.name);
    if (names.length === 0) return '';
    if (names.length === 1) return translate('chat.typing.one', { name: names[0] });
    if (names.length === 2) return translate('chat.typing.two', { first: names[0], second: names[1] });
    return translate('chat.typing.many');
  });
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTypingSent = 0;
  private readPending = false;

  protected draft = '';
  protected readonly quickReactions = QUICK_REACTIONS;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatTime = formatTime;

  /** Ende eines Moment-Chats: heute nur die Uhrzeit, sonst mit Datum. */
  protected untilLabel(iso: string): string {
    return dayKey(iso) === dayKey(new Date().toISOString()) ? formatTime(iso) : formatShortDateTime(iso);
  }

  private loadSub?: Subscription;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly onVisibility = () => {
    if (!this.isVisible()) return;
    // Was im Hintergrund ankam, gilt erst jetzt als gelesen.
    if (this.readPending) this.markRead();
    this.refresh();
  };

  /**
   * Datumstrenner vor der Nachricht an Position [index]: „Heute“, „Gestern“
   * oder das Datum, sobald ein neuer Tag beginnt; sonst leer.
   */
  protected dayBreak(index: number): string {
    const list = this.messages() ?? [];
    const current = list[index];
    if (!current) return '';
    const previous = list[index - 1];
    if (previous && dayKey(previous.createdAt) === dayKey(current.createdAt)) return '';
    return formatDayTime(current.createdAt).split(',')[0];
  }

  /** Titel im Kopf: Gruppenchat heißt wie seine Gruppe, Direktnachrichten wie das Gegenüber. */
  protected headTitle(): string {
    const conversation = this.conversation;
    if (conversation.type === 'direct') return conversation.partnerName ?? conversation.title;
    if (conversation.type === 'club' && conversation.stammtischName) return conversation.stammtischName;
    return conversation.title;
  }

  protected headIcon(): IconName {
    if (this.conversation.type === 'event') return 'events';
    if (this.conversation.type === 'moment') return 'sparkle';
    return 'users';
  }

  /** Fotos/Videos einer Nachricht; Gruppenchats anderer Gruppen nennen ihre Gruppe in der Adresse. */
  protected tilesOf(message: ChatMessageDto): ChatMediaTile[] {
    return (message.media ?? []).map((media) => ({
      key: media.id,
      kind: media.kind,
      src: this.api.mediaUrl(media, this.conversation.type, this.conversation.stammtischId),
      ratio: media.width && media.height ? media.width / media.height : null,
    }));
  }

  private get browser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    if (!this.browser) return;
    void this.outbox.start();
    // Neue Nachrichten, Reaktionen und Haken dieses Chats kommen sofort an.
    this.liveSub = this.live.on('chat', 'direct', 'receipt', 'typing').subscribe((event) => {
      if (event.type === 'typing') {
        if (event.conversationId === this.conversation?.id) this.showTyping(event.userId, event.name);
        return;
      }
      if (event.type === 'resync' || event.conversationId === this.conversation?.id) this.refresh();
    });
    // Aus der Warteschlange angekommen: wartende Blase durch die echte ersetzen.
    this.outboxSub = this.outbox.delivered$.subscribe(({ entry, message }) => {
      if (entry.conversationId !== this.conversation?.id) return;
      this.messages.update((list) =>
        list?.some((existing) => existing.id === message.id) ? list : [...(list ?? []), message],
      );
      this.sent.emit(message);
      this.scrollToEnd();
    });
    // Rückfall, solange keine Live-Verbindung steht.
    this.pollTimer = setInterval(() => {
      if (!this.live.connected() && this.isVisible()) this.refresh();
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
    this.typers.set(new Map());
    this.readPending = false;
    this.draft = '';
    this.draftText.set('');
    this.clearDrafts();
    this.composerPicker.set(false);
    this.fullPicker.set(false);
    this.conversationId.set(this.conversation.id);
    this.refresh();
  }

  ngOnDestroy(): void {
    this.clearDrafts();
    this.loadSub?.unsubscribe();
    this.liveSub?.unsubscribe();
    this.outboxSub?.unsubscribe();
    if (this.typingTimer !== null) clearTimeout(this.typingTimer);
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
    this.loadSub = this.api.messages(id, this.conversation.type, this.conversation.stammtischId).subscribe({
      next: (messages) => {
        if (id !== this.conversation.id) return;
        const isFirst = before === null;
        const hasNew = isFirst || lastId(messages) !== lastId(before);
        this.messages.set(messages);
        this.loadError.set(null);
        if (hasNew) {
          this.scrollToEnd();
          this.clearTypersWhoSent(before, messages);
          if (isFirst || this.hasForeignAfter(before, messages)) this.markReadWhenVisible();
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

  /**
   * Gibt die Composer-Nachricht in die Warteschlange und leert das Feld. Die
   * Warteschlange sendet sofort; ohne Netz wartet die Nachricht sichtbar mit
   * Uhr und geht hinaus, sobald das Netz zurück ist.
   */
  protected send(): void {
    const text = this.draft.trim();
    const id = this.conversation?.id;
    if (!id || !this.conversation.canWrite) return;
    const drafts = this.drafts();
    if (drafts.some((entry) => !entry.uploaded)) {
      this.actionError.set(translate('chat.composer.waitForUpload'));
      return;
    }
    const mediaIds = drafts.map((entry) => entry.uploaded!.id);
    if (!text && mediaIds.length === 0) return;
    this.draft = '';
    this.draftText.set('');
    this.clearDrafts();
    this.composerPicker.set(false);
    this.lastTypingSent = 0;
    this.actionError.set(null);
    void this.outbox.enqueue(id, this.conversation.type, text, this.conversation.stammtischId, mediaIds);
    this.scrollToEnd();
  }

  /** Gewählte Dateien prüfen, verkleinern und sofort hochladen. */
  protected async onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    this.actionError.set(null);
    if (globalThis.navigator?.onLine === false) {
      this.actionError.set(translate('chat.composer.mediaOffline'));
      return;
    }
    const free = this.maxMedia - this.drafts().length;
    if (files.length > free) this.actionError.set(translate('chat.composer.mediaLimit', { max: this.maxMedia }));
    for (const file of files.slice(0, Math.max(0, free))) {
      try {
        const prepared = await this.uploader.prepare(file);
        this.startUpload(prepared);
      } catch (error) {
        this.actionError.set(error instanceof MediaPrepareError ? error.message : translate('chat.composer.uploadFailed'));
      }
    }
  }

  private startUpload(prepared: PreparedMedia): void {
    const key = `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const conversationId = this.conversation.id;
    const target = this.api.mediaUpload(conversationId, this.conversation.type, this.conversation.stammtischId);
    const upload = this.uploader.upload(target, prepared, this.i18n.language(), (progress) =>
      this.patchDraft(key, { progress }),
    );
    this.drafts.update((list) => [
      ...list,
      { key, prepared, progress: 0, uploaded: null, failed: false, abort: upload.abort },
    ]);
    upload.result.then(
      (media) => this.patchDraft(key, { uploaded: media, progress: 1 }),
      (error: unknown) => {
        if (!this.drafts().some((entry) => entry.key === key)) return;
        this.patchDraft(key, { failed: true });
        this.actionError.set(describeApiError(error));
      },
    );
  }

  private patchDraft(key: string, patch: Partial<DraftMedia>): void {
    this.drafts.update((list) => list.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)));
  }

  protected removeDraft(key: string): void {
    const entry = this.drafts().find((current) => current.key === key);
    if (!entry) return;
    if (!entry.uploaded) entry.abort();
    URL.revokeObjectURL(entry.prepared.previewUrl);
    this.drafts.update((list) => list.filter((current) => current.key !== key));
  }

  /** Nicht gesendete Uploads räumt der Server nach einigen Stunden selbst weg. */
  private clearDrafts(): void {
    for (const entry of this.drafts()) {
      if (!entry.uploaded) entry.abort();
      URL.revokeObjectURL(entry.prepared.previewUrl);
    }
    this.drafts.set([]);
  }

  /** Fügt ein Emoji an der Schreibmarke ein. */
  protected insertEmoji(emoji: string): void {
    const input = this.draftInputRef?.nativeElement;
    const start = input?.selectionStart ?? this.draft.length;
    const end = input?.selectionEnd ?? this.draft.length;
    this.draft = `${this.draft.slice(0, start)}${emoji}${this.draft.slice(end)}`;
    this.draftText.set(this.draft);
    setTimeout(() => {
      if (!input) return;
      input.focus();
      const position = start + emoji.length;
      input.setSelectionRange(position, position);
    });
  }

  protected retrySend(entry: OutboxEntry): void {
    this.outbox.retry(entry.clientId);
  }

  protected discardSend(entry: OutboxEntry): void {
    this.outbox.discard(entry.clientId);
  }

  /** Beim Tippen höchstens alle paar Sekunden „schreibt gerade…“ melden. */
  protected onDraftChange(): void {
    this.draftText.set(this.draft);
    const id = this.conversation?.id;
    if (!id || !this.conversation.canWrite || this.draft.trim().length === 0) return;
    if (globalThis.navigator?.onLine === false) return;
    const now = Date.now();
    if (now - this.lastTypingSent < TYPING_SEND_INTERVAL_MS) return;
    this.lastTypingSent = now;
    // Nicht kritisch: ohne Signal sieht das Gegenüber einfach nichts.
    this.api.typing(id, this.conversation.type, this.conversation.stammtischId).subscribe({ error: () => undefined });
  }

  /** Zugänglicher Text zu den Haken einer eigenen Nachricht. */
  /** „Anna hat zugesagt“ bzw. „Du hast abgesagt“, bei Serien mit Termin. */
  protected noteText(message: ChatMessageDto): string {
    const accepted = message.kind === 'rsvp_accepted';
    const own = this.isOwn(message);
    const key = `chat.rsvp.${own ? 'own' : 'other'}${accepted ? 'Accepted' : 'Declined'}${message.rsvpEventStartsAt ? 'For' : ''}`;
    return translate(key, {
      name: message.senderName,
      date: message.rsvpEventStartsAt ? formatShortDateTime(message.rsvpEventStartsAt) : '',
    });
  }

  protected receiptLabel(receipt: MessageReceipt): string {
    const group = this.conversation.type !== 'direct' && receipt.recipients > 1;
    if (!group) return translate(`chat.receipt.${receipt.status}`);
    if (receipt.status === 'read') return translate('chat.receipt.readAll');
    return translate('chat.receipt.groupProgress', {
      read: receipt.read,
      delivered: receipt.delivered,
      total: receipt.recipients,
    });
  }

  /** Fremde Nachrichten von Personen lassen sich melden (nicht System- oder Gastnachrichten). */
  protected canReport(message: ChatMessageDto): boolean {
    return message.senderType === 'member' && !!message.senderId && !this.isOwn(message);
  }

  protected openReport(message: ChatMessageDto): void {
    this.pickerFor.set(null);
    this.fullPicker.set(false);
    this.reportError.set(null);
    this.reportTarget.set(message);
  }

  protected closeReport(): void {
    if (this.reportBusy()) return;
    this.reportTarget.set(null);
  }

  /** Schickt Meldung und/oder Blockierung ab; blendet Blockierte sofort aus. */
  protected async submitReport(result: ReportDialogResult): Promise<void> {
    const message = this.reportTarget();
    if (!message || this.reportBusy()) return;
    this.reportBusy.set(true);
    this.reportError.set(null);
    try {
      if (result.report) {
        await firstValueFrom(
          this.api.reportMessage(
            this.conversation.id,
            message.id,
            result.report,
            this.conversation.type,
            this.conversation.stammtischId,
          ),
        );
      }
      if (result.block && message.senderId) {
        await firstValueFrom(this.moderation.block(message.senderId));
        const blocked = message.senderId;
        this.messages.update((list) => (list ?? []).filter((entry) => entry.senderId !== blocked));
      }
      this.reportBusy.set(false);
      this.reportTarget.set(null);
      this.actionNotice.set(
        translate(
          result.report && result.block
            ? 'moderation.notice.reportedAndBlocked'
            : result.report
              ? 'moderation.notice.reported'
              : 'moderation.notice.blocked',
          { name: message.senderName },
        ),
      );
    } catch (error: unknown) {
      this.reportBusy.set(false);
      this.reportError.set(describeApiError(error));
    }
  }

  protected togglePicker(messageId: string): void {
    this.fullPicker.set(false);
    this.pickerFor.update((current) => (current === messageId ? null : messageId));
  }

  /** Schaltet die eigene Reaktion um und übernimmt den Serverstand. */
  protected toggleReaction(message: ChatMessageDto, emoji: string): void {
    const id = this.conversation.id;
    if (this.reacting()) return;
    this.reacting.set(true);
    this.actionError.set(null);
    this.api.toggleReaction(id, message.id, emoji, this.conversation.type, this.conversation.stammtischId).subscribe({
      next: (updated) => {
        this.reacting.set(false);
        this.pickerFor.set(null);
        this.fullPicker.set(false);
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

  /** Gelesen gilt erst, wenn der Chat auch zu sehen ist. */
  private markReadWhenVisible(): void {
    if (this.isVisible()) this.markRead();
    else this.readPending = true;
  }

  private markRead(): void {
    this.readPending = false;
    const id = this.conversation.id;
    this.api.markRead(id, this.conversation.type, this.conversation.stammtischId).subscribe({
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

  private showTyping(userId: string | null | undefined, name: string | null | undefined): void {
    if (!userId || !name || userId === this.myId) return;
    const until = Date.now() + TYPING_DISPLAY_MS;
    this.typers.update((current) => new Map(current).set(userId, { name, until }));
    this.scheduleTypingCleanup();
  }

  /** Wer eine Nachricht geschickt hat, tippt nicht mehr. */
  private clearTypersWhoSent(before: ChatMessageDto[] | null, after: ChatMessageDto[]): void {
    if (this.typers().size === 0) return;
    const known = new Set((before ?? []).map((message) => message.id));
    const senders = new Set(after.filter((message) => !known.has(message.id)).map((message) => message.senderId));
    if (senders.size === 0) return;
    this.typers.update((current) => new Map([...current].filter(([userId]) => !senders.has(userId))));
  }

  private scheduleTypingCleanup(): void {
    if (this.typingTimer !== null) clearTimeout(this.typingTimer);
    const next = Math.min(...[...this.typers().values()].map((typer) => typer.until));
    if (!Number.isFinite(next)) return;
    this.typingTimer = setTimeout(() => {
      this.typingTimer = null;
      const now = Date.now();
      this.typers.update((current) => new Map([...current].filter(([, typer]) => typer.until > now)));
      this.scheduleTypingCleanup();
    }, Math.max(0, next - Date.now()));
  }

  private isVisible(): boolean {
    return this.document.visibilityState !== 'hidden';
  }

  /** Steht der Verlauf unten? Dann bleibt er dort, auch wenn Fotos nachladen. */
  private atBottom = true;

  protected onHistoryScroll(): void {
    const element = this.historyRef?.nativeElement;
    if (!element) return;
    this.atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  }

  protected onMediaLoaded(): void {
    const element = this.historyRef?.nativeElement;
    if (element && this.atBottom) element.scrollTop = element.scrollHeight;
  }

  private scrollToEnd(): void {
    if (!this.browser) return;
    setTimeout(() => {
      const element = this.historyRef?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
      this.atBottom = true;
    });
  }
}

function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function lastId(messages: ChatMessageDto[] | null): string | null {
  return messages && messages.length > 0 ? messages[messages.length - 1].id : null;
}
