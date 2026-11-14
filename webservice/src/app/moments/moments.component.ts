import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  EventSummary,
  MomentConfigDto,
  MomentDetailDto,
  MomentMediaDto,
  MomentReactionDto,
  MomentSessionDto,
  MomentSummaryDto,
  MomentTypeDto,
  SubmitMomentResponseRequest,
} from '../api/api.types';
import { AuthService } from '../auth/auth.service';
import { AsyncState } from '../member/async-state';
import { MemberApiService } from '../member/member-api.service';
import { formatDateTime } from '../member/member-format';
import { MomentMapComponent } from './moment-map.component';
import { MomentRespondDialogComponent } from './moment-respond-dialog.component';
import { MomentStartDialogComponent } from './moment-start-dialog.component';
import { MomentTimelineComponent } from './moment-timeline.component';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

/**
 * Gemeinschaftsmomente & Rituale (Moments) Screen (TICKET-036).
 *
 * Moments gehören der ganzen Gruppe; ein Event ist optional. Über
 * `/events/:eventId/moments` zeigt die Seite nur die Moments dieses Events.
 * Das Thema wählt das Mitglied aus den Themen, die der Vorstand pflegt.
 */
@Component({
  selector: 'app-moments',
  imports: [
    StateComponent,
    IconComponent,
    RouterLink,
    MomentTimelineComponent,
    MomentMapComponent,
    MomentStartDialogComponent,
    MomentRespondDialogComponent,
    TranslatePipe,
  ],
  template: `
    <main class="page-shell">
      <section class="page-card moments-card" aria-labelledby="moments-title">
        <!-- Kopfbereich -->
        <header class="moments-header">
          <div>
            <span class="eyebrow">{{ 'moments.eyebrow' | t }}</span>
            <h1 id="moments-title">Moments</h1>
          </div>
          <div class="header-actions">
            @if (canManage()) {
              <a class="member-back" routerLink="/board/moments">{{ 'moments.manageLink' | t }}</a>
            }
            @if (routeEventId()) {
              <a class="member-back" [routerLink]="['/events', routeEventId()]">{{ 'moments.backToEvent' | t }}</a>
              <a class="member-back" routerLink="/moments">{{ 'moments.allMoments' | t }}</a>
            }
          </div>
        </header>

        @if (routeEventId()) {
          <p class="event-filter">
            <vereint-icon name="events" />
            {{ 'moments.eventFilter' | t: { title: routeEventTitle() } }}
          </p>
        }

        <!-- Push-Notification Banner / Schnell-Beitreten -->
        @if (pushJoinBanner(); as banner) {
          <div class="push-alert-banner" role="alert">
            <div class="push-alert-body">
              <vereint-icon class="push-alert-icon" name="bell" />
              <div>
                <strong>{{ 'moments.push.title' | t: { title: banner.title } }}</strong>
                <p>{{ 'moments.push.message' | t }}</p>
              </div>
            </div>
            <div class="push-alert-actions">
              <button type="button" class="member-button btn-sm" (click)="openRespondModal(banner.id)">
                {{ 'moments.push.join' | t }}
              </button>
              <button type="button" class="member-button member-button-ghost btn-sm" (click)="dismissPushBanner()">
                {{ 'moments.push.dismiss' | t }}
              </button>
            </div>
          </div>
        }

        <!-- Status / Fehler / Ladezustand -->
        @if (isBusy()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" [message]="'moments.loadingMessage' | t" />
        } @else if (loadError()) {
          <vereint-state kind="error" [title]="'moments.unavailable' | t" [message]="loadError()" (retry)="reload()" />
        } @else {
          <!-- Hauptaktionsbereich -->
          <div class="action-bar">
            <button type="button" class="member-button start-button" (click)="openStartModal()">
              <vereint-icon name="plus" /> {{ 'moments.actions.start' | t }}
            </button>

            @if (activeSessions().length > 0) {
              <div class="active-count-badge">
                <span class="pulse-dot"></span>
                <span>{{ 'moments.actions.activeCount' | t: { count: activeSessions().length } }}</span>
              </div>
            }
          </div>

          <!-- Aktive Moments Liste -->
          @if (activeSessions().length === 0) {
            <div class="empty-moments-card">
              <vereint-icon class="empty-icon" name="moments" />
              <h3>{{ 'moments.empty.title' | t }}</h3>
              <p>{{ 'moments.empty.message' | t }}</p>
              <button type="button" class="member-button" (click)="openStartModal()">
                {{ 'moments.empty.initiate' | t }}
              </button>
            </div>
          } @else {
            <div class="sessions-grid">
              @for (session of activeSessions(); track session.id) {
                <article
                  class="session-card"
                  [class.is-selected]="selectedSessionId() === session.id"
                  (click)="selectSession(session.id)"
                >
                  <div class="session-card-header">
                    <span class="topic-chip">{{ topicLabel(session) }}</span>
                    <span class="session-time-remaining">
                      <vereint-icon name="clock" /> {{ formatRemainingTime(session.expiresAt) }}
                    </span>
                  </div>

                  <h3 class="session-title">{{ session.title }}</h3>

                  @if (session.eventTitle || session.visibility === 'event') {
                    <div class="session-tags">
                      @if (session.eventTitle) {
                        <span class="meta-chip"><vereint-icon name="events" /> {{ session.eventTitle }}</span>
                      }
                      @if (session.visibility === 'event') {
                        <span class="meta-chip is-restricted">
                          <vereint-icon name="lock" /> {{ 'moments.session.eventOnly' | t }}
                        </span>
                      }
                    </div>
                  }

                  @if (session.message) {
                    <p class="session-message">{{ 'moments.quote' | t: { text: session.message } }}</p>
                  }

                  <div class="session-meta">
                    <span class="session-creator">{{ 'moments.session.by' | t: { name: session.creatorName } }}</span>
                    <span class="session-responses-count">
                      <vereint-icon name="chat" />
                      {{ 'moments.session.responses' | t: { count: session.responsesCount } }}
                    </span>
                  </div>

                  <div class="session-card-actions" (click)="$event.stopPropagation()">
                    <button type="button" class="member-button btn-sm" (click)="openRespondModal(session.id)">
                      {{ 'moments.session.react' | t }}
                    </button>

                    @if (session.conversationId) {
                      <a
                        class="member-button member-button-ghost btn-sm"
                        [routerLink]="['/chat']"
                        [queryParams]="{ conversationId: session.conversationId }"
                      >
                        <vereint-icon name="chat" /> {{ 'moments.session.chat' | t }}
                      </a>
                    }

                    <button
                      type="button"
                      class="member-button member-button-ghost btn-sm"
                      (click)="completeMoment(session.id)"
                      [title]="'moments.session.completeTitle' | t"
                    >
                      {{ 'moments.session.complete' | t }}
                    </button>
                  </div>
                </article>
              }
            </div>
          }

          <!-- Detailbereich des ausgewählten Moments -->
          @if (selectedDetail(); as detail) {
            <section class="selected-detail-section" aria-labelledby="detail-title">
              <div class="detail-header">
                <div>
                  <span class="eyebrow">{{ 'moments.detail.eyebrow' | t }}</span>
                  <h2 id="detail-title">{{ detail.session.title }}</h2>
                </div>

                <!-- Tabs für Ansicht -->
                <div class="view-toggles" role="tablist">
                  <button
                    type="button"
                    class="toggle-btn"
                    [class.is-active]="activeTab() === 'timeline'"
                    (click)="activeTab.set('timeline')"
                    role="tab"
                    [attr.aria-selected]="activeTab() === 'timeline'"
                  >
                    {{ 'moments.detail.timelineTab' | t: { count: detail.responses.length } }}
                  </button>
                  <button
                    type="button"
                    class="toggle-btn"
                    [class.is-active]="activeTab() === 'map'"
                    (click)="activeTab.set('map')"
                    role="tab"
                    [attr.aria-selected]="activeTab() === 'map'"
                  >
                    {{ 'moments.detail.mapTab' | t: { count: detail.mapGeoJson.features.length } }}
                  </button>
                </div>
              </div>

              <!-- Schnelle Reaktionsleiste -->
              <div class="quick-reaction-bar">
                <span class="quick-label">{{ 'moments.detail.quickLabel' | t }}</span>
                <div class="quick-buttons">
                  @if (detail.session.active) {
                    @for (q of reactionsFor(detail.session.topicType); track q.code) {
                      <button
                        type="button"
                        class="quick-btn"
                        (click)="submitQuickReaction(detail.session.id, q.code)"
                        [title]="q.name"
                      >
                        {{ q.emoji }} {{ q.name }}
                      </button>
                    }
                    <button type="button" class="quick-btn btn-custom" (click)="openRespondModal(detail.session.id)">
                      {{ 'moments.detail.custom' | t }}
                    </button>
                    <button
                      type="button"
                      class="quick-btn btn-custom"
                      (click)="openRespondModal(detail.session.id, true)"
                    >
                      <vereint-icon name="camera" /> {{ 'moments.detail.shareMedia' | t }}
                    </button>
                  } @else {
                    <span class="quick-label">{{ 'moments.detail.ended' | t }}</span>
                  }
                </div>
              </div>

              <!-- Ansichten: Timeline oder Map -->
              @if (activeTab() === 'timeline') {
                <app-moment-timeline
                  [responses]="detail.responses"
                  (removeMedia)="removeMedia(detail.session.id, $event)"
                />
              } @else {
                <app-moment-map
                  [mapData]="detail.mapGeoJson"
                  [sessionTitle]="detail.session.title"
                  [reactions]="config()?.reactions ?? []"
                />
              }
            </section>
          }

          <!-- Historie / Abgeschlossene Moments -->
          @if (history().length > 0) {
            <section class="history-section" aria-labelledby="history-title">
              <h3 id="history-title" class="history-heading">{{ 'moments.history.title' | t }}</h3>
              <ul class="history-list">
                @for (item of history(); track item.momentId) {
                  <li class="history-item">
                    <div class="history-item-top">
                      <span class="topic-chip">{{ topicLabel(item) }}</span>
                      <strong class="history-item-title">{{ item.title }}</strong>
                      <time class="history-time">{{ formatTime(item.completedAt) }}</time>
                    </div>
                    @if (item.eventTitle) {
                      <span class="meta-chip"><vereint-icon name="events" /> {{ item.eventTitle }}</span>
                    }
                    <p class="history-summary">{{ item.summary }}</p>
                    <div class="history-stats">
                      <span>
                        <vereint-icon name="users" />
                        {{ 'moments.history.participants' | t: { count: item.uniqueParticipants } }}
                      </span>
                      <span>
                        <vereint-icon name="chat" />
                        {{ 'moments.history.contributions' | t: { count: item.totalResponses } }}
                      </span>
                      <button
                        type="button"
                        class="member-button member-button-ghost btn-sm"
                        (click)="selectSession(item.momentId)"
                      >
                        {{ 'moments.history.view' | t }}
                      </button>
                    </div>
                  </li>
                }
              </ul>
            </section>
          }
        }
      </section>

      <app-moment-start-dialog
        [open]="startModalOpen()"
        [types]="activeTypes()"
        [events]="events()"
        [defaultEventId]="routeEventId()"
        [canManage]="canManage()"
        (closed)="closeStartModal()"
        (started)="onMomentStarted($event)"
      />

      <app-moment-respond-dialog
        [open]="respondModalOpen()"
        [momentId]="respondingSessionId()"
        [reactions]="respondReactions()"
        [mediaLimits]="mediaLimits()"
        [focusMedia]="respondFocusMedia()"
        (closed)="closeRespondModal()"
        (submitted)="onResponseSubmitted($event)"
      />
    </main>
  `,
  styles: [
    `
      .moments-card {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .moments-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .header-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: var(--space-1) var(--space-2);
      }
      .event-filter {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        margin: 0;
        padding: 0.5rem 0.75rem;
        border-radius: var(--radius-md);
        background-color: var(--color-brand-soft);
        color: var(--color-brand-strong);
        font-size: 0.875rem;
        font-weight: 600;
      }
      .push-alert-banner {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 0.85rem 1rem;
        border-radius: var(--radius-md);
        background-color: var(--color-brand-soft);
        border: 1px solid var(--color-brand);
      }
      .push-alert-body {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .push-alert-icon {
        font-size: 1.5rem;
      }
      .push-alert-body strong {
        display: block;
        color: var(--color-text);
        font-size: 0.95rem;
      }
      .push-alert-body p {
        margin: 0.15rem 0 0;
        font-size: 0.85rem;
        color: var(--color-text-muted);
      }
      .push-alert-actions {
        display: flex;
        gap: 0.5rem;
      }
      .action-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.75rem;
      }
      .start-button {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
      }
      .active-count-badge {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--color-brand-strong);
      }
      .pulse-dot {
        width: 0.65rem;
        height: 0.65rem;
        border-radius: 50%;
        background-color: var(--color-success);
        animation: pulse-ring 1.8s infinite;
      }
      @keyframes pulse-ring {
        0% {
          transform: scale(0.95);
          box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-success) 70%, transparent);
        }
        70% {
          transform: scale(1);
          box-shadow: 0 0 0 6px transparent;
        }
        100% {
          transform: scale(0.95);
          box-shadow: 0 0 0 0 transparent;
        }
      }
      .empty-moments-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3rem 1.5rem;
        text-align: center;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        border: 1px dashed var(--color-border);
        gap: 0.75rem;
      }
      .empty-icon {
        font-size: 3rem;
        color: var(--color-brand);
      }
      .empty-moments-card h3 {
        margin: 0;
        font-size: 1.2rem;
        color: var(--color-text);
      }
      .empty-moments-card p {
        margin: 0;
        max-width: 28rem;
        font-size: 0.9rem;
        color: var(--color-text-muted);
      }
      .sessions-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
        gap: 1rem;
      }
      .session-card {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        padding: 1rem;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        border: 1px solid var(--color-border);
        cursor: pointer;
        transition:
          border-color 0.2s ease,
          box-shadow 0.2s ease;
      }
      .session-card:hover {
        border-color: var(--color-brand);
      }
      .session-card.is-selected {
        border-color: var(--color-brand);
        box-shadow: 0 0 0 1px var(--color-brand);
      }
      .session-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .topic-chip {
        display: inline-flex;
        align-items: center;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 700;
        background-color: var(--color-brand-soft);
        color: var(--color-brand-strong);
      }
      .session-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }
      .meta-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        width: fit-content;
        padding: 0.15rem 0.55rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
      .meta-chip.is-restricted {
        border-color: var(--color-warning);
        color: var(--color-text);
        background-color: var(--color-warning-light);
      }
      .session-time-remaining {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
      .session-title {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .session-message {
        margin: 0;
        font-size: 0.85rem;
        color: var(--color-text-muted);
        font-style: italic;
      }
      .session-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.8rem;
        color: var(--color-text-muted);
        margin-top: auto;
      }
      .session-responses-count {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
      }
      .session-card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid var(--color-border);
      }
      .selected-detail-section {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1.25rem;
        border-radius: var(--radius-md);
        background-color: var(--color-surface);
        border: 1px solid var(--color-border);
      }
      .detail-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 1rem;
      }
      .detail-header h2 {
        margin: 0.2rem 0 0;
        font-size: 1.3rem;
      }
      .view-toggles {
        display: flex;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        border: 1px solid var(--color-border);
        padding: 0.2rem;
        gap: 0.2rem;
      }
      .toggle-btn {
        border: none;
        background: transparent;
        color: var(--color-text-muted);
        padding: 0.4rem 0.8rem;
        font-size: 0.85rem;
        font-weight: 600;
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: background-color 0.2s ease;
      }
      .toggle-btn.is-active {
        background-color: var(--color-brand);
        color: var(--color-on-brand);
      }
      .quick-reaction-bar {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding: 0.75rem;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        border: 1px solid var(--color-border);
      }
      .quick-label {
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .quick-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .quick-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.35rem 0.75rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background-color: var(--color-surface);
        color: var(--color-text);
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        transition:
          border-color 0.15s ease,
          background-color 0.15s ease;
      }
      .quick-btn:hover {
        border-color: var(--color-brand);
        background-color: var(--color-brand-soft);
        color: var(--color-brand-strong);
      }
      .btn-custom {
        border-style: dashed;
      }
      .history-section {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--color-border);
      }
      .history-heading {
        margin: 0;
        font-size: 1.1rem;
        color: var(--color-text);
      }
      .history-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .history-item {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.75rem 1rem;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        border: 1px solid var(--color-border);
      }
      .history-item-top {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .history-item-title {
        color: var(--color-text);
        font-size: 0.95rem;
      }
      .history-time {
        margin-left: auto;
        font-size: 0.8rem;
        color: var(--color-text-muted);
      }
      .history-summary {
        margin: 0;
        font-size: 0.85rem;
        color: var(--color-text);
      }
      .history-stats {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 1rem;
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
      .btn-sm {
        padding: 0.4rem 0.8rem;
        font-size: 0.8rem;
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        text-decoration: none;
      }

    `,
  ],
})
export class MomentsComponent implements OnInit, OnDestroy {
  private readonly api = inject(MemberApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly auth = inject(AuthService);

  /** Vom Vorstand gepflegte Themen und Reaktionen samt Upload-Grenzen. */
  protected readonly config = signal<MomentConfigDto | null>(null);
  /** Vorstand/Admin sehen den Link zur Verwaltung der Themen und Reaktionen. */
  protected readonly canManage = signal(false);

  protected readonly activeTypes = computed<MomentTypeDto[]>(
    () => this.config()?.types.filter((type) => type.active) ?? [],
  );
  protected readonly mediaLimits = computed(() => this.config()?.mediaLimits ?? null);

  // Async States
  protected readonly loadSessionsState = new AsyncState<MomentSessionDto[]>();
  protected readonly loadDetailState = new AsyncState<MomentDetailDto>();
  protected readonly loadHistoryState = new AsyncState<MomentSummaryDto[]>();

  // Signals
  protected readonly events = signal<EventSummary[]>([]);
  /** Über `/events/:eventId/moments` geöffnet: nur Moments dieses Events. */
  protected readonly routeEventId = signal<string | null>(null);
  protected readonly activeSessions = signal<MomentSessionDto[]>([]);
  protected readonly selectedSessionId = signal<string | null>(null);
  protected readonly selectedDetail = signal<MomentDetailDto | null>(null);
  protected readonly history = signal<MomentSummaryDto[]>([]);
  protected readonly activeTab = signal<'timeline' | 'map'>('timeline');

  protected readonly routeEventTitle = computed(() => {
    const id = this.routeEventId();
    return (
      this.events().find((event) => event.id === id)?.title ??
      this.activeSessions().find((session) => session.eventId === id)?.eventTitle ??
      ''
    );
  });

  // Push alert banner
  protected readonly pushJoinBanner = signal<{ id: string; title: string } | null>(null);

  // Dialoge
  protected readonly startModalOpen = signal(false);
  protected readonly respondModalOpen = signal(false);
  protected readonly respondingSessionId = signal<string | null>(null);
  protected readonly respondFocusMedia = signal(false);

  /** Reaktionen, die das Thema des Moments im Beitragsdialog erlaubt. */
  protected readonly respondReactions = computed<MomentReactionDto[]>(() => {
    const sessionId = this.respondingSessionId();
    const detail = this.selectedDetail();
    const session =
      this.activeSessions().find((s) => s.id === sessionId) ??
      (detail?.session.id === sessionId ? detail?.session : undefined);
    return session ? this.reactionsFor(session.topicType) : [];
  });

  // Busy & Error
  readonly isBusy = computed(() => this.loadSessionsState.isLoading() || this.loadDetailState.isLoading());

  readonly loadError = computed(() => {
    const err = this.loadSessionsState.errorMessage() || this.loadDetailState.errorMessage();
    return err || null;
  });

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.api.getMomentConfig().subscribe({
      next: (config) => this.config.set(config),
    });
    void this.auth.getSession().then((session) => {
      const roles = session?.roles ?? [];
      this.canManage.set(roles.includes('board') || roles.includes('admin'));
    });
    // Events nur für die optionale Verknüpfung; ohne sie geht alles weiter.
    this.api.listEvents().subscribe({
      next: (events) => this.events.set(events),
      error: () => this.events.set([]),
    });

    // Route Parameter prüfen (z.B. /events/:eventId/moments)
    this.routeEventId.set(this.route.snapshot.paramMap.get('eventId'));

    // Query-Parameter prüfen (z.B. ?momentId=... von Push-Benachrichtigungen)
    const qMomentId = this.route.snapshot.queryParamMap.get('momentId');
    if (qMomentId) {
      this.selectedSessionId.set(qMomentId);
    }

    this.loadMoments();
  }

