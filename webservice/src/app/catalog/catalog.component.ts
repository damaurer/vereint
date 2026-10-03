import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import {
  CatalogApiService,
  type DrinkDto,
  type DrinkSummaryDto,
  type FoodSummaryDto,
  type FoodDto,
  type ProposeDrinkRequest,
  type CreateFoodRequest,
} from './catalog-api.service';
import { AsyncState } from '../member/async-state';
import {
  ModalComponent,
  StatusBadgeComponent,
  type StatusTone,
} from '../ui';

type CatalogTab = 'drinks' | 'food';

@Component({
  selector: 'app-catalog',
  imports: [FormsModule, ModalComponent, StatusBadgeComponent],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="catalog-title">
        <div class="catalog-header">
          <div>
            <span class="eyebrow">Vereinskatalog</span>
            <h1 id="catalog-title">Getränke- &amp; Speisenkatalog</h1>
            <p>Übersicht aller Vereinsgetränke, Barcodes und Verpflegungsangebote.</p>
          </div>
          <div class="catalog-header-actions">
            @if (activeTab() === 'drinks') {
              <button type="button" class="member-button" (click)="openProposeModal()">
                + Getränk vorschlagen
              </button>
            } @else if (isBoardOrAdmin()) {
              <button type="button" class="member-button" (click)="openCreateFoodModal()">
                + Neue Speise anlegen
              </button>
            }
          </div>
        </div>

        <!-- Tabs -->
        <nav class="catalog-tabs" aria-label="Katalogbereiche">
          <button
            type="button"
            class="tab-btn"
            [class.active]="activeTab() === 'drinks'"
            (click)="setTab('drinks')"
          >
            🍺 Getränkekatalog
          </button>
          <button
            type="button"
            class="tab-btn"
            [class.active]="activeTab() === 'food'"
            (click)="setTab('food')"
          >
            🍽️ Speisenkatalog
          </button>
        </nav>

        <!-- Search & Filter Controls -->
        <div class="catalog-filter-bar">
          <input
            type="search"
            class="filter-input search-input"
            [(ngModel)]="searchQuery"
            placeholder="Suchen nach Name oder Kategorie …"
          />

          @if (activeTab() === 'drinks' && isBoardOrAdmin()) {
            <select class="filter-input select-input" [(ngModel)]="statusFilter" (change)="reload()">
              <option value="">Alle Status</option>
              <option value="approved">Nur Freigegebene</option>
              <option value="proposed">Nur Vorgeschlagene</option>
              <option value="rejected">Nur Abgelehnte</option>
            </select>
          }
        </div>

        @if (load.isLoading()) {
          <div class="state-card" role="status" aria-live="polite">
            <strong>Wird geladen …</strong>
            <span>Katalogdaten werden abgerufen.</span>
          </div>
        } @else if (load.isError()) {
          <div class="state-card state-error" role="alert">
            <strong>Katalog nicht verfügbar</strong>
            <span>{{ load.errorMessage() }}</span>
            <button type="button" class="member-button" (click)="reload()">Erneut versuchen</button>
          </div>
        } @else {
          <!-- Drinks Tab Content -->
          @if (activeTab() === 'drinks') {
            @if (filteredDrinks().length === 0) {
              <div class="state-card" role="status">
                <strong>Keine Getränke gefunden</strong>
                <span>Es wurden keine passenden Getränke gefunden.</span>
              </div>
            } @else {
              <div class="catalog-grid">
                @for (drink of filteredDrinks(); track drink.id) {
                  <article class="catalog-card">
                    <div class="catalog-card-header">
                      <div>
                        <h3 class="catalog-card-title">{{ drink.name }}</h3>
                        <span class="catalog-card-category">{{ drink.category || 'Allgemein' }}</span>
                      </div>
                      <vereint-status-badge
                        [label]="drinkStatusLabel(drink.status)"
                        [tone]="drinkStatusTone(drink.status)"
                      />
                    </div>

                    <div class="catalog-card-price">
                      <span class="price-val">{{ formatPrice(drink.defaultPrice, drink.currency) }}</span>
                    </div>

                    <div class="catalog-card-actions">
                      <button
                        type="button"
                        class="btn-secondary-sm"
                        (click)="openDrinkDetail(drink.id)"
                      >
                        Details &amp; Barcodes
                      </button>

                      @if (isBoardOrAdmin() && drink.status === 'proposed') {
                        <button
                          type="button"
                          class="btn-primary-sm"
                          (click)="approveDrink(drink.id)"
                        >
                          Freigeben
                        </button>
                        <button
                          type="button"
                          class="btn-danger-sm"
                          (click)="rejectDrink(drink.id)"
                        >
                          Ablehnen
                        </button>
                      }
                    </div>
                  </article>
                }
              </div>
            }
          }

          <!-- Food Tab Content -->
          @if (activeTab() === 'food') {
            @if (filteredFoods().length === 0) {
              <div class="state-card" role="status">
                <strong>Keine Speisen gefunden</strong>
                <span>Es wurden keine passenden Speisen gefunden.</span>
              </div>
            } @else {
              <div class="catalog-grid">
                @for (food of filteredFoods(); track food.id) {
                  <article class="catalog-card">
                    <div class="catalog-card-header">
                      <div>
                        <h3 class="catalog-card-title">{{ food.name }}</h3>
                        <span class="catalog-card-category">{{ food.category || 'Allgemein' }}</span>
                      </div>
                      <vereint-status-badge
                        [label]="food.active ? 'Aktiv' : 'Inaktiv'"
                        [tone]="food.active ? 'success' : 'neutral'"
                      />
                    </div>

                    <div class="catalog-card-price">
                      <span class="price-val">{{ formatPrice(food.defaultPrice, food.currency) }}</span>
                    </div>

                    @if (isBoardOrAdmin()) {
                      <div class="catalog-card-actions">
                        <button
                          type="button"
                          class="btn-secondary-sm"
                          (click)="openEditFoodModal(food.id)"
                        >
                          Bearbeiten
                        </button>
                      </div>
                    }
                  </article>
                }
              </div>
            }
          }
        }
      </section>

      <!-- Propose Drink Modal -->
      <vereint-modal
        [open]="showProposeModal()"
        title="Getränk vorschlagen"
        (closed)="closeProposeModal()"
      >
        <form (submit)="submitDrinkProposal($event)" class="modal-form">
          <label class="form-field">
            <span>Name des Getränks *</span>
            <input [(ngModel)]="newDrinkName" name="name" required placeholder="z. B. Eber-Bräu Zwickl" />
          </label>

          <label class="form-field">
            <span>Kategorie</span>
            <input [(ngModel)]="newDrinkCategory" name="category" placeholder="z. B. Helles, Weizen, Alkoholfrei" />
          </label>

          <label class="form-field">
            <span>Standardpreis (€) *</span>
            <input
              type="number"
              step="0.10"
              min="0"
              [(ngModel)]="newDrinkPrice"
              name="price"
              required
              placeholder="z. B. 2.50"
            />
          </label>

          <label class="form-field">
            <span>Beschreibung</span>
            <textarea
              [(ngModel)]="newDrinkDescription"
              name="description"
              rows="3"
              placeholder="Besonderheiten, Brauerei, etc."
            ></textarea>
          </label>

          <label class="form-field">
            <span>Barcode (optional)</span>
            <input [(ngModel)]="newDrinkBarcode" name="barcode" placeholder="z. B. 4012345678901" />
          </label>

          @if (formError()) {
            <p class="form-error" role="alert">{{ formError() }}</p>
          }

          <div class="modal-actions">
            <button type="button" class="btn-secondary-sm" (click)="closeProposeModal()">Abbrechen</button>
            <button type="submit" class="member-button" [disabled]="submitting()">
              {{ submitting() ? 'Wird gespeichert …' : 'Vorschlag einreichen' }}
            </button>
          </div>
        </form>
      </vereint-modal>

      <!-- Drink Detail & Barcode Modal -->
      <vereint-modal
        [open]="showDrinkDetailModal()"
        [title]="selectedDrink()?.name ?? 'Getränkedetails'"
        (closed)="closeDrinkDetailModal()"
      >
        @if (selectedDrink(); as drink) {
          <div class="drink-detail-modal">
            <p class="drink-detail-meta">
              <strong>Kategorie:</strong> {{ drink.category || 'Allgemein' }} |
              <strong>Status:</strong> {{ drinkStatusLabel(drink.status) }} |
              <strong>Standardpreis:</strong> {{ formatPrice(drink.defaultPrice, drink.currency) }}
            </p>
            @if (drink.description) {
              <p class="drink-detail-desc">{{ drink.description }}</p>
            }

            <h4 class="barcode-heading">Zugeordnete Barcodes</h4>
            @if (drink.barcodes.length === 0) {
              <p class="text-muted">Keine Barcodes hinterlegt.</p>
            } @else {
              <ul class="barcode-list">
                @for (bc of drink.barcodes; track bc.id) {
                  <li class="barcode-item">
                    <code>{{ bc.barcode }}</code>
                    @if (isBoardOrAdmin()) {
                      <button
                        type="button"
                        class="btn-icon-danger"
                        title="Barcode entfernen"
                        (click)="removeBarcode(drink.id, bc.id)"
                      >
                        ✕
                      </button>
                    }
                  </li>
                }
              </ul>
            }

            @if (isBoardOrAdmin()) {
              <form class="barcode-add-form" (submit)="addBarcode($event, drink.id)">
                <input
                  type="text"
                  [(ngModel)]="newBarcodeValue"
                  name="newBarcode"
                  placeholder="Neuen Barcode erfassen …"
                  required
                />
                <button type="submit" class="member-button-sm" [disabled]="submitting()">
                  + Barcode hinzufügen
                </button>
              </form>
            }
          </div>
        }
      </vereint-modal>

      <!-- Food Create/Edit Modal -->
      <vereint-modal
        [open]="showFoodModal()"
        [title]="editingFoodId() ? 'Speise bearbeiten' : 'Neue Speise anlegen'"
        (closed)="closeFoodModal()"
      >
        <form (submit)="submitFoodForm($event)" class="modal-form">
          <label class="form-field">
            <span>Name der Speise *</span>
            <input [(ngModel)]="foodFormName" name="foodName" required placeholder="z. B. Bratwurstsemmel" />
          </label>

          <label class="form-field">
            <span>Kategorie</span>
            <input [(ngModel)]="foodFormCategory" name="foodCategory" placeholder="z. B. Grill, Snack, Vegetarisch" />
          </label>

          <label class="form-field">
            <span>Standardpreis (€) *</span>
            <input
              type="number"
              step="0.10"
              min="0"
              [(ngModel)]="foodFormPrice"
              name="foodPrice"
              required
              placeholder="z. B. 3.50"
            />
          </label>

          <label class="form-field">
            <span>Selbstkostenpreis (€)</span>
            <input
              type="number"
              step="0.10"
              min="0"
              [(ngModel)]="foodFormCostPrice"
              name="foodCostPrice"
              placeholder="z. B. 1.80"
            />
          </label>

          <label class="form-field">
            <span>Beschreibung</span>
            <textarea
              [(ngModel)]="foodFormDescription"
              name="foodDescription"
              rows="3"
              placeholder="Zutaten, Allergene, Hinweise"
            ></textarea>
          </label>

          @if (editingFoodId()) {
            <label class="form-field checkbox-field">
              <input type="checkbox" [(ngModel)]="foodFormActive" name="foodActive" />
              <span>Speise aktiv und bestellbar</span>
            </label>
          }

          @if (formError()) {
            <p class="form-error" role="alert">{{ formError() }}</p>
          }

          <div class="modal-actions">
            <button type="button" class="btn-secondary-sm" (click)="closeFoodModal()">Abbrechen</button>
            <button type="submit" class="member-button" [disabled]="submitting()">
              {{ submitting() ? 'Wird gespeichert …' : 'Speichern' }}
            </button>
          </div>
        </form>
      </vereint-modal>
    </main>
  `,
  styles: [
    `
      .catalog-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1.5rem;
      }
      .catalog-header-actions {
        display: flex;
        gap: 0.5rem;
      }
      .catalog-tabs {
        display: flex;
        gap: 0.5rem;
        border-bottom: 2px solid var(--color-border, #e2e8f0);
        margin-bottom: 1.5rem;
      }
      .tab-btn {
        padding: 0.6rem 1.2rem;
        font-weight: 600;
        font-size: 0.95rem;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        margin-bottom: -2px;
        color: var(--color-text-muted, #64748b);
        cursor: pointer;
        transition: all 0.2s;
      }
      .tab-btn:hover {
        color: var(--color-text, #0f172a);
      }
      .tab-btn.active {
        color: var(--color-brand, #3b82f6);
        border-bottom-color: var(--color-brand, #3b82f6);
      }
      .catalog-filter-bar {
        display: flex;
        gap: 1rem;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
      }
      .filter-input {
        padding: 0.6rem 0.9rem;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: var(--radius-md, 0.5rem);
        font: inherit;
        font-size: 0.9rem;
      }
      .search-input {
        flex: 1 1 240px;
      }
      .select-input {
        flex: 0 0 auto;
      }
      .catalog-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 1rem;
      }
      .catalog-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-md, 0.75rem);
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 0.75rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      }
      .catalog-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 0.5rem;
      }
      .catalog-card-title {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--color-text, #0f172a);
      }
      .catalog-card-category {
        font-size: 0.8rem;
        color: var(--color-text-muted, #64748b);
      }
      .catalog-card-price {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--color-brand, #3b82f6);
      }
      .catalog-card-actions {
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
        margin-top: auto;
      }
      .btn-primary-sm, .btn-secondary-sm, .btn-danger-sm {
        padding: 0.4rem 0.8rem;
        font-size: 0.8rem;
        font-weight: 600;
        border-radius: var(--radius-sm, 0.375rem);
        cursor: pointer;
        border: none;
      }
      .btn-primary-sm {
        background-color: var(--color-brand, #3b82f6);
        color: #ffffff;
      }
      .btn-secondary-sm {
        background-color: var(--color-surface-subtle, #f1f5f9);
        color: var(--color-text, #0f172a);
        border: 1px solid var(--color-border, #cbd5e1);
      }
      .btn-danger-sm {
        background-color: #fee2e2;
        color: #b91c1c;
      }
      .btn-icon-danger {
        background: none;
        border: none;
        color: #b91c1c;
        font-weight: bold;
        cursor: pointer;
        padding: 0.2rem 0.5rem;
      }
      .modal-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .form-field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        font-size: 0.9rem;
        font-weight: 600;
      }
      .form-field input, .form-field textarea {
        padding: 0.6rem;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: var(--radius-md, 0.5rem);
        font: inherit;
        font-weight: normal;
      }
      .checkbox-field {
        flex-direction: row;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
      }
      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        margin-top: 1rem;
      }
      .form-error {
        color: #b91c1c;
        font-size: 0.85rem;
        margin: 0;
      }
      .drink-detail-modal {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .drink-detail-meta {
        font-size: 0.9rem;
        margin: 0;
      }
      .drink-detail-desc {
        color: var(--color-text-muted, #64748b);
        font-size: 0.9rem;
        margin: 0;
      }
      .barcode-heading {
        margin: 0.5rem 0 0.25rem 0;
        font-size: 0.95rem;
      }
      .barcode-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .barcode-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--color-surface-subtle, #f8fafc);
        border: 1px solid var(--color-border, #e2e8f0);
        padding: 0.4rem 0.6rem;
        border-radius: var(--radius-sm, 0.375rem);
      }
      .barcode-add-form {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
      .barcode-add-form input {
        flex: 1 1 auto;
        padding: 0.4rem 0.6rem;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: var(--radius-sm, 0.375rem);
        font: inherit;
      }
      .member-button-sm {
        padding: 0.4rem 0.8rem;
        font-size: 0.85rem;
        font-weight: 600;
        background-color: var(--color-brand, #3b82f6);
        color: #ffffff;
        border: none;
        border-radius: var(--radius-sm, 0.375rem);
        cursor: pointer;
      }
    `,
  ],
})
export class CatalogComponent implements OnInit, OnDestroy {
  private readonly catalogApi = inject(CatalogApiService);
  private readonly auth = inject(AuthService);

  protected readonly activeTab = signal<CatalogTab>('drinks');
  protected readonly isBoardOrAdmin = signal(false);

  protected searchQuery = '';
  protected statusFilter = '';

  protected readonly load = new AsyncState<{
    drinks: DrinkSummaryDto[];
    foods: FoodSummaryDto[];
  }>();

  // Modals state
  protected readonly showProposeModal = signal(false);
  protected readonly showDrinkDetailModal = signal(false);
  protected readonly showFoodModal = signal(false);
  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  // Propose Drink Form
  protected newDrinkName = '';
  protected newDrinkCategory = '';
  protected newDrinkPrice: number | null = null;
  protected newDrinkDescription = '';
  protected newDrinkBarcode = '';

  // Selected Drink for Detail/Barcode
  protected readonly selectedDrink = signal<DrinkDto | null>(null);
  protected newBarcodeValue = '';

  // Food Form
  protected editingFoodId = signal<string | null>(null);
  protected foodFormName = '';
  protected foodFormCategory = '';
  protected foodFormPrice: number | null = null;
  protected foodFormCostPrice: number | null = null;
  protected foodFormDescription = '';
  protected foodFormActive = true;

  protected readonly filteredDrinks = computed(() => {
    const data = this.load.data();
    if (!data) return [];
    let list = data.drinks;
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.category && d.category.toLowerCase().includes(q)),
      );
    }
    return list;
  });

  protected readonly filteredFoods = computed(() => {
    const data = this.load.data();
    if (!data) return [];
    let list = data.foods;
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.category && f.category.toLowerCase().includes(q)),
      );
    }
    return list;
  });

  ngOnInit(): void {
    void this.checkRoles();
    this.reload();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  private async checkRoles(): Promise<void> {
    const session = await this.auth.getSession();
    const roles = session?.roles ?? [];
    this.isBoardOrAdmin.set(roles.includes('board') || roles.includes('admin'));
  }

  protected setTab(tab: CatalogTab): void {
    this.activeTab.set(tab);
  }

  protected reload(): void {
    this.load.run(
      forkJoin({
        drinks: this.catalogApi.listDrinks(this.statusFilter || undefined),
        foods: this.catalogApi.listFoods(),
      }),
    );
  }

  protected formatPrice(amount: number, currency = 'EUR'): string {
    const val = Number(amount) || 0;
    return `${val.toFixed(2)} ${currency}`;
  }

  protected drinkStatusLabel(status: string): string {
    switch (status) {
      case 'approved':
        return 'Freigegeben';
      case 'proposed':
        return 'Vorgeschlagen';
      case 'rejected':
        return 'Abgelehnt';
      default:
        return status;
    }
  }

  protected drinkStatusTone(status: string): StatusTone {
    switch (status) {
      case 'approved':
        return 'success';
      case 'proposed':
        return 'warning';
      case 'rejected':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  // Propose Drink
  protected openProposeModal(): void {
    this.newDrinkName = '';
    this.newDrinkCategory = '';
    this.newDrinkPrice = null;
    this.newDrinkDescription = '';
    this.newDrinkBarcode = '';
    this.formError.set(null);
    this.showProposeModal.set(true);
  }

  protected closeProposeModal(): void {
    this.showProposeModal.set(false);
  }

  protected submitDrinkProposal(event: Event): void {
    event.preventDefault();
    if (!this.newDrinkName.trim() || this.newDrinkPrice === null) {
      this.formError.set('Bitte füllen Sie alle Pflichtfelder aus.');
      return;
    }

    this.submitting.set(true);
    this.formError.set(null);

    const payload: ProposeDrinkRequest = {
      name: this.newDrinkName.trim(),
      category: this.newDrinkCategory.trim() || null,
      defaultPrice: this.newDrinkPrice,
      description: this.newDrinkDescription.trim() || null,
      currency: 'EUR',
      barcodes: this.newDrinkBarcode.trim() ? [this.newDrinkBarcode.trim()] : [],
    };

    this.catalogApi.proposeDrink(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeProposeModal();
        this.reload();
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.formError.set((err as Error)?.message || 'Fehler beim Einreichen des Vorschlags.');
      },
    });
  }

  // Approve / Reject
  protected approveDrink(id: string): void {
    this.catalogApi.approveDrink(id).subscribe({
      next: () => this.reload(),
    });
  }

  protected rejectDrink(id: string): void {
    this.catalogApi.rejectDrink(id).subscribe({
      next: () => this.reload(),
    });
  }

  // Drink Detail & Barcode
  protected openDrinkDetail(id: string): void {
    this.catalogApi.getDrink(id).subscribe({
      next: (drink) => {
        this.selectedDrink.set(drink);
        this.newBarcodeValue = '';
        this.showDrinkDetailModal.set(true);
      },
    });
  }

  protected closeDrinkDetailModal(): void {
    this.showDrinkDetailModal.set(false);
    this.selectedDrink.set(null);
  }

  protected addBarcode(event: Event, drinkId: string): void {
    event.preventDefault();
    const barcode = this.newBarcodeValue.trim();
    if (!barcode) return;

    this.submitting.set(true);
    this.catalogApi.addBarcode(drinkId, { barcode }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.newBarcodeValue = '';
        this.openDrinkDetail(drinkId);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.formError.set((err as Error)?.message || 'Fehler beim Hinzufügen des Barcodes.');
      },
    });
  }

  protected removeBarcode(drinkId: string, barcodeId: string): void {
    this.catalogApi.removeBarcode(drinkId, barcodeId).subscribe({
      next: () => this.openDrinkDetail(drinkId),
    });
  }

  // Food Management
  protected openCreateFoodModal(): void {
    this.editingFoodId.set(null);
    this.foodFormName = '';
    this.foodFormCategory = '';
    this.foodFormPrice = null;
    this.foodFormCostPrice = null;
    this.foodFormDescription = '';
    this.foodFormActive = true;
    this.formError.set(null);
    this.showFoodModal.set(true);
  }

  protected openEditFoodModal(id: string): void {
    this.catalogApi.getFood(id).subscribe({
      next: (food) => {
        this.editingFoodId.set(food.id);
        this.foodFormName = food.name;
        this.foodFormCategory = food.category || '';
        this.foodFormPrice = food.defaultPrice;
        this.foodFormCostPrice = food.costPrice;
        this.foodFormDescription = food.description || '';
        this.foodFormActive = food.active;
        this.formError.set(null);
        this.showFoodModal.set(true);
      },
    });
  }

  protected closeFoodModal(): void {
    this.showFoodModal.set(false);
    this.editingFoodId.set(null);
  }

  protected submitFoodForm(event: Event): void {
    event.preventDefault();
    if (!this.foodFormName.trim() || this.foodFormPrice === null) {
      this.formError.set('Bitte füllen Sie alle Pflichtfelder aus.');
      return;
    }

    this.submitting.set(true);
    this.formError.set(null);

    const editId = this.editingFoodId();
    if (editId) {
      this.catalogApi
        .updateFood(editId, {
          name: this.foodFormName.trim(),
          category: this.foodFormCategory.trim() || null,
          defaultPrice: this.foodFormPrice,
          costPrice: this.foodFormCostPrice,
          description: this.foodFormDescription.trim() || null,
          active: this.foodFormActive,
        })
        .subscribe({
          next: () => {
            this.submitting.set(false);
            this.closeFoodModal();
            this.reload();
          },
          error: (err: unknown) => {
            this.submitting.set(false);
            this.formError.set((err as Error)?.message || 'Fehler beim Speichern der Speise.');
          },
        });
    } else {
      const payload: CreateFoodRequest = {
        name: this.foodFormName.trim(),
        category: this.foodFormCategory.trim() || null,
        defaultPrice: this.foodFormPrice,
        costPrice: this.foodFormCostPrice,
        description: this.foodFormDescription.trim() || null,
        currency: 'EUR',
      };
      this.catalogApi.createFood(payload).subscribe({
        next: () => {
          this.submitting.set(false);
          this.closeFoodModal();
          this.reload();
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.formError.set((err as Error)?.message || 'Fehler beim Anlegen der Speise.');
        },
      });
    }
  }
}
