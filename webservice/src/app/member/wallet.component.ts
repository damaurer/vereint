import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { forkJoin, switchMap } from 'rxjs';
import { AsyncState } from './async-state';
import { MemberApiService } from './member-api.service';
import { entryTypeLabel, formatDateTime, formatMoney } from './member-format';
import type { LedgerEntry, MemberBalance } from '../api/api.types';
import { BalanceCardComponent, InfoPanelComponent } from '../ui';
import { StateComponent } from '../ui/state.component';

interface WalletView {
  balance: MemberBalance;
  entries: LedgerEntry[];
}

/** Filterauswahl der Ledger-Historie (TICKET-033). */
type LedgerFilter = 'all' | 'topup' | 'spend';

/**
 * Guthaben und Kontoauszug eines Mitglieds (TICKET-024, Redesign TICKET-033).
 *
 * Ermittelt zunächst das eigene Profil (Mitglieds-ID) und lädt darüber Guthaben
 * und Buchungen. Die große Guthaben-Karte und die gefilterte Historie nutzen die
 * geteilten UI-Primitive (`BalanceCard`, `InfoPanel`). Beträge und Salden liefert
 * ausschließlich der Fachservice; die Ansicht rechnet nichts nach und filtert nur
 * clientseitig für die Anzeige.
 */
@Component({
  selector: 'app-member-wallet',
  imports: [StateComponent, BalanceCardComponent, InfoPanelComponent],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="wallet-title">
        <span class="eyebrow">Guthaben & Transaktionen</span>
        <h1 id="wallet-title">Bierkasse</h1>


        @if (load.isLoading()) {
          <vereint-state
            kind="loading"
            title="Wird geladen …"
            message="Guthaben und Buchungen werden abgerufen."
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            title="Guthaben nicht verfügbar"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (load.data(); as view) {
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

          <vereint-info-panel icon="treasury" title="Kassenwart">
            Guthaben wird vom Kassenwart verwaltet. Änderungen bedürfen einer Freigabe.
          </vereint-info-panel>

          <h2 class="member-subtitle">Historie</h2>
          @if (view.entries.length === 0) {
            <vereint-state
              kind="empty"
              title="Keine Buchungen"
              message="Für dein Konto liegen noch keine Buchungen vor."
            />
          } @else {
            <div class="wallet-filter" role="group" aria-label="Historie filtern">
              <button
                type="button"
                class="ui-chip"
                [class.ui-chip-accent]="filter() === 'all'"
                [attr.aria-pressed]="filter() === 'all'"
                (click)="filter.set('all')"
              >
                Alle
              </button>
              <button
                type="button"
                class="ui-chip"
                [class.ui-chip-accent]="filter() === 'topup'"
                [attr.aria-pressed]="filter() === 'topup'"
                (click)="filter.set('topup')"
              >
                Aufladungen
              </button>
              <button
                type="button"
                class="ui-chip"
                [class.ui-chip-accent]="filter() === 'spend'"
                [attr.aria-pressed]="filter() === 'spend'"
                (click)="filter.set('spend')"
              >
                Ausgaben
              </button>
            </div>

            <ul class="member-list">
              @for (entry of visibleEntries(view.entries); track entry.id) {
                <li class="member-list-item">
                  <span class="member-list-title">{{ entryTypeLabel(entry.entryType) }}</span>
                  <span class="member-list-meta">{{ formatDateTime(entry.createdAt) }}</span>
                  <span
                    class="member-amount"
                    [class.member-amount-negative]="isNegative(entry.amount)"
                  >
                    {{ formatMoney(entry.amount, entry.currency) }}
                  </span>
                </li>
              } @empty {
                <p class="member-muted">Keine Buchungen für diesen Filter.</p>
              }
            </ul>
          }
        }
      </section>
    </main>
  `,
  styles: [
    `
      .wallet-filter {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin: 0.25rem 0 var(--space-2);
      }

      .wallet-filter .ui-chip {
        cursor: pointer;
        font: inherit;
      }

      .member-amount-negative {
        color: var(--color-danger);
      }
    `,
  ],
})
export class WalletComponent implements OnInit, OnDestroy {
  private readonly api = inject(MemberApiService);

  protected readonly load = new AsyncState<WalletView>();
  protected readonly filter = signal<LedgerFilter>('all');
  protected readonly topupRequested = signal(false);
  protected readonly formatMoney = formatMoney;
  protected readonly formatDateTime = formatDateTime;
  protected readonly entryTypeLabel = entryTypeLabel;

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  /** Filtert die Historie clientseitig nach der gewählten Chip-Auswahl. */
  protected visibleEntries(entries: LedgerEntry[]): LedgerEntry[] {
    const active = this.filter();
    // Oben steht die neueste Buchung (der Server liefert aufsteigend).
    const newestFirst = [...entries].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
    if (active === 'topup') return newestFirst.filter((entry) => Number(entry.amount) > 0);
    if (active === 'spend') return newestFirst.filter((entry) => Number(entry.amount) < 0);
    return newestFirst;
  }

  /** Negatives Guthaben/Buchung (dezimale Zeichenkette) für rote Darstellung. */
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

  protected reload(): void {
    this.load.run(
      this.api.loadProfile().pipe(
        switchMap((profile) =>
          forkJoin({
            balance: this.api.getBalance(profile.id),
            entries: this.api.listEntries(profile.id),
          }),
        ),
      ),
    );
  }
}
