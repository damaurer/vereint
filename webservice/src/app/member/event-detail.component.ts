import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, of, catchError } from 'rxjs';
import { AsyncState } from './async-state';
import { MemberApiService } from './member-api.service';
import { eventStatusLabel, formatDateTime } from './member-format';
import type { EventDetail, EventParticipant, MemberProfile, MomentSessionDto, MomentSummaryDto } from '../api/api.types';
import { AvatarBadgeComponent, StatusBadgeComponent, type StatusTone } from '../ui';

interface EventDetailView {
  event: EventDetail;
  participants: EventParticipant[];
  moments: MomentSessionDto[];
  history: MomentSummaryDto[];
  profile: MemberProfile | null;
}

/** Mögliche RSVP-Antwort eines Mitglieds (reine Client-Auswahl). */
type RsvpAnswer = 'yes' | 'maybe' | 'no';

/**
 * Eventdetails für ein Mitglied (TICKET-024, Redesign TICKET-034).
 *
 * Lädt Stammdaten und Teilnehmerliste eines Events. Die Sichtbarkeit prüft der
 * Fachservice; fehlt der Zugriff, meldet dieser `403` und die Ansicht zeigt eine
 * neutrale Fehlermeldung (`deny by default`). Kopf mit „Route öffnen“ nutzt die
 * Karten-App ausschließlich clientseitig; die RSVP-Antwort ist eine reine
 * UI-Auswahl vor dem bestehenden Datenfluss. Teilnehmer erhalten Status-Chips
 * über die geteilten Primitive aus TICKET-032.
 */
