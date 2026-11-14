import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, map, switchMap } from 'rxjs';
import { describeApiError } from '../api/api-client.service';
import { AsyncState } from './async-state';
import { MemberApiService, type RsvpAnswer } from './member-api.service';
import { eventStatusLabel, formatDateTime, formatEventWhen, formatMoney } from './member-format';
import type { EventStatus, EventSummary, MemberBalance, MemberProfile, RsvpStatus } from '../api/api.types';
import {
  BalanceCardComponent,
  EventCardComponent,
  HeroGreetingComponent,
  IconComponent,
  StatCardComponent,
  type StatusTone,
} from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

interface DashboardView {
  profile: MemberProfile;
  balance: MemberBalance;
  events: EventSummary[];
}

/**
 * Persönliche Einstiegsübersicht der Mitglieder-PWA (TICKET-024, Redesign
 * TICKET-033).
 *
 * Fasst Guthaben und den nächsten Termin zusammen und nutzt die geteilten
 * UI-Primitive (`HeroGreeting`, `EventCard`, `BalanceCard`, `StatCard`) aus
 * `src/app/ui/`, damit Mobil, Tablet und Web dieselbe visuelle Sprache
 * verwenden. Alle Daten stammen aus dem Fachservice; der Client aggregiert nur
 * die Anzeige.
 */