  ngOnDestroy(): void {
    this.loadSessionsState.destroy();
    this.loadDetailState.destroy();
    this.loadHistoryState.destroy();
  }

  protected reload(): void {
    this.loadMoments();
  }

  private loadMoments(): void {
    const eventId = this.routeEventId();
    this.loadSessionsState.run(this.api.listMoments(eventId), (sessions) => {
      this.activeSessions.set(sessions);

      // Check for deep-linked push moment
      const targetMomentId = this.selectedSessionId() || this.route.snapshot.queryParamMap.get('momentId');
      if (targetMomentId) {
        const found = sessions.find((s) => s.id === targetMomentId);
        if (found) {
          this.pushJoinBanner.set({ id: found.id, title: found.title });
          this.selectSession(found.id);
        } else if (sessions.length > 0) {
          this.selectSession(sessions[0].id);
        }
      } else if (sessions.length > 0) {
        this.selectSession(sessions[0].id);
      } else {
        this.selectedDetail.set(null);
      }

      this.loadHistory(eventId);
    });
  }

  private loadHistory(eventId: string | null): void {
    this.loadHistoryState.run(this.api.listMomentHistory(eventId), (hist) => {
      this.history.set(hist);
    });
  }

  protected selectSession(sessionId: string): void {
    this.selectedSessionId.set(sessionId);
    this.loadDetailState.run(this.api.getMomentDetail(sessionId), (detail) => {
      this.selectedDetail.set(detail);
    });
  }

