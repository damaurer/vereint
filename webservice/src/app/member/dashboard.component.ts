import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, map, switchMap } from 'rxjs';
import { describeApiError } from '../api/api-client.service';
import { AsyncState } from './async-state';
import { MemberApiService, type RsvpAnswer } from './member-api.service';
import { eventStatusLabel, formatDateTime, formatMoney } from './member-format';
import type { EventStatus, EventSummary, MemberBalance, MemberProfile, RsvpStatus } from '../api/api.types';
import {
  BalanceCardComponent,
  EventCardComponent,
  HeroGreetingComponent,
  IconComponent,
  StatCardComponent,
  type IconName,
  type StatusTone,
} from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

interface DashboardShortcut {
  route: string;
  icon: IconName;
  titleKey: string;
  subKey: string;
}

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
            <section class="dash-block" aria-labelledby="dash-balance">
              <h2 id="dash-balance" class="dash-heading">{{ 'member.dashboard.balanceHeading' | t }}</h2>
              <vereint-balance-card
                [label]="'member.balance.current' | t"
                [amount]="formatMoney(view.balance.creditBalance, view.balance.currency)"
                [negative]="isNegative(view.balance.creditBalance)"
                [showTopup]="canTopup(view.profile)"
                (topup)="onTopup()"
              />
              <a class="dash-more" routerLink="/wallet">
                {{ 'member.dashboard.statementLink' | t }} <vereint-icon name="chevron-right" />
              </a>
            </section>

            <section class="dash-block" aria-labelledby="dash-next">
              <h2 id="dash-next" class="dash-heading">{{ 'member.dashboard.nextEventHeading' | t }}</h2>
              @if (nextEvent(view.events); as event) {
                <a class="dash-event-link" [routerLink]="['/events', event.id]">
                  <vereint-event-card
                    [title]="event.title"
                    [when]="formatDateTime(event.startsAt)"
                    [statusLabel]="eventStatusLabel(event.status)"
                    [statusTone]="eventTone(event.status)"
                  />
                </a>
                @if (rsvp(); as myAnswer) {
                  <div class="dash-rsvp" role="group" [attr.aria-label]="'member.dashboard.rsvpGroup' | t">
                    @if (myAnswer === 'accepted') {
                      <span class="dash-rsvp-state">
                        <vereint-icon name="check" /> {{ 'member.dashboard.attending' | t }}
                      </span>
                    } @else if (myAnswer === 'declined') {
                      <span class="dash-rsvp-state dash-rsvp-declined">{{ 'member.dashboard.declined' | t }}</span>
                    } @else if (myAnswer === 'maybe') {
                      <span class="dash-rsvp-state dash-rsvp-maybe">{{ 'member.dashboard.maybe' | t }}</span>
                    }
                    @if (myAnswer !== 'accepted') {
                      <button
                        type="button"
                        class="member-button dash-rsvp-primary"
                        [disabled]="rsvpBusy()"
                        (click)="answer(event.id, 'accepted')"
                      >
                        <vereint-icon name="check" /> {{ 'member.rsvp.accept' | t }}
                      </button>
                    }
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
                  </div>
                  @if (rsvpError(); as error) {
                    <p class="member-hint dash-rsvp-error" role="alert">{{ error }}</p>
                  }
                }
                <a class="dash-more" routerLink="/events">
                  {{ 'member.dashboard.allEvents' | t }} <vereint-icon name="chevron-right" />
                </a>
              } @else {
                <div class="dash-empty">
                  <vereint-icon name="events" [size]="28" />
                  <p class="member-muted">{{ 'member.dashboard.noEvents' | t }}</p>
                </div>
              }
            </section>
          </div>

          <div class="dash-grid">
            <vereint-stat-card icon="events" [label]="'member.dashboard.statEvents' | t" [value]="view.events.length" />
            <vereint-stat-card icon="receipt" [label]="'member.dashboard.statEntries' | t" [value]="view.balance.entryCount" />
          </div>

          <h2 class="dash-heading">{{ 'member.dashboard.shortcutsHeading' | t }}</h2>
          <nav class="dash-shortcuts" [attr.aria-label]="'member.dashboard.shortcutsHeading' | t">
            @for (shortcut of shortcuts; track shortcut.route) {
              <a class="dash-shortcut-card" [routerLink]="shortcut.route">
                <span class="dash-shortcut-icon"><vereint-icon [name]="shortcut.icon" /></span>
                <span class="dash-shortcut-title">{{ shortcut.titleKey | t }}</span>
                <span class="dash-shortcut-sub">{{ shortcut.subKey | t }}</span>
              </a>
            }
          </nav>
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
        margin-bottom: var(--space-3);
      }

      .dash-block {
        display: grid;
        align-content: start;
        gap: var(--space-1);
      }

      .dash-heading {
        margin: 0 0 0.25rem;
        color: var(--color-text);
        font-size: 1rem;
      }

      .dash-more {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        justify-self: start;
        min-height: 2.75rem;
        font-size: 0.9rem;
      }

      .dash-event-link {
        display: block;
        color: inherit;
        font-weight: inherit;
        text-decoration: none;
        border-radius: var(--radius-md);
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease;
      }

      .dash-event-link:hover,
      .dash-event-link:focus-visible {
        text-decoration: none;
        transform: translateY(-1px);
        box-shadow: var(--vereint-shadow);
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

      .dash-rsvp {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem 0.75rem;
        margin-top: 0.35rem;
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

      .dash-shortcuts {
        display: grid;
        gap: var(--space-2);
        grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
        margin: 0.5rem 0 1rem 0;
      }

      .dash-shortcut-card {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.2rem;
        padding: 0.9rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        text-decoration: none;
        transition:
          transform 0.15s ease,
          border-color 0.15s ease;
      }

      .dash-shortcut-card:hover,
      .dash-shortcut-card:focus-visible {
        border-color: var(--color-brand);
        text-decoration: none;
        transform: translateY(-2px);
      }

      .dash-shortcut-icon {
        display: grid;
        place-items: center;
        width: 2.5rem;
        height: 2.5rem;
        margin-bottom: 0.35rem;
        border-radius: var(--radius-sm);
        background-color: var(--color-brand-soft);
        color: var(--color-brand);
        font-size: 1.35rem;
      }

      .dash-shortcut-title {
        overflow-wrap: anywhere;
        hyphens: auto;
        font-weight: 700;
        font-size: 0.95rem;
        color: var(--color-text);
      }

      .dash-shortcut-sub {
        font-size: 0.78rem;
        font-weight: 500;
        color: var(--color-text-muted);
      }
    `,
  ],
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly api = inject(MemberApiService);
  private readonly router = inject(Router);

  protected readonly load = new AsyncState<DashboardView>();
  /** Eigene Antwort zum nächsten Termin: `null` = nicht eingeladen oder keine Antwort möglich. */
  protected readonly rsvp = signal<RsvpStatus | null>(null);
  protected readonly rsvpBusy = signal(false);
  protected readonly rsvpError = signal<string | null>(null);
  protected readonly formatMoney = formatMoney;
  protected readonly formatDateTime = formatDateTime;
  protected readonly eventStatusLabel = eventStatusLabel;

  /** Kacheln „Schnellzugriff“: die Ziele hinter „Mehr“, die man oft braucht. */
  protected readonly shortcuts: readonly DashboardShortcut[] = [
    {
      route: '/moments',
      icon: 'moments',
      titleKey: 'member.dashboard.shortcuts.moments.title',
      subKey: 'member.dashboard.shortcuts.moments.sub',
    },
    {
      route: '/catalog',
      icon: 'catalog',
      titleKey: 'member.dashboard.shortcuts.catalog.title',
      subKey: 'member.dashboard.shortcuts.catalog.sub',
    },
    {
      route: '/purchases',
      icon: 'receipt',
      titleKey: 'member.dashboard.shortcuts.purchases.title',
      subKey: 'member.dashboard.shortcuts.purchases.sub',
    },
    {
      route: '/notifications',
      icon: 'bell',
      titleKey: 'member.dashboard.shortcuts.notifications.title',
      subKey: 'member.dashboard.shortcuts.notifications.sub',
    },
  ];

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

  /**
   * Aufladen bucht nur der Vorstand bzw. Admin über die Kasse; Mitglieder
   * sehen den Button deshalb nicht (sie können ihr Guthaben nicht selbst aufladen).
   */
  protected canTopup(profile: MemberProfile): boolean {
    const roles = profile.roles ?? [];
    return roles.includes('board') || roles.includes('admin');
  }

  /** Führt Vorstand/Admin zur Kasse, wo Aufladungen gebucht werden. */
  protected onTopup(): void {
    void this.router.navigate(['/board/treasury']);
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
