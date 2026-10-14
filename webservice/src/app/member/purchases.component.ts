import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { map, switchMap } from 'rxjs';
import { AsyncState } from './async-state';
import { MemberApiService } from './member-api.service';
import { formatDateTime, formatMoney } from './member-format';
import type { LedgerEntry } from '../api/api.types';
import { StatusBadgeComponent } from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';

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
  imports: [StateComponent, IconComponent, StatusBadgeComponent, TranslatePipe],
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
            <ul class="receipt-list">
              @for (purchase of purchases; track purchase.id) {
                <li class="receipt">
                  @if (purchase.snapshot!.imageReference) {
                    <img
                      class="receipt-image"
                      [src]="purchase.snapshot!.imageReference"
                      [alt]="purchase.snapshot!.drinkName"
                    />
                  } @else {
                    <span class="receipt-image receipt-image-fallback" aria-hidden="true"><vereint-icon name="beer" /></span>
                  }
                  <div class="receipt-body">
                    <div class="receipt-head">
                      <span class="receipt-name">{{ purchase.snapshot!.drinkName }}</span>
                      <span class="receipt-price">
                        {{ formatMoney(purchase.snapshot!.unitPrice, purchase.snapshot!.currency) }}
                      </span>
                    </div>
                    <span class="receipt-meta">{{ formatDateTime(purchase.createdAt) }}</span>
                    <div class="receipt-tags">
                      @if (purchase.snapshot!.barcode) {
                        <span class="receipt-barcode">{{ 'member.purchases.barcode' | t: { code: purchase.snapshot!.barcode } }}</span>
                      }
                      <vereint-status-badge
                        [label]="'member.purchases.catalogVersion' | t: { version: purchase.snapshot!.catalogVersion }"
                      />
                    </div>
                  </div>
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
      .receipt-list {
        list-style: none;
        margin: 0.5rem 0 0;
        padding: 0;
        display: grid;
        gap: var(--space-2);
      }

      .receipt {
        display: flex;
        gap: var(--space-3);
        padding: var(--space-3);
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
      }

      .receipt-image {
        width: 2.75rem;
        height: 2.75rem;
        border-radius: var(--radius-sm);
        object-fit: cover;
        flex: none;
      }

      .receipt-image-fallback {
        display: grid;
        place-items: center;
        background-color: var(--color-brand-soft);
        font-size: 1.4rem;
      }

      .receipt-body {
        flex: 1;
        min-width: 0;
      }

      .receipt-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-2);
      }

      .receipt-name {
        color: var(--color-text);
        font-weight: 700;
        overflow-wrap: anywhere;
      }

      .receipt-price {
        color: var(--color-text);
        font-weight: 700;
        white-space: nowrap;
      }

      .receipt-meta {
        display: block;
        margin-top: 0.2rem;
        color: var(--color-text-muted);
        font-size: 0.85rem;
      }

      .receipt-tags {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-2);
        margin-top: 0.4rem;
      }

      .receipt-barcode {
        color: var(--color-text-muted);
        font-size: 0.85rem;
      }
    `,
  ],
})
export class PurchasesComponent implements OnInit, OnDestroy {
  private readonly api = inject(MemberApiService);

  protected readonly load = new AsyncState<LedgerEntry[]>();
  protected readonly formatMoney = formatMoney;
  protected readonly formatDateTime = formatDateTime;

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
