import { Component, OnInit, computed, inject, output, signal } from '@angular/core';
import type { PurchasableDrink } from '../api/api.types';
import { TranslatePipe } from '../i18n';
import { MemberApiService } from '../member/member-api.service';
import { formatMoney } from '../member/member-format';

/**
 * Getränk aus dem Getränkekatalog der Gruppe wählen statt zu scannen (Issue #122).
 *
 * Zeigt nur Getränke, die man bezahlen kann (freigegeben, aktiv, mit Preis);
 * die Liste liefert der Fachservice für die aktuelle Gruppe. Eine Suche filtert
 * nach Name und Kategorie. Ein Tipp auf ein Getränk meldet es über [picked];
 * danach geht es wie nach einem Scan weiter.
 */
@Component({
  selector: 'vereint-catalog-picker',
  imports: [TranslatePipe],
  template: `
    <div class="picker">
      <label class="member-field">
        <span>{{ 'scan.catalog.searchLabel' | t }}</span>
        <input
          type="search"
          name="catalogSearch"
          autocomplete="off"
          enterkeyhint="search"
          [value]="query()"
          (input)="onQuery($event)"
          [placeholder]="'scan.catalog.searchPlaceholder' | t"
        />
      </label>

      @if (loading()) {
        <p class="member-muted" role="status">{{ 'scan.catalog.loading' | t }}</p>
      } @else if (failed()) {
        <p class="member-hint member-hint-error" role="alert">{{ 'scan.catalog.error' | t }}</p>
        <button type="button" class="member-button member-button-ghost" (click)="load()">
          {{ 'scan.catalog.reload' | t }}
        </button>
      } @else if (drinks().length === 0) {
        <p class="member-muted">{{ 'scan.catalog.empty' | t }}</p>
      } @else if (filtered().length === 0) {
        <p class="member-muted">{{ 'scan.catalog.noMatch' | t }}</p>
      } @else {
        <ul class="picker-list" [attr.aria-label]="'scan.catalog.listLabel' | t">
          @for (drink of filtered(); track drink.id) {
            <li>
              <button type="button" class="picker-item" (click)="picked.emit(drink)">
                <span class="picker-name">
                  <strong>{{ drink.name }}</strong>
                  @if (drink.category) {
                    <span class="member-muted">{{ drink.category }}</span>
                  }
                </span>
                <span class="member-amount">{{ money(drink.unitPrice, drink.currency) }}</span>
              </button>
            </li>
          }
        </ul>
        <p class="member-muted picker-hint">{{ 'scan.catalog.priceHint' | t }}</p>
      }
    </div>
  `,
  styles: [
    `
      .picker {
        display: grid;
        gap: 0.75rem;
        margin-top: 1rem;
      }

      .picker-list {
        display: grid;
        gap: 0.5rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .picker-item {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 0.75rem;
        align-items: center;
        width: 100%;
        min-height: 3.25rem;
        padding: 0.65rem 0.85rem;
        border: 1px solid var(--color-border);
        border-radius: 0.5rem;
        background: var(--color-surface, transparent);
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .picker-item:hover,
      .picker-item:focus-visible {
        border-color: var(--color-brand);
      }

      .picker-name {
        display: grid;
        gap: 0.1rem;
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .picker-name .member-muted,
      .picker-hint {
        font-size: 0.85rem;
      }
    `,
  ],
})
export class CatalogPickerComponent implements OnInit {
  private readonly api = inject(MemberApiService);

  readonly picked = output<PurchasableDrink>();

  protected readonly drinks = signal<PurchasableDrink[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly query = signal('');
  protected readonly money = formatMoney;

  /** Getränke, deren Name oder Kategorie den Suchbegriff enthält (ohne Groß-/Kleinschreibung). */
  protected readonly filtered = computed(() => {
    const needle = normalize(this.query());
    if (!needle) return this.drinks();
    return this.drinks().filter((drink) =>
      normalize(`${drink.name} ${drink.category ?? ''}`).includes(needle),
    );
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.listPayableDrinks().subscribe({
      next: (drinks) => {
        this.drinks.set(drinks);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