  protected dismissPushBanner(): void {
    this.pushJoinBanner.set(null);
  }

  // --- Dialoge ---
  protected openStartModal(): void {
    this.startModalOpen.set(true);
  }

  protected closeStartModal(): void {
    this.startModalOpen.set(false);
  }

  protected onMomentStarted(session: MomentSessionDto): void {
    this.closeStartModal();
    this.selectedSessionId.set(session.id);
    this.loadMoments();
  }

  protected openRespondModal(sessionId: string, focusMedia = false): void {
    this.respondingSessionId.set(sessionId);
    this.respondFocusMedia.set(focusMedia);
    this.respondModalOpen.set(true);
  }

  protected closeRespondModal(): void {
    this.respondModalOpen.set(false);
  }

  protected onResponseSubmitted(sessionId: string): void {
    this.closeRespondModal();
    this.selectSession(sessionId);
  }

  /** Reaktionen, die in Moments dieses Themas erlaubt sind (unbekanntes Thema: alle aktiven). */
  protected reactionsFor(topicType: string): MomentReactionDto[] {
    const config = this.config();
    if (!config) return [];
    const type = config.types.find((t) => t.code === topicType);
    const active = config.reactions.filter((r) => r.active);
    if (!type) return active;
    return active.filter((r) => type.allowedReactionCodes.includes(r.code));
  }

