import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, of, catchError, type Subscription } from 'rxjs';
import { describeApiError } from '../api/api-client.service';
import { AsyncState } from './async-state';
import { MemberApiService, rsvpLabelKey, rsvpTone, type RsvpAnswer } from './member-api.service';
import { eventStatusLabel, formatDateTime, formatEventWhen, formatTime } from './member-format';
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
          <header class="detail-head">
            <div class="detail-eyebrow">
              <span class="eyebrow">{{ 'member.eventDetail.eyebrow' | t }}</span>
              <vereint-status-badge [label]="eventStatusLabel(view.event.status)" [tone]="eventTone(view.event.status)" />
            </div>
            <h1 id="event-title">{{ view.event.title }}</h1>
            <ul class="detail-meta">
              <li>
                <vereint-icon name="clock" />
                <span>{{ whenRange(view.event.startsAt, view.event.endsAt) }}</span>
              </li>
              @if (view.event.location) {
                <li>
                  <vereint-icon name="location" />
                  <span class="detail-meta-grow">{{ view.event.location }}</span>
                  <button type="button" class="detail-route" (click)="openRoute(view.event.location)">
                    {{ 'member.eventDetail.route' | t }}
                  </button>
                </li>
              }
              <li>
                <vereint-icon name="user" />
                <span>{{ 'member.eventDetail.organizedBy' | t: { name: view.event.ownerDisplayName } }}</span>
              </li>
            </ul>
          </header>

          @if (view.event.description) {
            <p class="member-description detail-description">{{ view.event.description }}</p>
          }

          <nav class="detail-chips" [attr.aria-label]="'member.eventDetail.eyebrow' | t">
            <a class="detail-chip" [routerLink]="[]" fragment="event-chat">{{ 'member.eventDetail.chatChip' | t }}</a>
            <a class="detail-chip" [routerLink]="['/events', view.event.id, 'moments']">
              @if (view.moments.length > 0) {
                {{ 'member.eventDetail.momentsChipActive' | t: { count: view.moments.length } }}
              } @else {
                {{ 'member.eventDetail.momentsChip' | t }}
              }
            </a>
            @if (view.event.canManage) {
              <a class="detail-chip detail-chip-strong" [routerLink]="['/events', view.event.id, 'manage']">
                <vereint-icon name="edit" /> {{ 'member.eventDetail.manage' | t }}
              </a>
            }
          </nav>

          @if (view.event.myRsvp) {
            <section class="detail-card" aria-labelledby="rsvp-title">
              <h2 id="rsvp-title" class="detail-card-title">{{ 'member.eventDetail.rsvpHeading' | t }}</h2>
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
              <p class="rsvp-state" role="status">{{ myRsvpText(view.event.myRsvp) }}</p>
              @if (rsvpError(); as error) {
                <p class="member-hint rsvp-error" role="alert">{{ error }}</p>
              }
            </section>
          }

          <div class="detail-section-head">
            <h2 class="detail-section-title">{{ 'member.eventDetail.attendanceHeading' | t }}</h2>
            @if (view.event.rsvpCounts; as counts) {
              <span class="detail-section-meta" [attr.aria-label]="'member.eventDetail.countsLabel' | t">
                {{ 'member.eventDetail.attendanceSummary' | t: { accepted: counts.accepted, invited: counts.invited } }}
              </span>
            }
          </div>
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
          <section class="event-chat" id="event-chat" aria-labelledby="event-chat-title">
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

          <!-- Vergangene Moments / Archiv -->
          @if (view.history.length > 0) {
            <h3 class="member-subtitle history-title">{{ 'member.eventDetail.historyHeading' | t }}</h3>
            <ul class="detail-history-list">
              @for (item of view.history; track item.momentId) {
                <li class="detail-history-item">
                  <div class="history-item-head">
                    <span class="history-chip">{{ item.topicEmoji ? item.topicEmoji + ' ' : '' }}{{ item.topicName }}</span>
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
        gap: 0.35rem;
      }
      .detail-eyebrow {
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }
      .detail-head h1 {
        margin: 0 0 0.35rem;
      }
      .detail-meta {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        color: var(--color-text);
        font-size: 0.95rem;
      }
      .detail-meta li {
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }
      .detail-meta .ui-icon {
        flex-shrink: 0;
        color: var(--color-text-muted);
        font-size: 1.1rem;
      }
      .detail-meta-grow {
        flex: 1;
        min-width: 0;
      }
      .detail-route {
        padding: 0;
        border: none;
        background: none;
        color: var(--color-brand);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .detail-description {
        margin: var(--space-2) 0 0;
        color: var(--color-text-muted);
      }
      .detail-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin: var(--space-3) 0;
      }
      .detail-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        min-height: 2.5rem;
        padding: 0 0.9rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background-color: var(--color-surface);
        color: var(--color-text);
        font-size: 0.9rem;
        font-weight: 600;
        text-decoration: none;
      }
      .detail-chip:hover,
      .detail-chip:focus-visible {
        border-color: var(--color-brand);
        text-decoration: none;
      }
      .detail-chip-strong {
        border-color: transparent;
        background-color: var(--color-brand-soft);
        color: var(--color-brand);
      }
      .detail-card {
        display: grid;
        gap: 0.75rem;
        margin-bottom: var(--space-4);
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background-color: var(--color-surface);
      }
      .detail-card-title,
      .detail-section-title {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 700;
      }
      .detail-section-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-2);
        margin-bottom: 0.6rem;
      }
      .detail-section-meta {
        color: var(--color-text-muted);
        font-size: 0.875rem;
      }
      .rsvp-state {
        margin: 0;
        color: var(--color-text-muted);
        font-size: 0.875rem;
      }
      .rsvp-error {
        color: var(--color-danger);
      }
      .rsvp-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.5rem;
      }
      .rsvp-button {
        min-height: 2.75rem;
        padding: 0 0.5rem;
        border: 1px solid var(--color-border-dark);
        border-radius: var(--radius-sm);
        background-color: var(--color-surface);
        color: var(--color-text);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .rsvp-button.is-active {
        border: 2px solid var(--color-brand);
        background-color: var(--color-brand-soft);
        color: var(--color-brand);
        font-weight: 700;
      }
      .rsvp-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .rsvp-button.is-active:disabled {
        opacity: 1;
      }
      .detail-participants {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background-color: var(--color-surface);
      }
      .detail-participant {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.65rem var(--space-3);
      }
      .detail-participant + .detail-participant {
        border-top: 1px solid var(--color-border);
      }
      .detail-participant-name {
        flex: 1 1 auto;
        font-weight: 600;
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
  /** „Fr, 17. Okt · 18:30 – 23:30“; endet das Event an einem anderen Tag, mit dessen Datum. */
  protected whenRange(startsAt: string, endsAt: string | null): string {
    const start = formatEventWhen(startsAt);
    if (!endsAt) return start;
    const sameDay = new Date(startsAt).toDateString() === new Date(endsAt).toDateString();
    return `${start} – ${sameDay ? formatTime(endsAt) : formatEventWhen(endsAt)}`;
  }

  /** Badge-Farbe des Eventstatus. */
  protected eventTone(status: EventStatus): StatusTone {
    switch (status) {
      case 'active':
      case 'published':
        return 'success';
      case 'cancelled':
        return 'danger';
      case 'draft':
        return 'warning';
      default:
        return 'neutral';
    }
  }

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
