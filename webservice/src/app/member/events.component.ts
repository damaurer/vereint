import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { describeApiError } from '../api/api-client.service';
import { AsyncState } from './async-state';
import { MemberApiService, rsvpLabelKey, rsvpTone, type RsvpAnswer } from './member-api.service';
import { eventStatusLabel, formatDateTime, formatEventWhen } from './member-format';
import type { EventStatus, EventSummary } from '../api/api.types';
import { EventCardComponent, IconComponent, type StatusTone } from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

/**
 * Eventübersicht eines Mitglieds (TICKET-024, Redesign TICKET-034).
 *
 * Zeigt ausschließlich die serverseitig sichtbaren Events (Owner, Eingeladene
 * bzw. Vorstand/Admin); die Sichtbarkeit entscheidet der Fachservice. Die
 * Darstellung nutzt die geteilte `EventCard` aus TICKET-032. Eingeladene
 * antworten direkt in der Liste (`PUT /events/{id}/rsvp`); jedes Mitglied kann
 * über „Event anlegen“ ein eigenes Event erstellen.
 */
@Component({
  selector: 'app-member-events',
  imports: [StateComponent, RouterLink, EventCardComponent, IconComponent, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="events-title">
        <span class="eyebrow">{{ 'member.events.eyebrow' | t }}</span>
        <div class="events-head">
          <h1 id="events-title">{{ 'member.events.title' | t }}</h1>
          <a class="member-button events-create" routerLink="/events/new">
            <vereint-icon name="plus" /> {{ 'member.events.create' | t }}
          </a>
        </div>
        @if (rsvpError(); as error) {
          <p class="member-hint events-error" role="alert">{{ error }}</p>
        }

        @if (load.isLoading()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'member.events.loadingMessage' | t"
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            [title]="'member.events.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (load.data(); as events) {
          @if (events.length === 0) {
            <vereint-state
              kind="empty"
              [title]="'member.events.emptyTitle' | t"
              [message]="'member.events.emptyMessage' | t"
            />
          } @else {
            <div class="events-tabs" role="group" [attr.aria-label]="'member.events.rangeGroup' | t">
              <button type="button" class="events-tab" [attr.aria-pressed]="range() === 'upcoming'" (click)="range.set('upcoming')">
                {{ 'member.events.upcoming' | t }} · {{ upcoming(events).length }}
              </button>
              <button type="button" class="events-tab" [attr.aria-pressed]="range() === 'past'" (click)="range.set('past')">
                {{ 'member.events.past' | t }}
              </button>
            </div>
            @if (visible(events); as list) {
              @if (list.length === 0) {
                <vereint-state
                  kind="empty"
                  [title]="'member.events.emptyTitle' | t"
                  [message]="(range() === 'past' ? 'member.events.emptyPast' : 'member.events.emptyMessage') | t"
                />
              }
              <ul class="events-list">
                @for (event of list; track event.id) {
                  <li>
                    <vereint-event-card
                      [title]="event.title"
                      [when]="whenLine(event)"
                      [statusLabel]="badgeLabel(event)"
                      [statusTone]="badgeTone(event)"
                      [icons]="false"
                    >
                      <a class="events-cover" [routerLink]="['/events', event.id]" [attr.aria-label]="event.title"></a>
                      @if (event.myRsvp && canAnswer(event)) {
                        <div class="events-rsvp" role="group" [attr.aria-label]="'member.events.rsvpGroup' | t: { title: event.title }">
                          @if (event.myRsvp === 'accepted') {
                            <span class="events-state events-state-yes"><vereint-icon name="check" /> {{ 'member.events.attending' | t }}</span>
                          } @else {
                            @if (event.myRsvp === 'declined') {
                              <span class="events-state events-state-no">{{ 'member.events.declined' | t }}</span>
                            } @else if (event.myRsvp === 'maybe') {
                              <span class="events-state">{{ 'member.events.maybe' | t }}</span>
                            }
                            <div class="events-actions">
                              <button
                                type="button"
                                class="member-button events-accept"
                                [disabled]="busyId() === event.id"
                                (click)="respond(event.id, 'accepted')"
                              >
                                {{ 'member.rsvp.accept' | t }}
                              </button>
                              @if (event.myRsvp !== 'declined') {
                                <button
                                  type="button"
                                  class="events-decline"
                                  [disabled]="busyId() === event.id"
                                  (click)="respond(event.id, 'declined')"
                                >
                                  {{ 'member.rsvp.decline' | t }}
                                </button>
                              }
                            </div>
                          }
                        </div>
                      }
                    </vereint-event-card>
                  </li>
                }
              </ul>
            }
          }
        }
      </section>
    </main>
  `,
  styles: [
    `
      .events-tabs {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.25rem;
        margin: var(--space-3) 0;
        padding: 0.25rem;
        border-radius: 0.65rem;
        background-color: var(--color-surface-muted);
      }
      .events-tab {
        height: 2.25rem;
        border: none;
        border-radius: var(--radius-sm);
        background: transparent;
        color: var(--color-text-muted);
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
      }
      .events-tab[aria-pressed='true'] {
        background-color: var(--color-surface);
        color: var(--color-text);
        font-weight: 700;
        box-shadow: var(--vereint-shadow);
      }
      .events-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 0.75rem);
      }
      vereint-event-card {
        display: block;
      }
      /* Die ganze Karte öffnet das Event; die Antwort-Knöpfe liegen darüber. */
      .events-cover {
        position: absolute;
        inset: 0;
        border-radius: inherit;
      }
      .events-head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        justify-content: space-between;
        gap: 0.5rem 1rem;
      }
      .events-head h1 {
        margin: 0;
      }
      .events-create {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        min-height: 2.75rem;
        text-decoration: none;
      }
      .events-error {
        color: var(--color-danger);
      }
      .events-rsvp {
        position: relative;
        display: grid;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
      .events-state {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        color: var(--color-text-muted);
        font-size: 0.9rem;
        font-weight: 700;
      }
      .events-state-yes {
        color: var(--color-success);
      }
      .events-state-no {
        color: var(--color-danger);
      }
      .events-actions {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
        gap: 0.5rem;
      }
      .events-accept,
      .events-decline {
        min-height: 2.75rem;
        justify-content: center;
      }
      .events-decline {
        padding: 0 1rem;
        border: 1px solid var(--color-border-dark);
        border-radius: var(--radius-sm);
        background-color: var(--color-surface);
        color: var(--color-text);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .events-accept:disabled,
      .events-decline:disabled {
        opacity: 0.6;
        cursor: progress;
      }
    `,
  ],
})
export class EventsComponent implements OnInit, OnDestroy {
  private readonly api = inject(MemberApiService);

  protected readonly load = new AsyncState<EventSummary[]>();
  protected readonly formatDateTime = formatDateTime;
  protected readonly eventStatusLabel = eventStatusLabel;
  protected readonly rsvpLabelKey = rsvpLabelKey;
  protected readonly rsvpTone = rsvpTone;
  /** Event, dessen Antwort gerade gespeichert wird. */
  protected readonly busyId = signal<string | null>(null);
  protected readonly rsvpError = signal<string | null>(null);

  /** Reiter „Kommend“ bzw. „Vergangen“. */
  protected readonly range = signal<'upcoming' | 'past'>('upcoming');

  /** Laufende und noch nicht beendete Events, das nächste zuerst. */
  protected upcoming(events: EventSummary[], now: Date = new Date()): EventSummary[] {
    return events
      .filter((event) => !this.isPast(event, now))
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  }

  /** Events des gewählten Reiters; vergangene mit dem jüngsten zuerst. */
  protected visible(events: EventSummary[], now: Date = new Date()): EventSummary[] {
    if (this.range() === 'upcoming') return this.upcoming(events, now);
    return events
      .filter((event) => this.isPast(event, now))
      .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  }

  /** Vorbei ist ein Event, das abgeschlossen ist oder dessen Ende bzw. Beginn zurückliegt. */
  private isPast(event: EventSummary, now: Date): boolean {
    if (event.status === 'active') return false;
    if (event.status === 'completed' || event.status === 'archived') return true;
    // Ohne Ende gilt ein Event bis sechs Stunden nach Beginn als kommend.
    const end = event.endsAt ? Date.parse(event.endsAt) : Date.parse(event.startsAt) + 6 * 3600_000;
    return Number.isFinite(end) && end < now.getTime();
  }

  /** Zeile unter dem Titel: „Fr, 17. Okt · 18:30 · Vereinsheim“. */
  protected whenLine(event: EventSummary): string {
    const when = formatEventWhen(event.startsAt);
    return event.location ? `${when} · ${event.location}` : when;
  }

  /** Laufende Events sind „Aktiv“, offene Einladungen „Offen“, sonst der Eventstatus. */
  protected badgeLabel(event: EventSummary): string {
    if (event.status !== 'active' && event.myRsvp === 'invited' && this.canAnswer(event)) {
      return translate(rsvpLabelKey('invited'));
    }
    return eventStatusLabel(event.status);
  }

  protected badgeTone(event: EventSummary): StatusTone {
    if (event.status !== 'active' && event.myRsvp === 'invited' && this.canAnswer(event)) return 'neutral';
    return this.eventTone(event.status);
  }

  /** Antworten sind für veröffentlichte und laufende Events möglich. */
  protected canAnswer(event: EventSummary): boolean {
    return event.status === 'published' || event.status === 'active';
  }

  /** Speichert die eigene Antwort und übernimmt sie in die Liste. */
  protected respond(eventId: string, status: RsvpAnswer): void {
    this.busyId.set(eventId);
    this.rsvpError.set(null);
    this.api.respondToEvent(eventId, status).subscribe({
      next: (detail) => {
        this.busyId.set(null);
        const myRsvp = detail.myRsvp ?? status;
        this.load.data.update((list) =>
          list ? list.map((e) => (e.id === eventId ? { ...e, myRsvp } : e)) : list,
        );
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.rsvpError.set(describeApiError(error));
      },
    });
  }

  /** Ordnet den Eventstatus einer Badge-Farbe der geteilten Primitive zu. */
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

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.load.run(this.api.listEvents());
  }
}