@Component({
  selector: 'app-member-event-detail',
  imports: [RouterLink, AvatarBadgeComponent, StatusBadgeComponent],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="event-title">
        <span class="eyebrow">Event</span>

        <a class="member-back" routerLink="/events">← Zu den Events</a>

        @if (load.isLoading()) {
          <div class="state-card" role="status" aria-live="polite">
            <strong>Wird geladen …</strong>
            <span>Die Eventdetails werden abgerufen.</span>
          </div>
        } @else if (load.isError()) {
          <div class="state-card state-error" role="alert">
            <strong>Event nicht verfügbar</strong>
            <span>{{ load.errorMessage() }}</span>
            <button type="button" class="member-button" (click)="reload()">Erneut versuchen</button>
          </div>
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
              <li><span aria-hidden="true">📅</span> {{ formatDateTime(view.event.startsAt) }}</li>
              @if (view.event.endsAt) {
                <li><span aria-hidden="true">⏰</span> bis {{ formatDateTime(view.event.endsAt) }}</li>
              }
              @if (view.event.location) {
                <li><span aria-hidden="true">📍</span> {{ view.event.location }}</li>
              }
              <li><span aria-hidden="true">👤</span> {{ view.event.ownerDisplayName }}</li>
            </ul>
            @if (view.event.location) {
              <button type="button" class="member-button route-button" (click)="openRoute(view.event.location)">
                Route öffnen
              </button>
            }
          </article>

          @if (view.event.description) {
            <p class="member-description">{{ view.event.description }}</p>
          }

          <h2 class="member-subtitle">Deine Antwort</h2>
          <div class="rsvp-row" role="group" aria-label="Deine Antwort">
            <button
              type="button"
              class="rsvp-button rsvp-yes"
              [class.is-active]="rsvp() === 'yes'"
              [attr.aria-pressed]="rsvp() === 'yes'"
              (click)="setRsvp('yes')"
            >
              Zusagen
            </button>
            <button
              type="button"
              class="rsvp-button"
              [class.is-active]="rsvp() === 'maybe'"
              [attr.aria-pressed]="rsvp() === 'maybe'"
              (click)="setRsvp('maybe')"
            >
              Vielleicht
            </button>
            <button
              type="button"
              class="rsvp-button"
              [class.is-active]="rsvp() === 'no'"
              [attr.aria-pressed]="rsvp() === 'no'"
              (click)="setRsvp('no')"
            >
              Absagen
            </button>
          </div>

          <h2 class="member-subtitle">Anwesenheit ({{ view.participants.length }} Personen)</h2>
          @if (view.participants.length === 0) {
            <p class="member-muted">Noch keine Teilnehmer.</p>
          } @else {
            <ul class="detail-participants">
              @for (participant of view.participants; track participant.userId) {
                <li class="detail-participant">
                  <vereint-avatar-badge [name]="participant.displayName" />
                  <span class="detail-participant-name">{{ participant.displayName }}</span>
                  <vereint-status-badge
                    [label]="participantLabel(participant.role)"
                    [tone]="participantTone(participant.role)"
                  />
                </li>
              }
            </ul>
          }

          <!-- Gemeinschaftsmomente & Rituale (Moments) Sektion -->
          <h2 class="member-subtitle">Moments & Rituale</h2>
          <div class="moments-banner-card">
            <div class="moments-banner-head">
              <span class="moments-banner-icon">✨</span>
              <div>
                <strong>Gemeinschaftsmomente</strong>
                <p>
                  @if (view.moments.length > 0) {
                    {{ view.moments.length }} aktiver Moment läuft gerade!
                  } @else {
                    Starte ein gemeinsames Anstoßen, Gebet oder Anfeuern für alle Teilnehmer.
                  }
                </p>
              </div>
            </div>
            <a
              class="member-button moments-btn"
              [routerLink]="['/events', view.event.id, 'moments']"
            >
              @if (view.moments.length > 0) {
                Moments ansehen ({{ view.moments.length }} aktiv) →
              } @else {
                Moment starten / Übersicht →
              }
            </a>
          </div>

          <!-- Vergangene Moments / Archiv -->
          @if (view.history.length > 0) {
            <h3 class="member-subtitle history-title">Vergangene Moments & Rituale</h3>
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
                    👥 {{ item.uniqueParticipants }} Teilnehmer · 💬 {{ item.totalResponses }} Beiträge
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
      .route-button {
        align-self: flex-start;
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
      .rsvp-button.rsvp-yes.is-active {
        border-color: #16a34a;
        background: rgba(22, 163, 74, 0.18);
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
  protected readonly rsvp = signal<RsvpAnswer | null>(null);
  protected readonly formatDateTime = formatDateTime;
  protected readonly eventStatusLabel = eventStatusLabel;

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    const eventId = this.route.snapshot.paramMap.get('eventId') ?? '';
    this.load.run(
      forkJoin({
        event: this.api.getEvent(eventId),
        participants: this.api.listParticipants(eventId),
        moments: this.api.listMoments(eventId).pipe(catchError(() => of([]))),
        history: this.api.listMomentHistory(eventId).pipe(catchError(() => of([]))),
        profile: this.api.loadProfile().pipe(catchError(() => of(null))),
      }),
      (data) => {
        if (data.profile && data.participants.some((p) => p.userId === data.profile?.id)) {
          this.rsvp.set('yes');
        }
      },
    );
  }

  /** Speichert die gewählte RSVP-Antwort und synchronisiert sie mit dem Backend. */
  protected setRsvp(answer: RsvpAnswer): void {
    const prev = this.rsvp();
    this.rsvp.set(answer);
    const view = this.load.data();
    if (!view || !view.profile) return;
    const eventId = view.event.id;
    const userId = view.profile.id;
    const isParticipant = view.participants.some((p) => p.userId === userId);

    if (answer === 'yes' && !isParticipant) {
      this.api.addParticipant(eventId, { userId, role: 'participant' }).subscribe({
        next: (participant) => {
          this.load.data.update((curr) =>
            curr
              ? {
                  ...curr,
                  participants: [...curr.participants, participant],
                  event: { ...curr.event, participantCount: curr.event.participantCount + 1 },
                }
              : curr,
          );
        },
        error: () => {
          this.rsvp.set(prev);
        },
      });
    } else if (answer === 'no' && isParticipant) {
      this.api.removeParticipant(eventId, userId).subscribe({
        next: () => {
          this.load.data.update((curr) =>
            curr
              ? {
                  ...curr,
                  participants: curr.participants.filter((p) => p.userId !== userId),
                  event: { ...curr.event, participantCount: Math.max(0, curr.event.participantCount - 1) },
                }
              : curr,
          );
        },
        error: () => {
          this.rsvp.set(prev);
        },
      });
    }
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
        return 'Co-Gastgeber';
      case 'participant':
        return 'Teilnehmer';
      default:
        return role;
    }
  }

  /** Farbton des Teilnehmer-Status-Chips. */
  protected participantTone(role: string): StatusTone {
    return role === 'coHost' ? 'success' : 'neutral';
  }
}
