import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AsyncState } from './async-state';
import { MemberApiService } from './member-api.service';
import { eventStatusLabel, formatDateTime } from './member-format';
import type { EventStatus, EventSummary } from '../api/api.types';
import { EventCardComponent, type StatusTone } from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';

/**
 * Eventübersicht eines Mitglieds (TICKET-024, Redesign TICKET-034).
 *
 * Zeigt ausschließlich die serverseitig sichtbaren Events (Owner, Teilnehmer
 * bzw. Vorstand/Admin); die Sichtbarkeit entscheidet der Fachservice. Die
 * Darstellung nutzt die geteilte `EventCard` aus TICKET-032.
 */
@Component({
  selector: 'app-member-events',
  imports: [StateComponent, RouterLink, EventCardComponent, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="events-title">
        <span class="eyebrow">{{ 'member.events.eyebrow' | t }}</span>
        <h1 id="events-title">{{ 'member.events.title' | t }}</h1>
        <p>{{ 'member.events.intro' | t }}</p>

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
