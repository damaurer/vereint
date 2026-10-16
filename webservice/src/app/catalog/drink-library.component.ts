import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, translate } from '../i18n';
import { apiErrorText } from '../stammtisch/stammtisch-api.service';
import { IconComponent } from '../ui/icon.component';
import { StateComponent } from '../ui/state.component';
import { CatalogApiService, type DrinkLibraryEntryDto } from './catalog-api.service';

/** Wie im Backend: Leerzeichen entfernen. */
function normalizeBarcode(value: string): string {
  return value.replace(/\s+/g, '');
}

/**
 * Gemeinsame Getränkedatenbank (`/catalog/library`).
 *
 * Alle Stammtische teilen sich diese Datenbank; sie enthält keine Preise. Ein
 * Eintrag wird über den normalen Vorschlag (`POST /drinks` mit
 * `libraryDrinkId`) in den eigenen Katalog übernommen, den Preis legt jeder
 * Stammtisch selbst fest.
 */
@Component({
  selector: 'app-drink-library',
  imports: [FormsModule, RouterLink, TranslatePipe, IconComponent, StateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../stammtisch/stammtisch.css',
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="library-title">
        <a class="member-back" routerLink="/catalog">{{ 'catalog.library.back' | t }}</a>
        <span class="eyebrow">{{ 'catalog.header.eyebrow' | t }}</span>
        <h1 id="library-title">{{ 'catalog.library.title' | t }}</h1>
        <p>{{ 'catalog.library.intro' | t }}</p>

        <form class="st-form" role="search" (ngSubmit)="search()">
          <div class="st-form-grid">
            <label>
              <span class="st-label">{{ 'catalog.library.searchLabel' | t }}</span>
              <input name="q" type="search" [(ngModel)]="query" maxlength="100" [placeholder]="'catalog.library.searchPlaceholder' | t" />
            </label>
            <label>
              <span class="st-label">{{ 'catalog.library.barcodeLabel' | t }}</span>
              <input name="barcode" inputmode="numeric" [(ngModel)]="barcode" maxlength="128" autocomplete="off" />
            </label>
          </div>
          <div class="st-actions">
            <button type="submit" class="member-button" [disabled]="loading()">
              <vereint-icon name="search" /> {{ 'catalog.library.search' | t }}
            </button>
          </div>
        </form>

        @if (success(); as done) {
          <p class="st-info" role="status">
            {{ done }} <a routerLink="/catalog">{{ 'catalog.library.toCatalog' | t }}</a>
          </p>
        }

        @if (loading()) {
          <vereint-state kind="loading" [title]="'common.loading' | t" />
        } @else if (loadError(); as message) {
          <vereint-state kind="error" [title]="'catalog.library.unavailable' | t" [message]="message" (retry)="search()" />
        } @else if (results().length === 0) {
          <vereint-state kind="empty" [title]="'catalog.library.empty' | t" [message]="'catalog.library.emptyHint' | t" />
        } @else {
          <ul class="member-list">
            @for (entry of results(); track entry.id) {
              <li class="member-list-item">
                <div class="st-row">
                  <span class="st-row-main">
                    <span class="member-list-title">{{ entry.name }}</span>
                    <span class="member-list-meta">{{ entry.category || ('catalog.card.generalCategory' | t) }}</span>
                    @if (entry.description) {
                      <span class="member-list-meta">{{ entry.description }}</span>
                    }
                    @if (entry.barcodes.length > 0) {
                      <span class="st-perms">
                        @for (code of entry.barcodes; track code) {
                          <code class="member-badge">{{ code }}</code>
                        }
                      </span>
                    }
                  </span>
                  @if (entry.catalogDrinkId) {
                    <span class="st-badge st-badge-brand">{{ 'catalog.library.inCatalog' | t }}</span>
                  } @else if (adoptingId() !== entry.id) {
                    <button type="button" class="member-button" (click)="startAdopt(entry)">
                      {{ 'catalog.library.adopt' | t }}
                    </button>
                  }
                </div>

                @if (adoptingId() === entry.id) {
                  <form class="st-form" (ngSubmit)="adopt(entry)">
                    <label>
                      <span class="st-label">{{ 'catalog.library.name' | t }}</span>
                      <input name="adoptName" [(ngModel)]="name" maxlength="255" required />
                    </label>
                    <div class="st-form-grid">
                      <label>
                        <span class="st-label">{{ 'catalog.library.category' | t }}</span>
                        <input name="adoptCategory" [(ngModel)]="category" maxlength="64" />
                      </label>
                      <label>
                        <span class="st-label">{{ 'catalog.library.price' | t }}</span>
                        <input name="adoptPrice" type="number" inputmode="decimal" min="0" step="0.01" [(ngModel)]="price" required />
                      </label>
                      <label>
                        <span class="st-label">{{ 'catalog.library.costPrice' | t }}</span>
                        <input name="adoptCostPrice" type="number" inputmode="decimal" min="0" step="0.01" [(ngModel)]="costPrice" />
                      </label>
                    </div>
                    <label>
                      <span class="st-label">{{ 'catalog.library.description' | t }}</span>
                      <textarea name="adoptDescription" rows="2" [(ngModel)]="description" maxlength="4000"></textarea>
                    </label>
                    <p class="member-hint member-muted">{{ 'catalog.library.priceHint' | t }}</p>
                    @if (formError(); as message) {
                      <p class="st-error" role="alert">{{ message }}</p>
                    }
                    <div class="st-actions" style="justify-content: flex-end">
                      <button type="button" class="member-button member-button-ghost" (click)="adoptingId.set(null)">
                        {{ 'common.cancel' | t }}
                      </button>
                      <button type="submit" class="member-button" [disabled]="busy()">
                        {{ 'catalog.library.adoptSubmit' | t }}
                      </button>
                    </div>
                  </form>
                }
              </li>
            }
          </ul>
        }
      </section>
    </main>
  `,
})
export class DrinkLibraryComponent implements OnInit {
  private readonly catalogApi = inject(CatalogApiService);

  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly results = signal<DrinkLibraryEntryDto[]>([]);
  protected readonly adoptingId = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  protected query = '';
  protected barcode = '';

  protected name = '';
  protected category = '';
  protected description = '';
  protected price: number | null = null;
  protected costPrice: number | null = null;
  private barcodes: string[] = [];

  ngOnInit(): void {
    this.search();
  }

  /** Mit Strichcode exakt, sonst nach Name oder Sorte (leer = erste Treffer). */
  protected search(): void {
    const barcode = normalizeBarcode(this.barcode);
    this.loading.set(true);
    this.loadError.set(null);
    this.adoptingId.set(null);
    this.catalogApi.searchLibrary(barcode ? { barcode } : { q: this.query.trim() }).subscribe({
      next: (entries) => {
        this.results.set(entries);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(apiErrorText(error));
        this.loading.set(false);
      },
    });
  }

  protected startAdopt(entry: DrinkLibraryEntryDto): void {
    this.name = entry.name;
    this.category = entry.category ?? '';
    this.description = entry.description ?? '';
    this.barcodes = [...entry.barcodes];
    this.price = null;
    this.costPrice = null;
    this.formError.set(null);
    this.success.set(null);
    this.adoptingId.set(entry.id);
  }

  protected adopt(entry: DrinkLibraryEntryDto): void {
    if (this.busy()) return;
    const name = this.name.trim();
    const price = this.price === null || (this.price as unknown) === '' ? NaN : Number(this.price);
    if (!name || !Number.isFinite(price) || price < 0) {
      this.formError.set(translate('catalog.library.priceRequired'));
      return;
    }
    const cost = this.costPrice === null || (this.costPrice as unknown) === '' ? null : Number(this.costPrice);
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
      this.formError.set(translate('catalog.library.priceRequired'));
      return;
    }
    this.busy.set(true);
    this.formError.set(null);
    this.catalogApi
      .proposeDrink({
        name,
        description: this.description.trim() || null,
        category: this.category.trim() || null,
        defaultPrice: price,
        ...(cost !== null ? { costPrice: cost } : {}),
        currency: 'EUR',
        barcodes: this.barcodes,
        libraryDrinkId: entry.id,
      })
      .subscribe({
        next: (created) => {
          this.busy.set(false);
          this.adoptingId.set(null);
          this.results.update((list) =>
            list.map((item) => (item.id === entry.id ? { ...item, catalogDrinkId: created.id } : item)),
          );
          this.success.set(
            translate(created.status === 'approved' ? 'catalog.library.adopted' : 'catalog.library.proposed', { name }),
          );
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.formError.set(apiErrorText(error));
        },
      });
  }
}
