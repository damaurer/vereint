import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { describeApiError } from '../api/api-client.service';
import { AsyncState } from './async-state';
import { MemberApiService, rsvpLabelKey, rsvpTone, type RsvpAnswer } from './member-api.service';
import { eventStatusLabel, formatDateTime } from './member-format';
import type { EventStatus, EventSummary } from '../api/api.types';
import { EventCardComponent, IconComponent, StatusBadgeComponent, type StatusTone } from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';

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
  imports: [StateComponent, RouterLink, EventCardComponent, IconComponent, StatusBadgeComponent, TranslatePipe],
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
        <p>{{ 'member.events.intro' | t }}</p>
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
            <ul class="events-list">
              @for (event of events; track event.id) {
                <li>
                  <a class="events-link" [routerLink]="['/events', event.id]">
                    <vereint-event-card
                      [title]="event.title"
                      [when]="formatDateTime(event.startsAt)"
                      [location]="event.location || event.ownerDisplayName"
                      [statusLabel]="eventStatusLabel(event.status)"
                      [statusTone]="eventTone(event.status)"
                    />
                  </a>
                  @if (event.myRsvp && canAnswer(event)) {
                    <div class="events-rsvp" role="group" [attr.aria-label]="'member.events.rsvpGroup' | t: { title: event.title }">
                      <vereint-status-badge [label]="rsvpLabelKey(event.myRsvp) | t" [tone]="rsvpTone(event.myRsvp)" />
                      @if (event.myRsvp !== 'accepted') {
                        <button
                          type="button"
                          class="events-rsvp-button events-accept"
                          [disabled]="busyId() === event.id"
                          (click)="respond(event.id, 'accepted')"
                        >
                          {{ 'member.rsvp.accept' | t }}
                        </button>
                      }
                      @if (event.myRsvp !== 'declined') {
                        <button
                          type="button"
                          class="events-rsvp-button events-decline"
                          [disabled]="busyId() === event.id"
                          (click)="respond(event.id, 'declined')"
                        >
                          {{ 'member.rsvp.decline' | t }}
                        </button>
                      }
                    </div>
                  }
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
      .events-list {
        list-style: none;
        margin: 0.5rem 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 0.75rem);
      }
      .events-link {
        display: block;
        text-decoration: none;
      }
      .events-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
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
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.4rem;
      }
      .events-rsvp-button {
        min-height: 2.75rem;
        padding: 0 1rem;
        border: 1px solid var(--color-border-dark);
        border-radius: 0.5rem;
        background: transparent;
        color: var(--color-text);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .events-accept {
        border-color: var(--color-success);
      }
      .events-rsvp-button:disabled {
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
