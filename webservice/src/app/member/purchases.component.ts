import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { map, switchMap } from 'rxjs';
import { AsyncState } from './async-state';
import { MemberApiService } from './member-api.service';
import { formatDateTime, formatMoney, formatShortDateTime } from './member-format';
import type { LedgerEntry, PurchaseSnapshot } from '../api/api.types';
import { StatCardComponent } from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { activeLocale, translate } from '../i18n/i18n.service';

/**
 * Historische Käufe eines Mitglieds (TICKET-024, Redesign TICKET-033).
 *
 * Zeigt ausschließlich Buchungen mit unveränderlichem Beleg-Snapshot (Name,
 * Bild, Barcode, Preis, Katalogversion) als Belegkarten und teilt die
 * Katalogversion über das geteilte `StatusBadge`-Primitiv. Der Snapshot bleibt
 * auch bei späteren Katalog- oder Preisänderungen unverändert (siehe
 * `docs/fachkonzept.md`).
 */
@Component({
  selector: 'app-member-purchases',
  imports: [StateComponent, IconComponent, StatCardComponent, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="purchases-title">
        <span class="eyebrow">{{ 'member.purchases.eyebrow' | t }}</span>
        <h1 id="purchases-title">{{ 'member.purchases.title' | t }}</h1>
        <p>{{ 'member.purchases.intro' | t }}</p>


        @if (load.isLoading()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'member.purchases.loadingMessage' | t"
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            [title]="'member.purchases.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (load.data(); as purchases) {
          @if (purchases.length === 0) {
            <vereint-state
              kind="empty"
              [title]="'member.purchases.emptyTitle' | t"
              [message]="'member.purchases.emptyMessage' | t"
            />
          } @else {
            <div class="receipt-stats">
              <vereint-stat-card
                [label]="monthLabel()"
                [value]="formatMoney(monthTotal(purchases), currency(purchases))"
                [hint]="'member.purchases.count' | t: { count: monthCount(purchases) }"
              />
              @if (mostOften(purchases); as top) {
                <vereint-stat-card
                  class="receipt-stat-top"
                  [label]="'member.purchases.mostOften' | t"
                  [value]="top.name"
                  [hint]="'member.purchases.times' | t: { count: top.count }"
                />
              }
            </div>
            <ul class="receipt-list">
              @for (purchase of newestFirst(purchases); track purchase.id) {
                <li class="receipt">
                  @if (purchase.snapshot!.imageReference) {
                    <img
                      class="receipt-image"
                      [src]="purchase.snapshot!.imageReference"
                      [alt]="itemName(purchase.snapshot!)"
                    />
                  } @else {
                    <span class="receipt-image receipt-image-fallback" aria-hidden="true"><vereint-icon name="receipt" /></span>
                  }
                  <div class="receipt-body">
                    <span class="receipt-name">{{ itemName(purchase.snapshot!) }}</span>
                    <span class="receipt-meta">{{ formatShortDateTime(purchase.createdAt) }} · {{ origin(purchase) }}</span>
                    @if (purchase.snapshot!.barcode) {
                      <span class="receipt-barcode">{{ 'member.purchases.barcode' | t: { code: purchase.snapshot!.barcode } }}</span>
                    }
                  </div>
                  <span class="receipt-price">
                    {{ formatMoney(purchase.snapshot!.unitPrice, purchase.snapshot!.currency) }}
                  </span>
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
      .receipt-stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-2);
        margin: var(--space-3) 0;
      }

      .receipt-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        overflow: hidden;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background-color: var(--color-surface);
      }

      .receipt {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem var(--space-3);
      }

      .receipt + .receipt {
        border-top: 1px solid var(--color-border);
      }

      .receipt-image {
        width: 2.25rem;
        height: 2.25rem;
        border-radius: var(--radius-sm);
        object-fit: cover;
        flex: none;
      }

      .receipt-image-fallback {
        display: grid;
        place-items: center;
        background-color: var(--color-brand-soft);
        color: var(--color-brand);
        font-size: 1.15rem;
      }

      .receipt-body {
        display: grid;
        flex: 1;
        min-width: 0;
      }

      .receipt-name {
        color: var(--color-text);
        font-weight: 700;
        overflow-wrap: anywhere;
      }

      .receipt-price {
        color: var(--color-text);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .receipt-meta,
      .receipt-barcode {
        color: var(--color-text-muted);
        font-size: 0.8rem;
      }
    `,
  ],
})
export class PurchasesComponent implements OnInit, OnDestroy {
  private readonly api = inject(MemberApiService);

  protected readonly load = new AsyncState<LedgerEntry[]>();
  protected readonly formatMoney = formatMoney;
  protected readonly formatDateTime = formatDateTime;

  protected readonly formatShortDateTime = formatShortDateTime;

  /** Neueste Käufe zuerst (der Server liefert aufsteigend). */
  protected newestFirst(purchases: LedgerEntry[]): LedgerEntry[] {
    return [...purchases].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  /** Käufe im laufenden Kalendermonat. */
  private thisMonth(purchases: LedgerEntry[], now: Date = new Date()): LedgerEntry[] {
    return purchases.filter((purchase) => {
      const date = new Date(purchase.createdAt);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    });
  }

  /** Überschrift der Monatskachel, z. B. „November“. */
  protected monthLabel(now: Date = new Date()): string {
    return new Intl.DateTimeFormat(activeLocale(), { month: 'long' }).format(now);
  }

  protected monthTotal(purchases: LedgerEntry[]): string {
    const total = this.thisMonth(purchases).reduce((sum, purchase) => sum + Number(purchase.snapshot?.unitPrice ?? 0), 0);
    return total.toFixed(2);
  }

  protected monthCount(purchases: LedgerEntry[]): number {
    return this.thisMonth(purchases).length;
  }

  protected currency(purchases: LedgerEntry[]): string {
    return purchases[0]?.snapshot?.currency ?? 'EUR';
  }

  /** Am häufigsten gekaufter Artikel über alle Käufe. */
  protected mostOften(purchases: LedgerEntry[]): { name: string; count: number } | null {
    const counts = new Map<string, number>();
    for (const purchase of purchases) {
      const name = purchase.snapshot ? this.itemName(purchase.snapshot) : '';
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    let best: { name: string; count: number } | null = null;
    for (const [name, count] of counts) {
      if (!best || count > best.count) best = { name, count };
    }
    return best;
  }

  /** Herkunft des Kaufs: Scan, Strichliste, Runde, Speisen oder Katalogstand. */
  protected origin(purchase: LedgerEntry): string {
    const source = purchase.source;
    if (source && ['pwaBarcode', 'tabletManual', 'round', 'evening'].includes(source)) {
      return translate(`member.purchases.source.${source}`);
    }
    if (purchase.snapshot?.itemType === 'FOOD') return translate('member.purchases.food');
    const version = purchase.snapshot?.catalogVersion;
    return version != null ? translate('member.purchases.catalogVersion', { version }) : '';
  }

  /** Name des gekauften Artikels; Speisen tragen ihn in `foodName`. */
  protected itemName(snapshot: PurchaseSnapshot): string {
    return snapshot.drinkName ?? snapshot.foodName ?? '';
  }

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.load.run(
      this.api.loadProfile().pipe(
        switchMap((profile) => this.api.listEntries(profile.id)),
        map((entries) => entries.filter((entry) => entry.snapshot !== null)),
      ),
    );
  }
}
