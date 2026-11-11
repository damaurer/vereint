import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, type Observable } from 'rxjs';
import { CatalogApiService, type DrinkSummaryDto, type TallyCategoryDto } from './catalog-api.service';
import { AsyncState } from '../member/async-state';
import { formatMoney } from '../member/member-format';
import { describeApiError } from '../api/api-client.service';
import { IconComponent } from '../ui/icon.component';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

interface TallyCategoriesData {
  categories: TallyCategoryDto[];
  drinks: DrinkSummaryDto[];
}

/**
 * Strich-Kategorien (Issue #80): Der Vorstand legt die Spalten der
 * Strichliste am Thekenterminal fest, mit Preis je Strich und Reihenfolge, und
 * ordnet die Getränke zu. Der Kategoriepreis gilt im Event für alle
 * zugeordneten Getränke und überschreibt deren eigenen Preis. Berechtigung
 * (`catalog.approve`) prüft der Fachservice bei jedem Aufruf.
 */
@Component({
  selector: 'app-tally-categories',
  imports: [FormsModule, IconComponent, StateComponent, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="tally-title">
        <div class="tally-header">
          <div>
            <span class="eyebrow">{{ 'catalog.tally.eyebrow' | t }}</span>
            <h1 id="tally-title">{{ 'catalog.tally.title' | t }}</h1>
          </div>
          <button type="button" class="member-button" (click)="toggleCreate()">
            {{ 'catalog.tally.create' | t }}
          </button>
        </div>
        <p class="tally-info">{{ 'catalog.tally.intro' | t }}</p>

        @if (error(); as err) {
          <p class="tally-error" role="alert">{{ err }}</p>
        }

        @if (creating()) {
          <form class="tally-create" (submit)="create($event)">
            <label class="form-field">
              <span>{{ 'catalog.tally.name' | t }}</span>
              <input name="newName" [(ngModel)]="newName" maxlength="64" required autocomplete="off" />
            </label>
            <label class="form-field">
              <span>{{ 'catalog.tally.pricePerTally' | t }}</span>
              <input name="newPrice" type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="newPrice" required />
            </label>
            <button type="submit" class="member-button" [disabled]="busy()">{{ 'common.save' | t }}</button>
          </form>
        }

        @if (load.isLoading()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" />
        } @else if (load.isError()) {
          <vereint-state kind="error" [title]="'catalog.tally.loadError' | t" [message]="load.errorMessage()" (retry)="reload()" />
        } @else if (load.data(); as data) {
          @if (data.categories.length === 0) {
            <vereint-state kind="empty" [title]="'catalog.tally.emptyTitle' | t" [message]="'catalog.tally.emptyMessage' | t" />
          }
          <ul class="tally-list">
            @for (category of data.categories; track category.id; let first = $first; let last = $last) {
              <li class="tally-card">
                <div class="tally-card-head">
                  <input
                    class="tally-name-input"
                    [attr.aria-label]="'catalog.tally.name' | t"
                    [value]="category.name"
                    maxlength="64"
                    (change)="rename(category, $any($event.target).value)"
                  />
                  <label class="tally-price">
                    <span>{{ 'catalog.tally.pricePerTally' | t }}</span>
                    <input
                      type="number"
                      inputmode="decimal"
                      step="0.01"
                      min="0"
                      [value]="category.price"
                      (change)="changePrice(category, $any($event.target).value)"
                    />
                    <span aria-hidden="true">€</span>
                  </label>
                </div>
                <div class="tally-chips">
                  @for (drink of category.drinks; track drink.id) {
                    <span class="tally-chip">
                      {{ drink.name }}
                      @if (differs(drink.defaultPrice, category.price)) {
                        <s class="tally-own-price">{{ money(drink.defaultPrice, drink.currency) }}</s>
                      }
                      <button
                        type="button"
                        class="tally-chip-remove"
                        [disabled]="busy()"
                        [attr.aria-label]="'catalog.tally.unassign' | t: { name: drink.name }"
                        (click)="assign(drink.id, '')"
                      >
                        <vereint-icon name="close" />
                      </button>
                    </span>
                  } @empty {
                    <span class="tally-muted">{{ 'catalog.tally.noDrinks' | t }}</span>
                  }
                </div>
                <div class="tally-card-actions">
                  <button type="button" class="btn-secondary-sm" [disabled]="busy() || first" (click)="move(data.categories, category, -1)">
                    {{ 'catalog.tally.moveUp' | t }}
                  </button>
                  <button type="button" class="btn-secondary-sm" [disabled]="busy() || last" (click)="move(data.categories, category, 1)">
                    {{ 'catalog.tally.moveDown' | t }}
                  </button>
                  <button type="button" class="btn-secondary-sm tally-delete" [disabled]="busy()" (click)="remove(category)">
                    {{ 'catalog.tally.delete' | t }}
                  </button>
                </div>
              </li>
            }
          </ul>

          <section class="tally-none" aria-labelledby="tally-none-title">
            <h2 id="tally-none-title">{{ 'catalog.tally.withoutTitle' | t }}</h2>
            @for (drink of uncategorized(); track drink.id) {
              <div class="tally-none-row">
                <span>{{ drink.name }} · {{ money(drink.defaultPrice, drink.currency) }}</span>
                <select
                  [attr.aria-label]="'catalog.tally.assignTo' | t: { name: drink.name }"
                  [disabled]="busy() || data.categories.length === 0"
                  (change)="assign(drink.id, $any($event.target).value)"
                >
                  <option value="">{{ 'catalog.tally.assign' | t }}</option>
                  @for (category of data.categories; track category.id) {
                    <option [value]="category.id">{{ category.name }}</option>
                  }
                </select>
              </div>
            } @empty {
              <p class="tally-muted">{{ 'catalog.tally.allAssigned' | t }}</p>
            }
          </section>
        }
      </section>
    </main>
  `,
  styles: [
    `
      .tally-header {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .tally-info {
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-md);
        background: var(--color-brand-soft);
        color: var(--color-text);
      }
      .tally-error {
        color: var(--color-danger);
        font-weight: 600;
      }
      .tally-create {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: var(--space-2);
        margin-bottom: var(--space-3);
      }
      .tally-list {
        display: grid;
        gap: var(--space-2);
        margin: 0 0 var(--space-3);
        padding: 0;
        list-style: none;
      }
      .tally-card {
        display: grid;
        gap: var(--space-2);
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background: var(--color-surface-raised);
      }
      .tally-card-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .tally-name-input {
        flex: 1 1 10rem;
        min-height: var(--vereint-control-height);
        border: 1px solid transparent;
        border-radius: var(--vereint-control-radius);
        background: transparent;
        color: var(--color-text);
        font: inherit;
        font-size: 1.15rem;
        font-weight: 800;
      }
      .tally-name-input:hover,
      .tally-name-input:focus {
        border-color: var(--color-border-dark);
      }
      .tally-price {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        color: var(--color-text-muted);
      }
      .tally-price input {
        width: 6rem;
        min-height: var(--vereint-control-height);
        text-align: right;
        font-weight: 700;
      }
      .tally-chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1);
      }
      .tally-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.3rem 0.4rem 0.3rem 0.8rem;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        background: var(--color-surface-subtle);
      }
      .tally-own-price {
        color: var(--color-text-muted);
      }
      .tally-chip-remove {
        display: inline-flex;
        padding: 0.2rem;
        border: 0;
        border-radius: 50%;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      .tally-card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1);
      }
      .tally-delete {
        color: var(--color-danger);
      }
      .tally-muted {
        color: var(--color-text-muted);
      }
      .tally-none {
        padding: var(--space-3);
        border: 1px dashed var(--color-border-dark);
        border-radius: var(--radius-lg);
      }
      .tally-none h2 {
        margin: 0 0 var(--space-2);
        font-size: 1.05rem;
      }
      .tally-none-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        padding: var(--space-1) 0;
      }
      .tally-none-row select {
        min-height: var(--vereint-control-height);
        min-width: 10rem;
      }
    `,
  ],
})
export class TallyCategoriesComponent implements OnInit, OnDestroy {
  private readonly api = inject(CatalogApiService);

  protected readonly load = new AsyncState<TallyCategoriesData>();
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected newName = '';
  protected newPrice: number | null = null;

  /** Freigegebene Getränke im Sortiment ohne Kategorie. */
  protected readonly uncategorized = computed(() =>
    (this.load.data()?.drinks ?? []).filter((d) => d.status === 'approved' && d.active && !d.tallyCategoryId),
  );

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.load.run(forkJoin({ categories: this.api.listTallyCategories(), drinks: this.api.listDrinks() }));
  }

  protected money(amount: number, currency: string): string {
    return formatMoney(String(amount), currency);
  }

  protected differs(a: number, b: number): boolean {
    return Math.abs(Number(a) - Number(b)) >= 0.005;
  }

  protected toggleCreate(): void {
    this.creating.update((open) => !open);
    this.error.set(null);
  }

  protected create(event: Event): void {
    event.preventDefault();
    const name = this.newName.trim();
    if (!name || this.newPrice === null || Number(this.newPrice) < 0) {
      this.error.set(translate('catalog.tally.required'));
      return;
    }
    this.run(this.api.createTallyCategory({ name, price: Number(this.newPrice) }), () => {
      this.newName = '';
      this.newPrice = null;
      this.creating.set(false);
    });
  }

  protected rename(category: TallyCategoryDto, value: string): void {
    const name = value.trim();
    if (!name || name === category.name) return;
    this.run(this.api.updateTallyCategory(category.id, { name }));
  }

  protected changePrice(category: TallyCategoryDto, value: string): void {
    const price = Number(value);
    if (value === '' || !Number.isFinite(price) || price < 0) {
      this.error.set(translate('catalog.tally.required'));
      return;
    }
    if (!this.differs(price, category.price)) return;
    this.run(this.api.updateTallyCategory(category.id, { price }));
  }

  protected move(categories: TallyCategoryDto[], category: TallyCategoryDto, delta: number): void {
    const ids = categories.map((c) => c.id);
    const from = ids.indexOf(category.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    this.run(this.api.reorderTallyCategories(ids));
  }

  protected remove(category: TallyCategoryDto): void {
    if (typeof window !== 'undefined' && !window.confirm(translate('catalog.tally.confirmDelete', { name: category.name }))) {
      return;
    }
    this.run(this.api.deleteTallyCategory(category.id));
  }

  protected assign(drinkId: string, categoryId: string): void {
    this.run(this.api.assignTallyCategory(drinkId, categoryId));
  }

  private run(source: Observable<unknown>, onSuccess?: () => void): void {
    this.busy.set(true);
    this.error.set(null);
    source.subscribe({
      next: () => {
        this.busy.set(false);
        onSuccess?.();
        this.reload();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(describeApiError(err));
      },
    });
  }
}