@Component({
  selector: 'app-member-dashboard',
  imports: [StateComponent, 
    RouterLink,
    HeroGreetingComponent,
    EventCardComponent,
    BalanceCardComponent,
    StatCardComponent,
    IconComponent,
    TranslatePipe,
  ],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" [attr.aria-label]="'member.dashboard.ariaLabel' | t">
        @if (load.isLoading()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'member.dashboard.loadingMessage' | t"
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            [title]="'member.dashboard.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (load.data(); as view) {
          <vereint-hero-greeting
            [eyebrow]="'member.dashboard.eyebrow' | t"
            [name]="view.profile.displayName"
            [subtitle]="greeting()"
          />

          <div class="dash-top">
            <section class="dash-block" [attr.aria-label]="'member.dashboard.balanceHeading' | t">
              <vereint-balance-card
                [label]="'member.dashboard.balanceHeading' | t"
                [amount]="formatMoney(view.balance.creditBalance, view.balance.currency)"
                [negative]="isNegative(view.balance.creditBalance)"
              >
                <a class="member-button dash-pay" routerLink="/scan">
                  <vereint-icon name="camera" /> {{ 'nav.items.scan' | t }}
                </a>
                <a class="dash-more" routerLink="/wallet">
                  {{ 'member.dashboard.statementShort' | t }} <vereint-icon name="chevron-right" />
                </a>
              </vereint-balance-card>
            </section>

            <section class="dash-block" aria-labelledby="dash-next">
              <div class="dash-head-row">
                <h2 id="dash-next" class="dash-heading">{{ 'member.dashboard.nextEventHeading' | t }}</h2>
                <a class="dash-head-link" routerLink="/events">{{ 'member.dashboard.allEvents' | t }}</a>
              </div>
              @if (nextEvent(view.events); as event) {
                <vereint-event-card
                  [title]="event.title"
                  [when]="formatEventWhen(event.startsAt)"
                  [location]="event.location ?? null"
                  [statusLabel]="eventStatusLabel(event.status)"
                  [statusTone]="eventTone(event.status)"
                >
                  <a class="dash-event-cover" [routerLink]="['/events', event.id]" [attr.aria-label]="event.title"></a>
                  @if (rsvp(); as myAnswer) {
                    <div class="ui-event-foot dash-rsvp" role="group" [attr.aria-label]="'member.dashboard.rsvpGroup' | t">
                      @if (myAnswer === 'accepted') {
                        <span class="dash-rsvp-state">
                          <vereint-icon name="check" /> {{ 'member.dashboard.attending' | t }}
                        </span>
                      } @else {
                        @if (myAnswer === 'declined') {
                          <span class="dash-rsvp-state dash-rsvp-declined">{{ 'member.dashboard.declined' | t }}</span>
                        } @else if (myAnswer === 'maybe') {
                          <span class="dash-rsvp-state dash-rsvp-maybe">{{ 'member.dashboard.maybe' | t }}</span>
                        }
                        <button
                          type="button"
                          class="member-button dash-rsvp-primary"
                          [disabled]="rsvpBusy()"
                          (click)="answer(event.id, 'accepted')"
                        >
                          <vereint-icon name="check" /> {{ 'member.rsvp.accept' | t }}
                        </button>
                        @if (myAnswer !== 'declined') {
                          <button
                            type="button"
                            class="dash-rsvp-secondary"
                            [disabled]="rsvpBusy()"
                            (click)="answer(event.id, 'declined')"
                          >
                            {{ 'member.rsvp.decline' | t }}
                          </button>
                        }
                      }
                    </div>
                  }
                </vereint-event-card>
                @if (rsvpError(); as error) {
                  <p class="member-hint dash-rsvp-error" role="alert">{{ error }}</p>
                }
              } @else {
                <div class="dash-empty">
                  <vereint-icon name="events" [size]="28" />
                  <p class="member-muted">{{ 'member.dashboard.noEvents' | t }}</p>
                </div>
              }
            </section>
          </div>

          <div class="dash-grid">
            <vereint-stat-card
              [label]="'member.dashboard.statEvents' | t"
              [value]="eventsThisMonth(view.events)"
              [hint]="'member.dashboard.statEventsHint' | t"
            />
            <vereint-stat-card
              [label]="'member.dashboard.statEntries' | t"
              [value]="view.balance.entryCount"
              [hint]="'member.dashboard.statEntriesHint' | t"
            />
          </div>

        }
      </section>
    </main>
  `,
  styles: [
    `
      .dash-top {
        display: grid;
        gap: var(--space-4);
        grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
        margin-bottom: var(--space-4);
      }

      .dash-block {
        display: grid;
        align-content: start;
        gap: 0.6rem;
      }

      .dash-head-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-2);
      }

      .dash-heading {
        margin: 0;
        color: var(--color-text);
        font-size: 1.05rem;
        font-weight: 700;
      }

      .dash-head-link {
        font-size: 0.9rem;
        font-weight: 600;
        text-decoration: none;
      }

      .dash-pay {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 2.75rem;
        text-decoration: none;
      }

      .dash-pay:hover,
      .dash-pay:focus-visible {
        text-decoration: none;
      }

      .dash-more {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        min-height: 2.75rem;
        font-size: 0.95rem;
        font-weight: 600;
        text-decoration: none;
      }

      vereint-event-card {
        display: block;
      }

      /* Die ganze Karte öffnet das Event; die Antwort-Knöpfe liegen darüber. */
      .dash-event-cover {
        position: absolute;
        inset: 0;
        border-radius: inherit;
      }

      .dash-rsvp {
        position: relative;
      }

      .dash-empty {
        display: grid;
        justify-items: center;
        gap: 0.35rem;
        padding: var(--space-4) var(--space-3);
        border: 1px dashed var(--color-border-dark);
        border-radius: var(--radius-md);
        color: var(--color-text-muted);
        text-align: center;
      }

      .dash-empty p {
        margin: 0;
      }

      .dash-rsvp-primary {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        min-height: 2.75rem;
      }
      .dash-rsvp-state {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        color: var(--color-success);
        font-weight: 700;
      }
      .dash-rsvp-declined {
        color: var(--color-danger);
      }
      .dash-rsvp-maybe {
        color: var(--color-text-muted);
      }
      .dash-rsvp-secondary {
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
      .dash-rsvp-secondary:disabled {
        opacity: 0.6;
        cursor: progress;
      }
      .dash-rsvp-error {
        color: var(--color-danger);
      }
      .dash-grid {
        display: grid;
        gap: var(--space-2);
        grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
        margin: 0 0 var(--space-4);
      }

    `,
  ],
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly api = inject(MemberApiService);

  protected readonly load = new AsyncState<DashboardView>();
  /** Eigene Antwort zum nächsten Termin: `null` = nicht eingeladen oder keine Antwort möglich. */
  protected readonly rsvp = signal<RsvpStatus | null>(null);
  protected readonly rsvpBusy = signal(false);
  protected readonly rsvpError = signal<string | null>(null);
  protected readonly formatMoney = formatMoney;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatEventWhen = formatEventWhen;
  protected readonly eventStatusLabel = eventStatusLabel;

  /** Events der Liste, die im laufenden Kalendermonat beginnen. */
  protected eventsThisMonth(events: EventSummary[], now: Date = new Date()): number {
    return events.filter((event) => {
      const start = new Date(event.startsAt);
      return start.getFullYear() === now.getFullYear() && start.getMonth() === now.getMonth();
    }).length;
  }

  /** Tageszeitabhängiger Untertitel der Begrüßung. */
  protected greeting(now: Date = new Date()): string {
    const hour = now.getHours();
    if (hour < 11) return translate('member.dashboard.greeting.morning');
    if (hour < 17) return translate('member.dashboard.greeting.day');
    return translate('member.dashboard.greeting.evening');
  }

  ngOnInit(): void {
    this.reload();
  }

  /**
   * Nächster anstehender Termin: der früheste nicht abgesagte Termin, der noch
   * nicht begonnen hat; sonst der erste Eintrag der Liste oder `null`.
   */
  protected nextEvent(events: EventSummary[], now: Date = new Date()): EventSummary | null {
    const upcoming = events
      .filter((event) => event.status !== 'cancelled' && Date.parse(event.startsAt) >= now.getTime())
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    return upcoming[0] ?? events[0] ?? null;
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

  /** Negatives Guthaben (dezimale Zeichenkette) für rote Darstellung. */
  protected isNegative(amount: string): boolean {
    return Number(amount) < 0;
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.load.run(
      this.api.loadProfile().pipe(
        switchMap((profile) =>
          forkJoin({
            balance: this.api.getBalance(profile.id),
            events: this.api.listEvents(),
          }).pipe(map((rest) => ({ profile, ...rest }))),
        ),
      ),
      (view) => this.loadAttendance(view),
    );
  }

  /** Zusagen ist nur für veröffentlichte oder laufende, nicht vergangene Termine möglich. */
  protected canRsvp(event: EventSummary, now: Date = new Date()): boolean {
    if (event.status === 'active') return true;
    return event.status === 'published' && Date.parse(event.startsAt) >= now.getTime();
  }

  /** Übernimmt die eigene Antwort zum nächsten Termin aus der Eventliste. */
  private loadAttendance(view: DashboardView): void {
    this.rsvpError.set(null);
    const event = this.nextEvent(view.events);
    this.rsvp.set(event && this.canRsvp(event) ? (event.myRsvp ?? null) : null);
  }

  /** Zu- oder Absage direkt von der Startseite (`PUT /events/{id}/rsvp`). */
  protected answer(eventId: string, status: RsvpAnswer): void {
    this.rsvpBusy.set(true);
    this.rsvpError.set(null);
    this.api.respondToEvent(eventId, status).subscribe({
      next: (event) => {
        this.rsvpBusy.set(false);
        this.rsvp.set(event.myRsvp ?? status);
      },
      error: (error: unknown) => {
        this.rsvpBusy.set(false);
        this.rsvpError.set(describeApiError(error));
      },
    });
  }
}
