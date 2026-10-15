import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, of, catchError, type Subscription } from 'rxjs';
import { describeApiError } from '../api/api-client.service';
import { AsyncState } from './async-state';
import { MemberApiService, rsvpLabelKey, rsvpTone, type RsvpAnswer } from './member-api.service';
import { eventStatusLabel, formatDateTime } from './member-format';
import type {
  ChatMessageDto,
  EventDetail,
  EventParticipant,
  EventStatus,
  MemberProfile,
  MomentSessionDto,
  MomentSummaryDto,
} from '../api/api.types';
import { AvatarBadgeComponent, StatusBadgeComponent, type StatusTone } from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

interface EventDetailView {
  event: EventDetail;
  participants: EventParticipant[];
  moments: MomentSessionDto[];
  history: MomentSummaryDto[];
  profile: MemberProfile | null;
}

/** Abstand der Chat-Aktualisierung, solange die Seite offen ist. */
export const EVENT_CHAT_POLL_MS = 10_000;

/** In diesen Status ist der Event-Chat nur noch lesbar. */
const READ_ONLY_CHAT_STATUS: readonly EventStatus[] = ['cancelled', 'archived'];

/**
 * Eventdetails für ein Mitglied (TICKET-024, Redesign TICKET-034).
 *
 * Lädt Stammdaten und Teilnehmerliste eines Events. Die Sichtbarkeit prüft der
 * Fachservice; fehlt der Zugriff, meldet dieser `403` und die Ansicht zeigt eine
 * neutrale Fehlermeldung (`deny by default`). Kopf mit „Route öffnen“ nutzt die
 * Karten-App ausschließlich clientseitig. Eingeladene antworten über
 * `PUT /events/{id}/rsvp`; die Teilnehmerliste zeigt jede Antwort. Der
 * Event-Chat läuft über die Konversations-Endpunkte und wird alle zehn
 * Sekunden aktualisiert, solange die Seite offen ist.
 */
