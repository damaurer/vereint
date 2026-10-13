import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AsyncState } from './async-state';
import { MemberApiService } from './member-api.service';
import { eventStatusLabel, formatDateTime } from './member-format';
import type { EventStatus, EventSummary } from '../api/api.types';
import { EventCardComponent, type StatusTone } from '../ui';

/**
 * Eventübersicht eines Mitglieds (TICKET-024, Redesign TICKET-034).
 *
 * Zeigt ausschließlich die serverseitig sichtbaren Events (Owner, Teilnehmer
 * bzw. Vorstand/Admin); die Sichtbarkeit entscheidet der Fachservice. Die
 * Darstellung nutzt die geteilte `EventCard` aus TICKET-032.
 */
@Component({
  selector: 'app-member-events',
  imports: [RouterLink, EventCardComponent],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="events-title">
        <span class="eyebrow">Mitglied</span>
        <h1 id="events-title">Events</h1>
        <p>Deine Events und Teilnahmen.</p>

        @if (load.isLoading()) {
          <div class="state-card" role="status" aria-live="polite">
            <strong>Wird geladen …</strong>
            <span>Die Events werden abgerufen.</span>
          </div>
        } @else if (load.isError()) {
          <div class="state-card state-error" role="alert">
            <strong>Events nicht verfügbar</strong>
            <span>{{ load.errorMessage() }}</span>
            <button type="button" class="member-button" (click)="reload()">Erneut versuchen</button>
          </div>
        } @else if (load.data(); as events) {
          @if (events.length === 0) {
            <div class="state-card" role="status">
              <strong>Keine Events</strong>
              <span>Aktuell nimmst du an keinem Event teil.</span>
            </div>
          } @else {
            <ul class="events-list">
              @for (event of events; track event.id) {
                <li>
                  <a class="events-link" [routerLink]="['/events', event.id]">
                    <vereint-event-card
                      [title]="event.title"
                      [when]="formatDateTime(event.startsAt)"
                      [location]="event.ownerDisplayName"
                      [statusLabel]="eventStatusLabel(event.status)"
                      [statusTone]="eventTone(event.status)"
                    />
                  </a>
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
    `,
  ],
})
export class EventsComponent implements OnInit, OnDestroy {
  private readonly api = inject(MemberApiService);

  protected readonly load = new AsyncState<EventSummary[]>();
  protected readonly formatDateTime = formatDateTime;
  protected readonly eventStatusLabel = eventStatusLabel;

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
