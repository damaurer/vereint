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
  StatCardComponent,
  type StatusTone,
} from '../ui';

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
            subtitle="Schön, dass du wieder da bist."
          />

          <h2 class="member-subtitle">Nächster Termin</h2>
          @if (nextEvent(view.events); as event) {
            <a class="dash-event-link" [routerLink]="['/events', event.id]">
              <vereint-event-card
                [title]="event.title"
                [when]="formatDateTime(event.startsAt)"
                [statusLabel]="eventStatusLabel(event.status)"
                [statusTone]="eventTone(event.status)"
              />
            </a>
          } @else {
            <p class="member-muted">Aktuell keine Events.</p>
          }

          <h2 class="member-subtitle">Guthaben</h2>
          <vereint-balance-card
            label="Dein Guthaben"
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

          <h2 class="member-subtitle">Diese Woche im Blick</h2>
          <div class="dash-grid">
            <vereint-stat-card
              icon="📅"
              label="Anstehende Events"
              [value]="view.events.length"
            />
            <vereint-stat-card
              icon="🧾"
              label="Buchungen"
              [value]="view.balance.entryCount"
            />
          </div>
        }
      </section>
    </main>
  `,
  styles: [
    `
      .dash-grid {
        display: grid;
        gap: var(--space-2);
        grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
        margin: 0.5rem 0;
      }

      .dash-event-link {
        display: block;
        margin-top: 0.5rem;
        text-decoration: none;
      }

      .dash-event-link:hover,
      .dash-event-link:focus-visible {
        text-decoration: none;
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

  ngOnInit(): void {
    this.reload();
  }

  /** Nächster (erster) Termin der geladenen Liste oder `null`. */
  protected nextEvent(events: EventSummary[]): EventSummary | null {
    return events.length > 0 ? events[0] : null;
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