@Component({
  selector: 'app-member-event-detail',
  imports: [StateComponent, IconComponent, FormsModule, RouterLink, AvatarBadgeComponent, StatusBadgeComponent, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="event-title">
        <span class="eyebrow">{{ 'member.eventDetail.eyebrow' | t }}</span>

        <a class="member-back" routerLink="/events">{{ 'member.eventDetail.back' | t }}</a>

        @if (load.isLoading()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'member.eventDetail.loadingMessage' | t"
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            [title]="'member.eventDetail.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (load.data(); as view) {
          <article class="detail-head">
            <div class="detail-head-top">
              <h1 id="event-title">{{ view.event.title }}</h1>
              <vereint-status-badge
                [label]="eventStatusLabel(view.event.status)"
                [tone]="'success'"
              />
            </div>
            <ul class="detail-meta">
              <li><vereint-icon name="events" /> {{ formatDateTime(view.event.startsAt) }}</li>
              @if (view.event.endsAt) {
                <li><vereint-icon name="clock" /> {{ 'member.eventDetail.until' | t: { date: formatDateTime(view.event.endsAt) } }}</li>
              }
              @if (view.event.location) {
                <li><vereint-icon name="location" /> {{ view.event.location }}</li>
              }
              <li><vereint-icon name="user" /> {{ view.event.ownerDisplayName }}</li>
            </ul>
            <div class="detail-actions">
              @if (view.event.location) {
                <button type="button" class="member-button route-button" (click)="openRoute(view.event.location)">
                  {{ 'member.eventDetail.openRoute' | t }}
                </button>
              }
              @if (view.event.canManage) {
                <a class="member-button manage-link" [routerLink]="['/events', view.event.id, 'manage']">
                  <vereint-icon name="edit" /> {{ 'member.eventDetail.manage' | t }}
                </a>
              }
            </div>
          </article>

          @if (view.event.description) {
            <p class="member-description">{{ view.event.description }}</p>
          }

          @if (view.event.myRsvp) {
            <h2 class="member-subtitle">{{ 'member.eventDetail.rsvpHeading' | t }}</h2>
            <p class="rsvp-state" role="status">{{ myRsvpText(view.event.myRsvp) }}</p>
            <div class="rsvp-row" role="group" [attr.aria-label]="'member.eventDetail.rsvpHeading' | t">
              @for (option of rsvpOptions; track option.value) {
                <button
                  type="button"
                  class="rsvp-button"
                  [attr.data-answer]="option.value"
                  [class.is-active]="view.event.myRsvp === option.value"
                  [attr.aria-pressed]="view.event.myRsvp === option.value"
                  [disabled]="rsvpBusy() || !canAnswer(view.event.status)"
                  (click)="setRsvp(option.value)"
                >
                  {{ option.labelKey | t }}
                </button>
              }
            </div>
            @if (rsvpError(); as error) {
              <p class="member-hint rsvp-error" role="alert">{{ error }}</p>
            }
          }

          <h2 class="member-subtitle">{{ 'member.eventDetail.attendance' | t: { count: view.participants.length } }}</h2>
          @if (view.event.rsvpCounts; as counts) {
            <ul class="rsvp-counts" [attr.aria-label]="'member.eventDetail.countsLabel' | t">
              <li class="count-accepted">{{ 'member.eventDetail.counts.accepted' | t: { count: counts.accepted } }}</li>
              <li class="count-maybe">{{ 'member.eventDetail.counts.maybe' | t: { count: counts.maybe } }}</li>
              <li class="count-declined">{{ 'member.eventDetail.counts.declined' | t: { count: counts.declined } }}</li>
              <li class="count-invited">{{ 'member.eventDetail.counts.invited' | t: { count: counts.invited } }}</li>
            </ul>
          }
          @if (view.participants.length === 0) {
            <p class="member-muted">{{ 'member.eventDetail.noParticipants' | t }}</p>
          } @else {
            <ul class="detail-participants">
              @for (participant of view.participants; track participant.userId) {
                <li class="detail-participant">
                  <vereint-avatar-badge [name]="participant.displayName" />
                  <span class="detail-participant-name">
                    {{ participant.displayName }}
                    @if (participant.role === 'coHost') {
                      <small class="member-muted">· {{ 'member.eventDetail.role.coHost' | t }}</small>
                    }
                  </span>
                  @if (participant.rsvp) {
                    <vereint-status-badge
                      [label]="rsvpLabelKey(participant.rsvp) | t"
                      [tone]="rsvpTone(participant.rsvp)"
                    />
                  } @else {
                    <vereint-status-badge
                      [label]="participantLabel(participant.role)"
                      [tone]="participantTone(participant.role)"
                    />
                  }
                </li>
              }
            </ul>
          }

          <!-- Event-Chat -->
          <section class="event-chat" aria-labelledby="event-chat-title">
            <h2 id="event-chat-title" class="member-subtitle">{{ 'member.eventDetail.chat.heading' | t }}</h2>
            @if (chatError(); as error) {
              <p class="member-muted" role="status">{{ error }}</p>
            } @else if (chatLoaded()) {
              @if (messages().length === 0) {
                <p class="member-muted">{{ 'member.eventDetail.chat.empty' | t }}</p>
              } @else {
                <ol class="chat-messages" aria-live="polite">
                  @for (message of messages(); track message.id) {
                    <li class="chat-message" [class.is-mine]="isMine(message, view.profile)">
                      <span class="chat-sender">{{ message.senderName }}</span>
                      <span class="chat-text">{{ message.message }}</span>
                      <time class="chat-time" [attr.datetime]="message.createdAt">{{ formatDateTime(message.createdAt) }}</time>
                    </li>
                  }
                </ol>
              }
              @if (chatReadOnly(view.event.status)) {
                <p class="member-muted chat-closed">{{ 'member.eventDetail.chat.closed' | t }}</p>
              }
              <form class="chat-composer" (ngSubmit)="sendMessage()">
                <label class="chat-field">
                  <span class="visually-hidden">{{ 'member.eventDetail.chat.message' | t }}</span>
                  <input
                    name="chatDraft"
                    [(ngModel)]="chatDraft"
                    maxlength="4000"
                    autocomplete="off"
                    [placeholder]="'member.eventDetail.chat.placeholder' | t"
                    [disabled]="chatReadOnly(view.event.status)"
                  />
                </label>
                <button
                  type="submit"
                  class="member-button chat-send"
                  [disabled]="chatReadOnly(view.event.status) || chatSending()"
                >
                  <vereint-icon name="send" /> {{ 'member.eventDetail.chat.send' | t }}
                </button>
              </form>
              @if (chatSendError(); as error) {
                <p class="member-hint rsvp-error" role="alert">{{ error }}</p>
              }
            } @else {
              <p class="member-muted">{{ 'member.eventDetail.chat.loading' | t }}</p>
            }
          </section>

          <!-- Gemeinschaftsmomente & Rituale (Moments) Sektion -->
          <h2 class="member-subtitle">{{ 'member.eventDetail.momentsHeading' | t }}</h2>
          <div class="moments-banner-card">
            <div class="moments-banner-head">
              <vereint-icon class="moments-banner-icon" name="moments" />
              <div>
                <strong>{{ 'member.eventDetail.momentsTitle' | t }}</strong>
                <p>
                  @if (view.moments.length > 0) {
                    {{ 'member.eventDetail.momentsActive' | t: { count: view.moments.length } }}
                  } @else {
                    {{ 'member.eventDetail.momentsInvite' | t }}
                  }
                </p>
              </div>
            </div>
            <a
              class="member-button moments-btn"
              [routerLink]="['/events', view.event.id, 'moments']"
            >
              @if (view.moments.length > 0) {
                {{ 'member.eventDetail.momentsView' | t: { count: view.moments.length } }}
              } @else {
                {{ 'member.eventDetail.momentsStart' | t }}
              }
            </a>
          </div>

          <!-- Vergangene Moments / Archiv -->
          @if (view.history.length > 0) {
            <h3 class="member-subtitle history-title">{{ 'member.eventDetail.historyHeading' | t }}</h3>
            <ul class="detail-history-list">
              @for (item of view.history; track item.momentId) {
                <li class="detail-history-item">
                  <div class="history-item-head">
                    <span class="history-chip">{{ item.topicType }}</span>
                    <strong>{{ item.title }}</strong>
                    <time class="history-date">{{ formatDateTime(item.completedAt) }}</time>
                  </div>
                  <p class="history-text">{{ item.summary }}</p>
                  <span class="history-meta">
                    <vereint-icon name="users" /> {{ 'member.eventDetail.historyParticipants' | t: { count: item.uniqueParticipants } }} · <vereint-icon name="chat" /> {{ 'member.eventDetail.historyResponses' | t: { count: item.totalResponses } }}
                  </span>
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
      .detail-head {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        padding: var(--space-3, 1rem);
        border-radius: var(--radius-lg, 1rem);
        background: rgba(148, 163, 184, 0.08);
      }
      .detail-head-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .detail-head-top h1 {
        margin: 0;
      }
      .detail-meta {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        opacity: 0.9;
      }
      .detail-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .manage-link {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        text-decoration: none;
      }
      .rsvp-state {
        margin: 0 0 0.5rem;
        font-weight: 600;
      }
      .rsvp-error {
        color: var(--color-danger, #b91c1c);
      }
      .rsvp-counts {
        list-style: none;
        margin: 0 0 0.75rem;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem 1rem;
        font-size: 0.9rem;
        color: var(--color-text-muted);
      }
      .event-chat {
        margin-top: 1rem;
      }
      .chat-messages {
        list-style: none;
        margin: 0 0 0.75rem;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-height: 24rem;
        overflow-y: auto;
      }
      .chat-message {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        max-width: 85%;
        padding: 0.5rem 0.75rem;
        border-radius: var(--radius-md, 0.75rem);
        background: rgba(148, 163, 184, 0.1);
      }
      .chat-message.is-mine {
        align-self: flex-end;
        background: var(--color-brand-soft, rgba(245, 166, 35, 0.15));
      }
      .chat-sender {
        font-size: 0.8rem;
        font-weight: 700;
      }
      .chat-text {
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }
      .chat-time {
        font-size: 0.72rem;
        color: var(--color-text-muted);
      }
      .chat-composer {
        display: flex;
        gap: 0.5rem;
        align-items: stretch;
      }
      .chat-field {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
      }
      .chat-field input {
        flex: 1 1 auto;
        min-width: 0;
        min-height: 2.75rem;
        padding: 0.5rem 0.75rem;
        border: 1px solid var(--color-border-dark, #cbd5e1);
        border-radius: 0.5rem;
        font: inherit;
      }
      .chat-send {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      .rsvp-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .rsvp-button {
        flex: 1 1 6rem;
        padding: 0.7rem 0.9rem;
        border: 1px solid rgba(148, 163, 184, 0.4);
        border-radius: var(--radius-md, 0.75rem);
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
      }
      .rsvp-button.is-active {
        border-color: var(--color-brand);
        background: rgba(245, 166, 35, 0.15);
        font-weight: 600;
      }
      .rsvp-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .rsvp-button[data-answer='accepted'].is-active {
        border-color: #16a34a;
        background: rgba(22, 163, 74, 0.18);
      }
      .rsvp-button[data-answer='declined'].is-active {
        border-color: #b91c1c;
        background: rgba(185, 28, 28, 0.12);
      }
      .detail-participants {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .detail-participant {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.5rem 0.6rem;
        border-radius: var(--radius-md, 0.75rem);
        background: rgba(148, 163, 184, 0.08);
      }
      .detail-participant-name {
        flex: 1 1 auto;
      }
      .moments-banner-card {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 1rem;
        border-radius: var(--radius-md, 0.75rem);
        background-color: var(--color-surface-raised, rgba(148, 163, 184, 0.08));
        border: 1px solid var(--color-border);
      }
      .moments-banner-head {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .moments-banner-icon {
        font-size: 1.5rem;
      }
      .moments-banner-head strong {
        display: block;
        color: var(--color-text);
        font-size: 0.95rem;
      }
      .moments-banner-head p {
        margin: 0.15rem 0 0;
        font-size: 0.85rem;
        color: var(--color-text-muted);
      }
      .moments-btn {
        align-self: flex-start;
      }
      .history-title {
        margin-top: 1.5rem;
      }
      .detail-history-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
      }
      .detail-history-item {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.75rem;
        border-radius: var(--radius-md, 0.75rem);
        background: rgba(148, 163, 184, 0.05);
        border: 1px solid var(--color-border);
      }
      .history-item-head {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .history-chip {
        font-size: 0.75rem;
        font-weight: 700;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        background-color: var(--color-brand-soft);
        color: var(--color-brand);
        border: 1px solid var(--color-brand);
      }
      .history-date {
        margin-left: auto;
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
      .history-text {
        margin: 0;
        font-size: 0.85rem;
        color: var(--color-text);
      }
      .history-meta {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
    `,
  ],
})
export class EventDetailComponent implements OnInit, OnDestroy {
  private readonly api = inject(MemberApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly load = new AsyncState<EventDetailView>();
  protected readonly rsvpBusy = signal(false);
  protected readonly rsvpError = signal<string | null>(null);
  protected readonly formatDateTime = formatDateTime;
  protected readonly eventStatusLabel = eventStatusLabel;
  protected readonly rsvpLabelKey = rsvpLabelKey;
  protected readonly rsvpTone = rsvpTone;
  protected readonly rsvpOptions: readonly { value: RsvpAnswer; labelKey: string }[] = [
    { value: 'accepted', labelKey: 'member.rsvp.accept' },
    { value: 'maybe', labelKey: 'member.rsvp.maybe' },
    { value: 'declined', labelKey: 'member.rsvp.decline' },
  ];

  /** Event-Chat: Konversation, Nachrichten und Eingabe. */
  protected readonly messages = signal<ChatMessageDto[]>([]);
  protected readonly chatLoaded = signal(false);
  protected readonly chatError = signal<string | null>(null);
  protected readonly chatSending = signal(false);
  protected readonly chatSendError = signal<string | null>(null);
  protected chatDraft = '';
  private conversationId: string | null = null;
  private lastReadMessageId: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private chatSubscription?: Subscription;

  private get eventId(): string {
    return this.route.snapshot.paramMap.get('eventId') ?? '';
  }

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
    this.stopPolling();
    this.chatSubscription?.unsubscribe();
  }

  protected reload(): void {
    const eventId = this.eventId;
    this.load.run(
      forkJoin({
        event: this.api.getEvent(eventId),
        participants: this.api.listParticipants(eventId),
        moments: this.api.listMoments(eventId).pipe(catchError(() => of([]))),
        history: this.api.listMomentHistory(eventId).pipe(catchError(() => of([]))),
        profile: this.api.loadProfile().pipe(catchError(() => of(null))),
      }),
      () => this.openChat(eventId),
    );
  }

  /** Antworten sind nur möglich, solange das Event nicht abgesagt oder vorbei ist. */
  protected canAnswer(status: EventStatus): boolean {
    return status === 'published' || status === 'active' || status === 'draft';
  }

  /** Satz zur eigenen Antwort über den Buttons. */
  protected myRsvpText(status: string): string {
    return translate(`member.eventDetail.myRsvp.${status}`);
  }

  /** Speichert die eigene Antwort beim Fachservice und lädt die Teilnehmer neu. */
  protected setRsvp(answer: RsvpAnswer): void {
    const view = this.load.data();
    if (!view || this.rsvpBusy()) return;
    this.rsvpBusy.set(true);
    this.rsvpError.set(null);
    this.api.respondToEvent(view.event.id, answer).subscribe({
      next: (event) => {
        this.rsvpBusy.set(false);
        this.load.data.update((curr) => (curr ? { ...curr, event } : curr));
        this.api.listParticipants(view.event.id).subscribe({
          next: (participants) =>
            this.load.data.update((curr) => (curr ? { ...curr, participants } : curr)),
          error: () => undefined,
        });
      },
      error: (error: unknown) => {
        this.rsvpBusy.set(false);
        this.rsvpError.set(describeApiError(error));
      },
    });
  }

  /** In abgesagten oder archivierten Events kann niemand mehr schreiben. */
  protected chatReadOnly(status: EventStatus): boolean {
    return READ_ONLY_CHAT_STATUS.includes(status);
  }

  protected isMine(message: ChatMessageDto, profile: MemberProfile | null): boolean {
    return !!profile && message.senderType === 'member' && message.senderId === profile.id;
  }

  /** Ermittelt die Konversation, lädt die Nachrichten und startet die Aktualisierung. */
  private openChat(eventId: string): void {
    this.stopPolling();
    this.chatSubscription?.unsubscribe();
    this.chatLoaded.set(false);
    this.chatError.set(null);
    this.chatSubscription = this.api.getEventConversation(eventId).subscribe({
      next: (conversation) => {
        this.conversationId = conversation.id;
        this.refreshMessages();
        if (isPlatformBrowser(this.platformId)) {
          this.pollTimer = setInterval(() => this.refreshMessages(), EVENT_CHAT_POLL_MS);
        }
      },
      error: () => this.chatError.set(translate('member.eventDetail.chat.unavailable')),
    });
  }

  /** Lädt die Nachrichten neu und setzt bei neuen Nachrichten den Lesestand. */
  protected refreshMessages(): void {
    const conversationId = this.conversationId;
    if (!conversationId) return;
    this.api.listConversationMessages(conversationId).subscribe({
      next: (messages) => {
        this.messages.set(messages);
        this.chatLoaded.set(true);
        this.markRead(conversationId, messages);
      },
      error: (error: unknown) => {
        if (!this.chatLoaded()) this.chatError.set(describeApiError(error));
      },
    });
  }

  private markRead(conversationId: string, messages: ChatMessageDto[]): void {
    const last = messages.at(-1);
    if (!last || last.id === this.lastReadMessageId) return;
    this.lastReadMessageId = last.id;
    this.api.markConversationRead(conversationId).subscribe({ error: () => undefined });
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  protected sendMessage(): void {
    const message = this.chatDraft.trim();
    const conversationId = this.conversationId;
    const status = this.load.data()?.event.status;
    if (!message || !conversationId || !status || this.chatReadOnly(status)) return;
    this.chatSending.set(true);
    this.chatSendError.set(null);
    this.api.sendConversationMessage(conversationId, message).subscribe({
      next: (sent) => {
        this.chatSending.set(false);
        this.chatDraft = '';
        this.messages.update((list) => (list.some((m) => m.id === sent.id) ? list : [...list, sent]));
        this.lastReadMessageId = sent.id;
      },
      error: (error: unknown) => {
        this.chatSending.set(false);
        this.chatSendError.set(describeApiError(error));
      },
    });
  }

  /**
   * Öffnet die Route zum Veranstaltungsort in einer Karten-App. Ausschließlich
   * clientseitig – im SSR-Kontext passiert nichts (keine privaten Daten).
   */
  protected openRoute(location: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const query = encodeURIComponent(location);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank', 'noopener');
  }

  /** Klartext des Teilnehmerstatus (Rolle) für den Status-Chip. */
  protected participantLabel(role: string): string {
    switch (role) {
      case 'coHost':
        return translate('member.eventDetail.role.coHost');
      case 'participant':
        return translate('member.eventDetail.role.participant');
      default:
        return role;
    }
  }

  /** Farbton des Teilnehmer-Status-Chips. */
  protected participantTone(role: string): StatusTone {
    return role === 'coHost' ? 'success' : 'neutral';
  }
}
