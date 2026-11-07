import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  SublistsApiService,
  type SublistSummaryDto,
  type SublistDto,
  type CreateSublistRequest,
  type UpdateSublistRequest,
  type AddSublistItemRequest,
} from './sublists-api.service';
import { CatalogApiService, type DrinkSummaryDto } from '../catalog/catalog-api.service';
import { AsyncState } from '../member/async-state';
import { InfoPanelComponent, ModalComponent, StatusBadgeComponent } from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

@Component({
  selector: 'app-sublists',
  imports: [
    StateComponent,
    IconComponent,
    FormsModule,
    InfoPanelComponent,
    ModalComponent,
    StatusBadgeComponent,
    TranslatePipe,
  ],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="sublists-title">
        <div class="sublists-header">
          <div>
            <span class="eyebrow">{{ 'sublists.header.eyebrow' | t }}</span>
            <h1 id="sublists-title">{{ 'sublists.header.title' | t }}</h1>
            <p>{{ 'sublists.header.intro' | t }}</p>
          </div>
          <button type="button" class="member-button" (click)="openCreateModal()">
            {{ 'sublists.actions.create' | t }}
          </button>
        </div>

        <vereint-info-panel icon="lists" [title]="'sublists.info.title' | t">
          {{ 'sublists.info.body' | t }}
        </vereint-info-panel>

        @if (load.isLoading()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'sublists.state.loadingMessage' | t"
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            [title]="'sublists.state.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (load.data(); as sublists) {
          @if (sublists.length === 0) {
            <vereint-state
              kind="empty"
              [title]="'sublists.state.emptyTitle' | t"
              [message]="'sublists.state.emptyMessage' | t"
            />
          } @else {
            <div class="sublists-grid">
              @for (sublist of sublists; track sublist.id) {
                <article class="sublist-card">
                  <div class="sublist-card-head">
                    <h3 class="sublist-card-title">{{ sublist.name }}</h3>
                    <vereint-status-badge
                      [label]="'sublists.card.drinkCount' | t: { count: sublist.itemCount }"
                      tone="neutral"
                    />
                  </div>

                  @if (sublist.description) {
                    <p class="sublist-card-desc">{{ sublist.description }}</p>
                  }

                  <div class="sublist-card-actions">
                    <button
                      type="button"
                      class="btn-primary-sm"
                      (click)="openDetailModal(sublist.id)"
                    >
                      {{ 'sublists.card.manageItems' | t: { count: sublist.itemCount } }}
                    </button>
                    <button
                      type="button"
                      class="btn-secondary-sm"
                      (click)="openEditModal(sublist)"
                    >
                      {{ 'sublists.card.edit' | t }}
                    </button>
                    <button
                      type="button"
                      class="btn-danger-sm"
                      (click)="deleteSublist(sublist.id)"
                    >
                      {{ 'sublists.card.delete' | t }}
                    </button>
                  </div>
                </article>
              }
            </div>
          }
        }
      </section>

      <!-- Create / Edit Sublist Modal -->
      <vereint-modal
        [open]="showEditModal()"
        [title]="(editingSublistId() ? 'sublists.form.editTitle' : 'sublists.form.createTitle') | t"
        (closed)="closeEditModal()"
      >
        <form (submit)="submitSublistForm($event)" class="modal-form">
          <label class="form-field">
            <span>{{ 'sublists.form.name' | t }}</span>
            <input [(ngModel)]="sublistFormName" name="sublistName" required [placeholder]="'sublists.form.namePlaceholder' | t" />
          </label>

          <label class="form-field">
            <span>{{ 'sublists.form.description' | t }}</span>
            <textarea
              [(ngModel)]="sublistFormDescription"
              name="sublistDescription"
              rows="3"
              [placeholder]="'sublists.form.descriptionPlaceholder' | t"
            ></textarea>
          </label>

          @if (formError()) {
            <p class="form-error" role="alert">{{ formError() }}</p>
          }

          <div class="modal-actions">
            <button type="button" class="btn-secondary-sm" (click)="closeEditModal()">{{ 'common.cancel' | t }}</button>
            <button type="submit" class="member-button" [disabled]="submitting()">
              {{ (submitting() ? 'common.saving' : 'common.save') | t }}
            </button>
          </div>
        </form>
      </vereint-modal>

      <!-- Sublist Details & Items Modal -->
      <vereint-modal
        [open]="showDetailModal()"
        [title]="selectedSublist()?.name ?? ('sublists.detail.fallbackTitle' | t)"
        (closed)="closeDetailModal()"
      >
        @if (selectedSublist(); as sublist) {
          <div class="sublist-detail-view">
            @if (sublist.description) {
              <p class="sublist-detail-desc">{{ sublist.description }}</p>
            }

            <h4 class="sublist-items-title">{{ 'sublists.detail.itemsTitle' | t: { count: sublist.items.length } }}</h4>

            @if (sublist.items.length === 0) {
              <p class="text-muted">{{ 'sublists.detail.noItems' | t }}</p>
            } @else {
              <ul class="sublist-items-list">
                @for (item of sublist.items; track item.id) {
                  <li class="sublist-item-row">
                    <div>
                      <span class="sublist-item-name">{{ item.drinkName }}</span>
                      @if (item.defaultPrice !== null && item.defaultPrice !== undefined) {
                        <span class="sublist-item-price">{{ 'sublists.detail.price' | t: { price: formatPrice(item.defaultPrice) } }}</span>
                      } @else {
                        <span class="sublist-item-price-default">{{ 'sublists.detail.catalogPrice' | t }}</span>
                      }
                    </div>
                    <button
                      type="button"
                      class="btn-icon-danger"
                      [title]="'sublists.detail.removeItem' | t"
                      (click)="removeItem(sublist.id, item.id)"
                    >
                      <vereint-icon name="close" />
                    </button>
                  </li>
                }
              </ul>
            }

            <!-- Add Item Form -->
            <form class="add-item-form" (submit)="addItem($event, sublist.id)">
              <h4 class="add-item-title">{{ 'sublists.addItem.title' | t }}</h4>
              <div class="add-item-inputs">
                <select [(ngModel)]="newDrinkId" name="selectedDrink" class="item-select" required>
                  <option value="" disabled selected>{{ 'sublists.addItem.selectPlaceholder' | t }}</option>
                  @for (drink of availableDrinks(); track drink.id) {
                    <option [value]="drink.id">
                      {{ 'sublists.addItem.option' | t: { name: drink.name, price: formatPrice(drink.defaultPrice) } }}
                    </option>
                  }
                </select>

                <input
                  type="number"
                  step="0.10"
                  min="0"
                  [(ngModel)]="newCustomPrice"
                  name="customPrice"
                  class="price-input"
                  [placeholder]="'sublists.addItem.customPricePlaceholder' | t"
                />

                <button type="submit" class="member-button-sm" [disabled]="submitting() || !newDrinkId">
                  {{ 'sublists.addItem.submit' | t }}
                </button>
              </div>
            </form>
          </div>
        }
      </vereint-modal>
    </main>
  `,
  styles: [
    `
      .sublists-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1.5rem;
      }
      .sublists-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 1rem;
        margin-top: 1.5rem;
      }
      .sublist-card {
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
      .sublist-card-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 0.5rem;
      }
      .sublist-card-title {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--color-text, #0f172a);
      }
      .sublist-card-desc {
        color: var(--color-text-muted, #64748b);
        font-size: 0.9rem;
        margin: 0;
        line-height: 1.5;
      }
      .sublist-card-actions {
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
        color: var(--color-on-brand);
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
      .sublist-detail-view {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .sublist-detail-desc {
        color: var(--color-text-muted, #64748b);
        margin: 0;
        font-size: 0.9rem;
      }
      .sublist-items-title {
        margin: 0.5rem 0 0 0;
        font-size: 1rem;
      }
      .sublist-items-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .sublist-item-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--color-surface-subtle, #f8fafc);
        border: 1px solid var(--color-border, #e2e8f0);
        padding: 0.6rem 0.8rem;
        border-radius: var(--radius-sm, 0.375rem);
      }
      .sublist-item-name {
        display: block;
        font-weight: 600;
        color: var(--color-text, #0f172a);
      }
      .sublist-item-price {
        font-size: 0.8rem;
        color: var(--color-brand, #3b82f6);
        font-weight: 600;
      }
      .sublist-item-price-default {
        font-size: 0.8rem;
        color: var(--color-text-muted, #64748b);
      }
      .add-item-form {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--color-border, #e2e8f0);
      }
      .add-item-title {
        margin: 0 0 0.5rem 0;
        font-size: 0.95rem;
      }
      .add-item-inputs {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .item-select {
        flex: 1 1 200px;
        padding: 0.5rem;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: var(--radius-sm, 0.375rem);
        font: inherit;
      }
      .price-input {
        width: 140px;
        padding: 0.5rem;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: var(--radius-sm, 0.375rem);
        font: inherit;
      }
      .member-button-sm {
        padding: 0.5rem 1rem;
        font-size: 0.85rem;
        font-weight: 600;
        background-color: var(--color-brand, #3b82f6);
        color: var(--color-on-brand);
        border: none;
        border-radius: var(--radius-sm, 0.375rem);
        cursor: pointer;
      }
    `,
  ],
})
export class SublistsComponent implements OnInit, OnDestroy {
  private readonly sublistsApi = inject(SublistsApiService);
  private readonly catalogApi = inject(CatalogApiService);

  protected readonly load = new AsyncState<SublistSummaryDto[]>();
  protected readonly availableDrinks = signal<DrinkSummaryDto[]>([]);

  // Modals state
  protected readonly showEditModal = signal(false);
  protected readonly showDetailModal = signal(false);
  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  // Edit/Create form
  protected readonly editingSublistId = signal<string | null>(null);
  protected sublistFormName = '';
  protected sublistFormDescription = '';

  // Detail & Add Item state
  protected readonly selectedSublist = signal<SublistDto | null>(null);
  protected newDrinkId = '';
  protected newCustomPrice: number | null = null;

  ngOnInit(): void {
    this.reload();
    this.loadCatalogDrinks();
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.load.run(this.sublistsApi.listSublists());
  }

  private loadCatalogDrinks(): void {
    this.catalogApi.listDrinks('approved').subscribe({
      next: (drinks) => this.availableDrinks.set(drinks),
    });
  }

  protected formatPrice(amount: number, currency = 'EUR'): string {
    const val = Number(amount) || 0;
    return `${val.toFixed(2)} ${currency}`;
  }

  // Create / Edit
  protected openCreateModal(): void {
    this.editingSublistId.set(null);
    this.sublistFormName = '';
    this.sublistFormDescription = '';
    this.formError.set(null);
    this.showEditModal.set(true);
  }

  protected openEditModal(sublist: SublistSummaryDto): void {
    this.editingSublistId.set(sublist.id);
    this.sublistFormName = sublist.name;
    this.sublistFormDescription = sublist.description || '';
    this.formError.set(null);
    this.showEditModal.set(true);
  }

  protected closeEditModal(): void {
    this.showEditModal.set(false);
    this.editingSublistId.set(null);
  }

  protected submitSublistForm(event: Event): void {
    event.preventDefault();
    if (!this.sublistFormName.trim()) {
      this.formError.set(translate('sublists.form.nameRequired'));
      return;
    }

    this.submitting.set(true);
    this.formError.set(null);

    const editId = this.editingSublistId();
    if (editId) {
      const payload: UpdateSublistRequest = {
        name: this.sublistFormName.trim(),
        description: this.sublistFormDescription.trim() || null,
      };
      this.sublistsApi.updateSublist(editId, payload).subscribe({
        next: () => {
          this.submitting.set(false);
          this.closeEditModal();
          this.reload();
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.formError.set((err as Error)?.message || translate('sublists.errors.update'));
        },
      });
    } else {
      const payload: CreateSublistRequest = {
        name: this.sublistFormName.trim(),
        description: this.sublistFormDescription.trim() || null,
      };
      this.sublistsApi.createSublist(payload).subscribe({
        next: () => {
          this.submitting.set(false);
          this.closeEditModal();
          this.reload();
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.formError.set((err as Error)?.message || translate('sublists.errors.create'));
        },
      });
    }
  }

  protected deleteSublist(id: string): void {
    this.sublistsApi.deleteSublist(id).subscribe({
      next: () => this.reload(),
    });
  }

  // Details & Item Management
  protected openDetailModal(id: string): void {
    this.sublistsApi.getSublist(id).subscribe({
      next: (sublist) => {
        this.selectedSublist.set(sublist);
        this.newDrinkId = '';
        this.newCustomPrice = null;
        this.showDetailModal.set(true);
      },
    });
  }

  protected closeDetailModal(): void {
    this.showDetailModal.set(false);
    this.selectedSublist.set(null);
    this.reload();
  }

  protected addItem(event: Event, sublistId: string): void {
    event.preventDefault();
    if (!this.newDrinkId) return;

    this.submitting.set(true);
    const payload: AddSublistItemRequest = {
      drinkId: this.newDrinkId,
      defaultPrice: this.newCustomPrice !== null && this.newCustomPrice >= 0 ? this.newCustomPrice : null,
    };

    this.sublistsApi.addItem(sublistId, payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.newDrinkId = '';
        this.newCustomPrice = null;
        this.openDetailModal(sublistId);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.formError.set((err as Error)?.message || translate('sublists.errors.addItem'));
      },
    });
  }

  protected removeItem(sublistId: string, itemId: string): void {
    this.sublistsApi.removeItem(sublistId, itemId).subscribe({
      next: () => this.openDetailModal(sublistId),
    });
  }
}
