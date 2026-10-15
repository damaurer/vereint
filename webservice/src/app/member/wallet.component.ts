import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, switchMap } from 'rxjs';
import { AsyncState } from './async-state';
import { MemberApiService } from './member-api.service';
import { entryTypeLabel, formatDateTime, formatMoney } from './member-format';
import { translate } from '../i18n/i18n.service';
import type { LedgerEntry, MemberBalance, PurchaseSnapshot } from '../api/api.types';
import { BalanceCardComponent, InfoPanelComponent } from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';

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
  imports: [StateComponent, BalanceCardComponent, InfoPanelComponent, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="wallet-title">
        <span class="eyebrow">{{ 'member.wallet.eyebrow' | t }}</span>
        <h1 id="wallet-title">{{ 'member.wallet.title' | t }}</h1>


        @if (load.isLoading()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'member.wallet.loadingMessage' | t"
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            [title]="'member.wallet.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (load.data(); as view) {
          <vereint-balance-card
            [label]="'member.balance.current' | t"
            [amount]="formatMoney(view.balance.creditBalance, view.balance.currency)"
            [negative]="isNegative(view.balance.creditBalance)"
            [showTopup]="canManageTreasury()"
            (topup)="onTopup()"
          />

          <vereint-info-panel icon="treasury" [title]="'member.wallet.treasurerTitle' | t">
            {{ 'member.wallet.treasurerHint' | t }}
          </vereint-info-panel>

          <h2 class="member-subtitle">{{ 'member.wallet.historyHeading' | t }}</h2>
          @if (view.entries.length === 0) {
            <vereint-state
              kind="empty"
              [title]="'member.wallet.emptyTitle' | t"
              [message]="'member.wallet.emptyMessage' | t"
            />
          } @else {
            <div class="wallet-filter" role="group" [attr.aria-label]="'member.wallet.filter.label' | t">
              <button
                type="button"
                class="ui-chip"
                [class.ui-chip-accent]="filter() === 'all'"
                [attr.aria-pressed]="filter() === 'all'"
                (click)="filter.set('all')"
              >
                {{ 'member.wallet.filter.all' | t }}
              </button>
              <button
                type="button"
                class="ui-chip"
                [class.ui-chip-accent]="filter() === 'topup'"
                [attr.aria-pressed]="filter() === 'topup'"
                (click)="filter.set('topup')"
              >
                {{ 'member.wallet.filter.topup' | t }}
              </button>
              <button
                type="button"
                class="ui-chip"
                [class.ui-chip-accent]="filter() === 'spend'"
                [attr.aria-pressed]="filter() === 'spend'"
                (click)="filter.set('spend')"
              >
                {{ 'member.wallet.filter.spend' | t }}
              </button>
            </div>

            <ul class="member-list">
              @for (entry of visibleEntries(view.entries); track entry.id) {
                <li class="member-list-item">
                  <span class="member-list-title">{{ entryTitle(entry, view.entries) }}</span>
                  <span class="member-list-meta">
                    @if (hasItemTitle(entry, view.entries)) { {{ entryTypeLabel(entry.entryType) }} · }
                    {{ formatDateTime(entry.createdAt) }}
                  </span>
                  <span
                    class="member-amount"
                    [class.member-amount-negative]="isNegative(entry.amount)"
                  >
                    {{ formatMoney(entry.amount, entry.currency) }}
                  </span>
                </li>
              } @empty {
                <p class="member-muted">{{ 'member.wallet.filter.empty' | t }}</p>
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
  private readonly router = inject(Router);

  protected readonly load = new AsyncState<WalletView>();
  protected readonly filter = signal<LedgerFilter>('all');
  /** Nur Vorstand und Administration buchen Aufladungen (in der Kasse). */
  protected readonly canManageTreasury = signal(false);
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

  /**
   * Überschrift einer Buchung: bei Käufen der Artikel aus dem Beleg, bei einer
   * Rücknahme der Artikel des stornierten Kaufs, sonst die Buchungsart.
   */
  protected entryTitle(entry: LedgerEntry, entries: LedgerEntry[]): string {
    const own = itemName(entry.snapshot);
    if (own) return own;
    const reversed = itemName(this.reversedEntry(entry, entries)?.snapshot ?? null);
    if (reversed) return translate('member.wallet.reversal', { name: reversed });
    return entryTypeLabel(entry.entryType);
  }

  /** Ob die Überschrift einen Artikel nennt (dann steht die Buchungsart darunter). */
  protected hasItemTitle(entry: LedgerEntry, entries: LedgerEntry[]): boolean {
    return entryTypeLabel(entry.entryType) !== this.entryTitle(entry, entries);
  }

  private reversedEntry(entry: LedgerEntry, entries: LedgerEntry[]): LedgerEntry | undefined {
    if (!entry.reversesEntryId) return undefined;
    return entries.find((candidate) => candidate.id === entry.reversesEntryId);
  }

  /** Negatives Guthaben/Buchung (dezimale Zeichenkette) für rote Darstellung. */
  protected isNegative(amount: string): boolean {
    return Number(amount) < 0;
  }

  /**
   * Mitglieder laden nicht selbst auf. Vorstand/Admin springen in die Kasse,
   * wo die eigentliche Buchung erfolgt.
   */
  protected onTopup(): void {
    if (this.canManageTreasury()) void this.router.navigateByUrl('/board/treasury');
  }

  protected reload(): void {
    this.load.run(
      this.api.loadProfile().pipe(
        switchMap((profile) => {
          const roles: readonly string[] = profile.roles ?? [];
          this.canManageTreasury.set(roles.includes('board') || roles.includes('admin'));
          return forkJoin({
            balance: this.api.getBalance(profile.id),
            entries: this.api.listEntries(profile.id),
          });
        }),
      ),
    );
  }
}

/** Name des gekauften Artikels aus dem Beleg; Speisen tragen ihn in `foodName`. */
function itemName(snapshot: PurchaseSnapshot | null): string | null {
  return snapshot?.drinkName ?? snapshot?.foodName ?? null;
}