  /** Entfernt ein Bild/Video aus einem Beitrag (nach Rückfrage). */
  protected removeMedia(sessionId: string, media: MomentMediaDto): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!window.confirm(translate('moments.media.removeConfirm'))) return;
    this.api.deleteMomentMedia(sessionId, media.id).subscribe({
      next: () => this.selectSession(sessionId),
    });
  }

  protected submitQuickReaction(sessionId: string, reaction: string): void {
    const payload: SubmitMomentResponseRequest = {
      reaction,
      consent: false,
    };

    this.api.submitMomentResponse(sessionId, payload).subscribe({
      next: () => {
        this.selectSession(sessionId);
      },
    });
  }

  protected completeMoment(sessionId: string): void {
    this.api.completeMoment(sessionId).subscribe({
      next: () => {
        this.loadMoments();
      },
    });
  }

  // --- Formatters & Helpers ---
  /** Themen-Anzeige mit Emoji; Name und Emoji legt der Vorstand fest. */
  protected topicLabel(item: { topicName: string; topicEmoji: string | null }): string {
    return item.topicEmoji ? `${item.topicEmoji} ${item.topicName}` : item.topicName;
  }

  protected formatTime(iso: string): string {
    return formatDateTime(iso);
  }

  protected formatRemainingTime(expiresAt: string): string {
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return translate('moments.remaining.expired');
    const minutes = Math.floor(diffMs / (1000 * 60));
    if (minutes < 60) return translate('moments.remaining.minutes', { count: minutes });
    const hours = Math.floor(minutes / 60);
    return translate('moments.remaining.hours', { count: hours });
  }
}
