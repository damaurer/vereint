import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, map, switchMap } from 'rxjs';
import { AsyncState } from './async-state';
import { MemberApiService } from './member-api.service';
import { eventStatusLabel, formatDateTime, formatMoney } from './member-format';
import type { EventStatus, EventSummary, MemberBalance, MemberProfile } from '../api/api.types';
import {
  BalanceCardComponent,
  EventCardComponent,
  HeroGreetingComponent,
  IconComponent,
  StatCardComponent,
  type IconName,
  type StatusTone,
} from '../ui';

interface DashboardShortcut {
  route: string;
  icon: IconName;
  title: string;
  sub: string;
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
  imports: [
    RouterLink,
    HeroGreetingComponent,
    EventCardComponent,
    BalanceCardComponent,
    StatCardComponent,
    IconComponent,
  ],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-label="Persönliche Übersicht">
        @if (load.isLoading()) {
          <div class="state-card" role="status" aria-live="polite">
            <strong>Wird geladen …</strong>
            <span>Deine Übersicht wird abgerufen.</span>
          </div>
        } @else if (load.isError()) {
          <div class="state-card state-error" role="alert">
            <strong>Übersicht nicht verfügbar</strong>
            <span>{{ load.errorMessage() }}</span>
            <button type="button" class="member-button" (click)="reload()">Erneut versuchen</button>
          </div>
        } @else if (load.data(); as view) {
          <vereint-hero-greeting
            eyebrow="Servus"
            [name]="view.profile.displayName"
            [subtitle]="greeting()"
          />

          <div class="dash-top">
            <section class="dash-block" aria-labelledby="dash-balance">
              <h2 id="dash-balance" class="dash-heading">Dein Guthaben</h2>
              <vereint-balance-card
                label="Aktueller Stand"
                [amount]="formatMoney(view.balance.creditBalance, view.balance.currency)"
                [negative]="isNegative(view.balance.creditBalance)"
                [showTopup]="true"
                (topup)="onTopup()"
              />
              @if (topupRequested()) {
                <p class="member-hint" role="status">
                  Aufladungen erfolgen über den Kassenwart. Bitte sprich ihn direkt an.
                </p>
              }
              <a class="dash-more" routerLink="/wallet">
                Kontoauszug ansehen <vereint-icon name="chevron-right" />
              </a>
            </section>

            <section class="dash-block" aria-labelledby="dash-next">
              <h2 id="dash-next" class="dash-heading">Nächster Termin</h2>
              @if (nextEvent(view.events); as event) {
                <a class="dash-event-link" [routerLink]="['/events', event.id]">
                  <vereint-event-card
                    [title]="event.title"
                    [when]="formatDateTime(event.startsAt)"
                    [statusLabel]="eventStatusLabel(event.status)"
                    [statusTone]="eventTone(event.status)"
                  />
                </a>
                <a class="dash-more" routerLink="/events">
                  Alle Events <vereint-icon name="chevron-right" />
                </a>
              } @else {
                <div class="dash-empty">
                  <vereint-icon name="events" [size]="28" />
                  <p class="member-muted">Aktuell keine Events.</p>
                </div>
              }
            </section>
          </div>

          <div class="dash-grid">
            <vereint-stat-card icon="events" label="Deine Events" [value]="view.events.length" />
            <vereint-stat-card icon="receipt" label="Buchungen" [value]="view.balance.entryCount" />
          </div>

          <h2 class="dash-heading">Schnellzugriff</h2>
          <nav class="dash-shortcuts" aria-label="Schnellzugriff">
            @for (shortcut of shortcuts; track shortcut.route) {
              <a class="dash-shortcut-card" [routerLink]="shortcut.route">
                <span class="dash-shortcut-icon"><vereint-icon [name]="shortcut.icon" /></span>
                <span class="dash-shortcut-title">{{ shortcut.title }}</span>
                <span class="dash-shortcut-sub">{{ shortcut.sub }}</span>
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

  protected readonly load = new AsyncState<DashboardView>();
  protected readonly topupRequested = signal(false);
  protected readonly formatMoney = formatMoney;
  protected readonly formatDateTime = formatDateTime;
  protected readonly eventStatusLabel = eventStatusLabel;

  /** Kacheln „Schnellzugriff“: die Ziele hinter „Mehr“, die man oft braucht. */
  protected readonly shortcuts: readonly DashboardShortcut[] = [
    { route: '/moments', icon: 'moments', title: 'Moments', sub: 'Anstoßen & Rituale' },
    { route: '/catalog', icon: 'catalog', title: 'Getränkekatalog', sub: 'Getränke & Speisen' },
    { route: '/purchases', icon: 'receipt', title: 'Käufe', sub: 'Was du getrunken hast' },
    { route: '/notifications', icon: 'bell', title: 'Mitteilungen', sub: 'Neuigkeiten vom Verein' },
  ];

  /** Tageszeitabhängiger Untertitel der Begrüßung. */
  protected greeting(now: Date = new Date()): string {
    const hour = now.getHours();
    if (hour < 11) return 'Guten Morgen, schön dass du da bist.';
    if (hour < 17) return 'Schön, dass du wieder da bist.';
    return 'Guten Abend. Wer ist heute am Stammtisch?';
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
   * „Aufladen“ ist ein reiner UI-Hinweis: die eigentliche Buchung erfolgt
   * serverseitig durch den Kassenwart, nicht clientseitig.
   */
  protected onTopup(): void {
    this.topupRequested.set(true);
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
    );
  }
}
