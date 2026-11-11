import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { type Observable, catchError, forkJoin, map, of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import {
  CatalogApiService,
  type DrinkDto,
  type DrinkLibraryEntryDto,
  type DrinkSummaryDto,
  type FoodSummaryDto,
  type FoodDto,
  type ProposeDrinkRequest,
  type CreateFoodRequest,
} from './catalog-api.service';
import { AsyncState } from '../member/async-state';
import { formatMoney } from '../member/member-format';
import { BarcodeScannerComponent } from '../scan/barcode-scanner.component';
import { ModalComponent, StatusBadgeComponent, type StatusTone } from '../ui';
import { StateComponent } from '../ui/state.component';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';
import { ApiError, describeApiError } from '../api/api-client.service';

/** Wie im Backend: Leerzeichen entfernen, damit „4029 7640“ und „40297640“ derselbe Code sind. */
function normalizeBarcode(value: string): string {
  return value.replace(/\s+/g, '');
}

type CatalogTab = 'drinks' | 'food';

@Component({
  selector: 'app-catalog',
  imports: [
    StateComponent,
    IconComponent,
    FormsModule,
    RouterLink,
    ModalComponent,
    StatusBadgeComponent,
    TranslatePipe,
    BarcodeScannerComponent,
  ],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="catalog-title">
        <div class="catalog-header">
          <span class="eyebrow">{{ 'catalog.header.eyebrow' | t }}</span>
          <h1 id="catalog-title">{{ 'catalog.header.title' | t }}</h1>
        </div>
        <div class="catalog-header-actions">
          @if (activeTab() === 'drinks') {
            <button type="button" class="member-button" (click)="openCreateDrink()">
              {{
                (isBoardOrAdmin()
                  ? 'catalog.actions.createDrink'
                  : 'catalog.actions.proposeDrink'
                ) | t
              }}
            </button>
            <a class="btn-secondary-sm catalog-library-link" routerLink="/catalog/library">
              {{ 'catalog.library.open' | t }}
            </a>
            <button
              type="button"
              class="btn-secondary-sm catalog-icon-btn"
              [attr.aria-label]="'catalog.lookup.open' | t"
              [title]="'catalog.lookup.open' | t"
              (click)="openLookup()"
            >
              <vereint-icon name="camera" />
            </button>
          } @else if (isBoardOrAdmin()) {
            <button type="button" class="member-button" (click)="openCreateFoodModal()">
              {{ 'catalog.actions.createFood' | t }}
            </button>
          }
        </div>

        <!-- Tabs -->
        <nav class="catalog-tabs" [attr.aria-label]="'catalog.tabs.label' | t">
          <button
            type="button"
            class="tab-btn"
            [class.active]="activeTab() === 'drinks'"
            (click)="setTab('drinks')"
          >
            {{ 'catalog.tabs.drinks' | t }}
          </button>
          <button
            type="button"
            class="tab-btn"
            [class.active]="activeTab() === 'food'"
            (click)="setTab('food')"
          >
            {{ 'catalog.tabs.food' | t }}
          </button>
        </nav>

        <!-- Search & Filter Controls -->
        <div class="catalog-filter-bar">
          <input
            type="search"
            class="filter-input search-input"
            [(ngModel)]="searchQuery"
            [placeholder]="'catalog.filter.searchPlaceholder' | t"
          />

          @if (activeTab() === 'drinks' && isBoardOrAdmin()) {
            <select
              class="filter-input select-input"
              [(ngModel)]="statusFilter"
              (change)="reload()"
            >
              <option value="">{{ 'catalog.filter.allStatuses' | t }}</option>
              <option value="approved">{{ 'catalog.filter.approvedOnly' | t }}</option>
              <option value="proposed">{{ 'catalog.filter.proposedOnly' | t }}</option>
              <option value="rejected">{{ 'catalog.filter.rejectedOnly' | t }}</option>
            </select>
          }
        </div>

        @if (proposeInfo(); as info) {
          <p class="manage-action-info" role="status">{{ info }}</p>
        }
        @if (actionError(); as err) {
          <p class="form-error page-error" role="alert">{{ err }}</p>
        }

        @if (load.isLoading()) {
          <vereint-state
            kind="loading"
            [title]="'common.loading' | t"
            [message]="'catalog.state.loadingMessage' | t"
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            [title]="'catalog.state.unavailable' | t"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else {
          <!-- Drinks Tab Content -->
          @if (activeTab() === 'drinks') {
            @if (filteredDrinks().length === 0) {
              <vereint-state
                kind="empty"
                [title]="'catalog.state.noDrinksTitle' | t"
                [message]="'catalog.state.noDrinksMessage' | t"
              />
            } @else {
              <ul class="catalog-list">
                @for (drink of filteredDrinks(); track drink.id) {
                  <li class="catalog-item">
                    <button
                      type="button"
                      class="catalog-item-main"
                      [attr.aria-label]="
                        (isBoardOrAdmin() ? 'catalog.card.edit' : 'catalog.card.detailsAndBarcodes')
                          | t
                      "
                      (click)="isBoardOrAdmin() ? openEditDrink(drink.id) : openDrinkDetail(drink.id)"
                    >
                      <span class="catalog-item-text">
                        <span class="catalog-card-title">{{ drink.name }}</span>
                        <span class="catalog-card-category">{{
                          drink.category || ('catalog.card.generalCategory' | t)
                        }}</span>
                      </span>
                      <span class="catalog-item-side">
                        <span class="price-val">{{
                          formatPrice(drink.defaultPrice, drink.currency)
                        }}</span>
                        @if (drink.status === 'approved' && !drink.active) {
                          <vereint-status-badge
                            [label]="'catalog.card.inactive' | t"
                            tone="neutral"
                          />
                        } @else {
                          <vereint-status-badge
                            [label]="drinkStatusLabel(drink.status)"
                            [tone]="drinkStatusTone(drink.status)"
                          />
                        }
                        @if (isBoardOrAdmin() && drink.costPrice) {
                          <span class="price-margin">{{
                            'catalog.card.margin'
                              | t: { amount: formatPrice(margin(drink), drink.currency) }
                          }}</span>
                        }
                      </span>
                    </button>
                    @if (isBoardOrAdmin() && drink.status === 'proposed') {
                      <div class="catalog-card-actions">
                        <button
                          type="button"
                          class="btn-primary-sm"
                          (click)="approveDrink(drink.id)"
                        >
                          {{ 'catalog.card.approve' | t }}
                        </button>
                        <button type="button" class="btn-danger-sm" (click)="rejectDrink(drink.id)">
                          {{ 'catalog.card.reject' | t }}
                        </button>
                      </div>
                    }
                  </li>
                }
              </ul>
            }
          }

          <!-- Food Tab Content -->
          @if (activeTab() === 'food') {
            @if (filteredFoods().length === 0) {
              <vereint-state
                kind="empty"
                [title]="'catalog.state.noFoodTitle' | t"
                [message]="'catalog.state.noFoodMessage' | t"
              />
            } @else {
              <ul class="catalog-list">
                @for (food of filteredFoods(); track food.id) {
                  <li class="catalog-item">
                    <button
                      type="button"
                      class="catalog-item-main"
                      [disabled]="!isBoardOrAdmin()"
                      [attr.aria-label]="isBoardOrAdmin() ? ('catalog.card.edit' | t) : null"
                      (click)="openEditFoodModal(food.id)"
                    >
                      <span class="catalog-item-text">
                        <span class="catalog-card-title">{{ food.name }}</span>
                        <span class="catalog-card-category">{{
                          food.category || ('catalog.card.generalCategory' | t)
                        }}</span>
                      </span>
                      <span class="catalog-item-side">
                        <span class="price-val">{{
                          formatPrice(food.defaultPrice, food.currency)
                        }}</span>
                        <vereint-status-badge
                          [label]="
                            (food.active ? 'catalog.card.active' : 'catalog.card.inactive') | t
                          "
                          [tone]="food.active ? 'success' : 'neutral'"
                        />
                      </span>
                    </button>
                  </li>
                }
              </ul>
            }
          }
        }
      </section>

      <!-- Getränk anlegen / vorschlagen / bearbeiten -->
      <vereint-modal
        [open]="drinkFormMode() !== null"
        [title]="drinkFormTitle() | t"
        (closed)="closeDrinkForm()"
      >
        <form (submit)="submitDrinkForm($event)" class="modal-form">
          @if (formInfo(); as info) {
            <p class="form-info" role="status">{{ info }}</p>
          }

          <label class="form-field">
            <span>{{ 'catalog.propose.name' | t }}</span>
            <input
              [(ngModel)]="drinkName"
              name="name"
              required
              autocomplete="off"
              [placeholder]="'catalog.propose.namePlaceholder' | t"
            />
          </label>
          @if (similarDrink(); as similar) {
            <p class="form-hint" role="status">
              {{ 'catalog.form.similarName' | t: { name: similar.name } }}
            </p>
          }

          <label class="form-field">
            <span>{{ 'catalog.form.category' | t }}</span>
            <input
              [(ngModel)]="drinkCategory"
              name="category"
              list="drink-categories"
              autocomplete="off"
              [placeholder]="'catalog.propose.categoryPlaceholder' | t"
            />
          </label>
          <datalist id="drink-categories">
            @for (category of drinkCategories(); track category) {
              <option [value]="category"></option>
            }
          </datalist>

          <div class="form-row">
            <label class="form-field">
              <span>{{ 'catalog.form.defaultPrice' | t }}</span>
              <input
                type="number"
                inputmode="decimal"
                step="0.01"
                min="0"
                [(ngModel)]="drinkPrice"
                name="price"
                required
                [placeholder]="'catalog.propose.pricePlaceholder' | t"
              />
            </label>
            @if (isBoardOrAdmin()) {
              <label class="form-field">
                <span>{{ 'catalog.form.costPrice' | t }}</span>
                <input
                  type="number"
                  inputmode="decimal"
                  step="0.01"
                  min="0"
                  [(ngModel)]="drinkCostPrice"
                  name="costPrice"
                  [placeholder]="'catalog.form.costPricePlaceholder' | t"
                />
              </label>
            }
          </div>
          @if (isBoardOrAdmin() && drinkPrice !== null && drinkCostPrice !== null) {
            <p class="form-hint">
              {{
                'catalog.form.marginHint' | t: { amount: formatPrice(drinkPrice - drinkCostPrice) }
              }}
            </p>
          }

          <div class="form-row">
            <label class="form-field">
              <span>{{ 'catalog.form.volumeMl' | t }}</span>
              <input
                type="number"
                inputmode="numeric"
                step="1"
                min="1"
                max="10000"
                [(ngModel)]="drinkVolumeMl"
                name="volumeMl"
                [placeholder]="'catalog.form.volumePlaceholder' | t"
              />
            </label>
            <label class="form-field">
              <span>{{ 'catalog.form.kcal' | t }}</span>
              <input
                type="number"
                inputmode="numeric"
                step="1"
                min="0"
                max="10000"
                [(ngModel)]="drinkKcal"
                name="kcalPerServing"
                [placeholder]="'catalog.form.kcalPlaceholder' | t"
              />
            </label>
          </div>
          <p class="form-hint">{{ 'catalog.form.nutritionHint' | t }}</p>

          <label class="form-field">
            <span>{{ 'catalog.form.description' | t }}</span>
            <textarea
              [(ngModel)]="drinkDescription"
              name="description"
              rows="2"
              [placeholder]="'catalog.propose.descriptionPlaceholder' | t"
            ></textarea>
          </label>

          <fieldset class="barcode-fieldset">
            <legend>{{ 'catalog.form.barcodes' | t }}</legend>
            @if (formBarcodes().length === 0) {
              <p class="text-muted">{{ 'catalog.detail.noBarcodes' | t }}</p>
            } @else {
              <ul class="barcode-list">
                @for (bc of formBarcodes(); track bc.barcode) {
                  <li class="barcode-item">
                    <code>{{ bc.barcode }}</code>
                    <button
                      type="button"
                      class="btn-icon-danger"
                      [attr.aria-label]="'catalog.detail.removeBarcode' | t"
                      [title]="'catalog.detail.removeBarcode' | t"
                      (click)="removeFormBarcode(bc)"
                    >
                      <vereint-icon name="close" />
                    </button>
                  </li>
                }
              </ul>
            }

            @if (scanningBarcode()) {
              <div class="barcode-scan">
                <vereint-barcode-scanner (detected)="onFormBarcodeScanned($event)" />
                <button type="button" class="btn-secondary-sm" (click)="scanningBarcode.set(false)">
                  {{ 'catalog.detail.scanCancel' | t }}
                </button>
              </div>
            }
            <div class="barcode-add-form">
              <input
                type="text"
                inputmode="numeric"
                autocomplete="off"
                [(ngModel)]="barcodeInput"
                name="newBarcode"
                [attr.aria-label]="'catalog.detail.newBarcodePlaceholder' | t"
                [placeholder]="'catalog.detail.newBarcodePlaceholder' | t"
                (keydown.enter)="$event.preventDefault(); addFormBarcode()"
              />
              <button
                type="button"
                class="btn-secondary-sm"
                [disabled]="barcodeBusy()"
                (click)="addFormBarcode()"
              >
                {{ 'catalog.detail.addBarcode' | t }}
              </button>
              @if (!scanningBarcode()) {
                <button
                  type="button"
                  class="btn-secondary-sm"
                  [attr.aria-label]="'catalog.detail.scanBarcode' | t"
                  [title]="'catalog.detail.scanBarcode' | t"
                  (click)="scanningBarcode.set(true)"
                >
                  <vereint-icon name="camera" />
                </button>
              }
            </div>
            @if (barcodeHint(); as hint) {
              <p class="form-error" role="alert">{{ hint }}</p>
            }
          </fieldset>

          @if (drinkFormMode() === 'edit' && isBoardOrAdmin()) {
            <label class="form-field checkbox-field">
              <input type="checkbox" [(ngModel)]="drinkActive" name="active" />
              <span>{{ 'catalog.form.activeLabel' | t }}</span>
            </label>
          }

          @if (editingDrink(); as editing) {
            @if (editing.libraryDrinkId) {
              <p class="text-muted">{{ 'catalog.library.shared' | t }}</p>
            } @else if (canApprove() && editing.status === 'approved') {
              <button type="button" class="btn-secondary-sm" [disabled]="sharing()" (click)="shareToLibrary(editing)">
                {{ 'catalog.library.share' | t }}
              </button>
            }
          }

          @if (formError()) {
            <p class="form-error" role="alert">{{ formError() }}</p>
          }

          <div class="modal-actions">
            <button type="button" class="btn-secondary-sm" (click)="closeDrinkForm()">
              {{ 'common.cancel' | t }}
            </button>
            <button type="submit" class="member-button" [disabled]="submitting()">
              {{ (submitting() ? 'common.saving' : drinkSubmitLabel()) | t }}
            </button>
          </div>
        </form>
      </vereint-modal>

      <!-- Strichcode scannen: bekanntes Getränk öffnen, neues anlegen -->
      <vereint-modal
        [open]="showLookup()"
        [title]="'catalog.lookup.title' | t"
        (closed)="closeLookup()"
      >
        <div class="drink-detail-modal">
          <p class="text-muted">{{ 'catalog.lookup.intro' | t }}</p>
          @if (showLookup()) {
            <vereint-barcode-scanner (detected)="lookupBarcode($event)" />
          }
          <form
            class="barcode-add-form"
            (submit)="$event.preventDefault(); lookupBarcode(lookupInput)"
          >
            <input
              type="text"
              inputmode="numeric"
              autocomplete="off"
              [(ngModel)]="lookupInput"
              name="lookupBarcode"
              [attr.aria-label]="'catalog.lookup.manual' | t"
              [placeholder]="'catalog.lookup.manual' | t"
            />
            <button type="submit" class="member-button-sm" [disabled]="barcodeBusy()">
              {{ 'catalog.lookup.search' | t }}
            </button>
          </form>
          @if (barcodeHint(); as hint) {
            <p class="form-error" role="alert">{{ hint }}</p>
          }
        </div>
      </vereint-modal>

      <!-- Getränkedetails (nur lesen) -->
      <vereint-modal
        [open]="showDrinkDetailModal()"
        [title]="selectedDrink()?.name ?? ('catalog.detail.fallbackTitle' | t)"
        (closed)="closeDrinkDetailModal()"
      >
        @if (selectedDrink(); as drink) {
          <div class="drink-detail-modal">
            <p class="drink-detail-meta">
              <strong>{{ 'catalog.detail.category' | t }}</strong>
              {{ drink.category || ('catalog.card.generalCategory' | t) }} |
              <strong>{{ 'catalog.detail.status' | t }}</strong>
              {{ drinkStatusLabel(drink.status) }} |
              <strong>{{ 'catalog.detail.defaultPrice' | t }}</strong>
              {{ formatPrice(drink.defaultPrice, drink.currency) }}
            </p>
            @if (drink.description) {
              <p class="drink-detail-desc">{{ drink.description }}</p>
            }

            <h4 class="barcode-heading">{{ 'catalog.detail.barcodesHeading' | t }}</h4>
            @if (drink.barcodes.length === 0) {
              <p class="text-muted">{{ 'catalog.detail.noBarcodes' | t }}</p>
            } @else {
              <ul class="barcode-list">
                @for (bc of drink.barcodes; track bc.id) {
                  <li class="barcode-item">
                    <code>{{ bc.barcode }}</code>
                  </li>
                }
              </ul>
            }
          </div>
        }
      </vereint-modal>

      <!-- Food Create/Edit Modal -->
      <vereint-modal
        [open]="showFoodModal()"
        [title]="(editingFoodId() ? 'catalog.food.editTitle' : 'catalog.food.createTitle') | t"
        (closed)="closeFoodModal()"
      >
        <form (submit)="submitFoodForm($event)" class="modal-form">
          <label class="form-field">
            <span>{{ 'catalog.food.name' | t }}</span>
            <input
              [(ngModel)]="foodFormName"
              name="foodName"
              required
              [placeholder]="'catalog.food.namePlaceholder' | t"
            />
          </label>

          <label class="form-field">
            <span>{{ 'catalog.form.category' | t }}</span>
            <input
              [(ngModel)]="foodFormCategory"
              name="foodCategory"
              [placeholder]="'catalog.food.categoryPlaceholder' | t"
            />
          </label>

          <label class="form-field">
            <span>{{ 'catalog.form.defaultPrice' | t }}</span>
            <input
              type="number"
              step="0.10"
              min="0"
              [(ngModel)]="foodFormPrice"
              name="foodPrice"
              required
              [placeholder]="'catalog.food.pricePlaceholder' | t"
            />
          </label>

          <label class="form-field">
            <span>{{ 'catalog.food.costPrice' | t }}</span>
            <input
              type="number"
              step="0.10"
              min="0"
              [(ngModel)]="foodFormCostPrice"
              name="foodCostPrice"
              [placeholder]="'catalog.food.costPricePlaceholder' | t"
            />
          </label>

          <label class="form-field">
            <span>{{ 'catalog.form.description' | t }}</span>
            <textarea
              [(ngModel)]="foodFormDescription"
              name="foodDescription"
              rows="3"
              [placeholder]="'catalog.food.descriptionPlaceholder' | t"
            ></textarea>
          </label>

          @if (editingFoodId()) {
            <label class="form-field checkbox-field">
              <input type="checkbox" [(ngModel)]="foodFormActive" name="foodActive" />
              <span>{{ 'catalog.food.activeLabel' | t }}</span>
            </label>
          }

          @if (formError()) {
            <p class="form-error" role="alert">{{ formError() }}</p>
          }

          <div class="modal-actions">
            <button type="button" class="btn-secondary-sm" (click)="closeFoodModal()">
              {{ 'common.cancel' | t }}
            </button>
            <button type="submit" class="member-button" [disabled]="submitting()">
              {{ (submitting() ? 'common.saving' : 'common.save') | t }}
            </button>
          </div>
        </form>
      </vereint-modal>
    </main>
  `,
  styles: [
    `
      .catalog-header {
        margin-bottom: var(--space-3);
      }
      .catalog-header-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin-bottom: var(--space-3);
      }
      .catalog-header-actions > * {
        min-height: 2.75rem;
        border-radius: var(--radius-md);
        font-size: 0.95rem;
      }
      .catalog-header-actions .member-button {
        flex: 1 1 100%;
      }
      .catalog-library-link {
        flex: 1 1 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        text-decoration: none;
      }
      .catalog-icon-btn {
        flex: none;
        width: 2.75rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }
      .catalog-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.25rem;
        padding: 0.25rem;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-subtle);
        margin-bottom: var(--space-3);
      }
      .tab-btn {
        min-height: 2.5rem;
        padding: 0 1rem;
        font: inherit;
        font-weight: 600;
        font-size: 0.95rem;
        background: none;
        border: none;
        border-radius: calc(var(--radius-md) - 2px);
        color: var(--color-text-muted);
        cursor: pointer;
      }
      .tab-btn:hover {
        color: var(--color-text);
      }
      .tab-btn.active {
        color: var(--color-text);
        background-color: var(--color-surface-raised);
        box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
      }
      .catalog-filter-bar {
        display: flex;
        gap: var(--space-2);
        margin-bottom: var(--space-3);
        flex-wrap: wrap;
      }
      .filter-input {
        min-height: 2.75rem;
        padding: 0.6rem 0.9rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        color: inherit;
        font: inherit;
      }
      .search-input {
        flex: 1 1 240px;
      }
      .select-input {
        flex: 0 0 auto;
      }
      .catalog-list {
        list-style: none;
        margin: 0;
        padding: 0;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background-color: var(--color-surface-raised);
        overflow: hidden;
      }
      .catalog-item + .catalog-item {
        border-top: 1px solid var(--color-border);
      }
      .catalog-item-main {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        padding: 0.8rem var(--space-3);
        border: 0;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .catalog-item-main:disabled {
        cursor: default;
        opacity: 1;
      }
      .catalog-item-main:not(:disabled):hover {
        background-color: var(--color-surface-subtle);
      }
      .catalog-item-text {
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .catalog-item-side {
        flex: none;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.2rem;
      }
      .catalog-card-title {
        font-size: 1rem;
        font-weight: 700;
        color: var(--color-text);
        overflow-wrap: anywhere;
      }
      .catalog-card-category {
        font-size: 0.85rem;
        color: var(--color-text-muted);
      }
      .price-val {
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .catalog-card-actions {
        display: flex;
        gap: var(--space-2);
        padding: 0 var(--space-3) var(--space-3);
      }
      .btn-primary-sm,
      .btn-secondary-sm,
      .btn-danger-sm {
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
      .form-field input,
      .form-field textarea {
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
      .manage-action-info {
        color: #15803d;
        font-weight: 600;
        margin: 0 0 1rem;
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
      .barcode-scan {
        display: grid;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
      .barcode-scan-start {
        margin-top: 0.5rem;
      }
      .barcode-add-form {
        display: flex;
        gap: 0.5rem;
      }
      .barcode-add-form input {
        flex: 1 1 auto;
        padding: 0.4rem 0.6rem;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: var(--radius-sm, 0.375rem);
        font: inherit;
      }
      .page-error {
        margin: 0 0 1rem;
      }
      .price-margin {
        display: block;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--color-text-muted, #64748b);
      }
      .form-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
        gap: 1rem;
      }
      .form-hint,
      .form-info {
        font-size: 0.85rem;
        margin: -0.5rem 0 0;
        color: var(--color-text-muted, #64748b);
      }
      .form-info {
        margin: 0;
        color: #15803d;
        font-weight: 600;
      }
      .barcode-fieldset {
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-md, 0.5rem);
        padding: 0.75rem;
        margin: 0;
        display: grid;
        gap: 0.5rem;
      }
      .barcode-fieldset legend {
        font-size: 0.9rem;
        font-weight: 600;
        padding: 0 0.25rem;
      }
      .member-button-sm {
        padding: 0.4rem 0.8rem;
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
export class CatalogComponent implements OnInit, OnDestroy {
  private readonly catalogApi = inject(CatalogApiService);
  private readonly auth = inject(AuthService);

  protected readonly activeTab = signal<CatalogTab>('drinks');
  protected readonly isBoardOrAdmin = signal(false);
  /** Freigabe-Recht im Stammtisch; erlaubt das Teilen in die Getränkedatenbank. */
  protected readonly canApprove = signal(false);
  protected readonly sharing = signal(false);

  protected readonly searchQuery = signal('');
  protected statusFilter = '';

  protected readonly load = new AsyncState<{
    drinks: DrinkSummaryDto[];
    foods: FoodSummaryDto[];
  }>();

  // Modals state
  protected readonly showDrinkDetailModal = signal(false);
  protected readonly showFoodModal = signal(false);
  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);
  /** Rückmeldung nach einem Vorschlag: Mitglieder sehen nur freigegebene Getränke. */
  protected readonly proposeInfo = signal<string | null>(null);
  /** Fehler aus Freigeben/Ablehnen, die sonst nirgends sichtbar würden. */
  protected readonly actionError = signal<string | null>(null);

  // Getränkeformular: anlegen (Vorstand/Admin), vorschlagen (Mitglied) oder bearbeiten
  protected readonly drinkFormMode = signal<'create' | 'edit' | null>(null);
  protected readonly editingDrink = signal<DrinkDto | null>(null);
  protected readonly formInfo = signal<string | null>(null);
  protected drinkName = '';
  protected drinkCategory = '';
  protected drinkPrice: number | null = null;
  protected drinkCostPrice: number | null = null;
  /** Füllmenge (ml) und Kalorien je Portion für Liter und Kalorien in der Statistik. */
  protected drinkVolumeMl: number | null = null;
  protected drinkKcal: number | null = null;
  protected drinkDescription = '';
  protected drinkActive = true;
  /** Beim Anlegen gesammelte Codes; beim Bearbeiten die gespeicherten des Getränks. */
  private readonly pendingBarcodes = signal<string[]>([]);
  protected barcodeInput = '';
  protected readonly barcodeHint = signal<string | null>(null);
  protected readonly barcodeBusy = signal(false);
  /** Kamera zum Erfassen eines Strichcodes ist eingeblendet. */
  protected readonly scanningBarcode = signal(false);
  /** Eintrag der Getränkedatenbank, aus dem das neue Getränk übernommen wird. */
  private readonly libraryDrinkId = signal<string | null>(null);

  // Strichcode scannen, um ein Getränk zu finden oder anzulegen
  protected readonly showLookup = signal(false);
  protected lookupInput = '';

  // Selected Drink for Detail
  protected readonly selectedDrink = signal<DrinkDto | null>(null);

  // Food Form
  protected editingFoodId = signal<string | null>(null);
  protected foodFormName = '';
  protected foodFormCategory = '';
  protected foodFormPrice: number | null = null;
  protected foodFormCostPrice: number | null = null;
  protected foodFormDescription = '';
  protected foodFormActive = true;

  protected readonly formBarcodes = computed<{ id?: string; barcode: string }[]>(() => {
    const editing = this.editingDrink();
    if (editing) return editing.barcodes;
    return this.pendingBarcodes().map((barcode) => ({ barcode }));
  });

  /** Vorhandene Kategorien als Vorschläge, damit „Bier“ und „bier“ nicht doppelt entstehen. */
  protected readonly drinkCategories = computed(() => {
    const seen = new Map<string, string>();
    for (const drink of this.load.data()?.drinks ?? []) {
      const category = drink.category?.trim();
      if (category && !seen.has(category.toLowerCase())) seen.set(category.toLowerCase(), category);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  });

  protected readonly drinkFormTitle = computed(() => {
    if (this.drinkFormMode() === 'edit') return 'catalog.edit.title';
    return this.isBoardOrAdmin() ? 'catalog.create.title' : 'catalog.propose.title';
  });

  protected readonly drinkSubmitLabel = computed(() => {
    if (this.drinkFormMode() === 'edit') return 'common.save';
    return this.isBoardOrAdmin() ? 'catalog.create.submit' : 'catalog.propose.submit';
  });

  protected readonly filteredDrinks = computed(() => {
    const data = this.load.data();
    if (!data) return [];
    let list = data.drinks;
    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) || (d.category && d.category.toLowerCase().includes(q)),
      );
    }
    return list;
  });

  protected readonly filteredFoods = computed(() => {
    const data = this.load.data();
    if (!data) return [];
    let list = data.foods;
    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) || (f.category && f.category.toLowerCase().includes(q)),
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
    this.canApprove.set(session?.permissions?.includes('catalog.approve') ?? false);
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
    return formatMoney(String(Number(amount) || 0), currency);
  }

  protected drinkStatusLabel(status: string): string {
    switch (status) {
      case 'approved':
        return translate('catalog.drinkStatus.approved');
      case 'proposed':
        return translate('catalog.drinkStatus.proposed');
      case 'rejected':
        return translate('catalog.drinkStatus.rejected');
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

  /** Getränk mit gleichem Namen, um Doppelerfassungen vor dem Speichern zu zeigen. */
  protected similarDrink(): DrinkSummaryDto | null {
    const name = this.drinkName.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!name) return null;
    const editingId = this.editingDrink()?.id;
    return (
      this.load.data()?.drinks.find((d) => d.id !== editingId && d.name.toLowerCase() === name) ??
      null
    );
  }

  protected margin(drink: DrinkSummaryDto): number {
    return (Number(drink.defaultPrice) || 0) - (Number(drink.costPrice) || 0);
  }

  // Getränk anlegen / vorschlagen
  protected openCreateDrink(barcode?: string): void {
    this.resetDrinkForm();
    if (barcode) {
      this.pendingBarcodes.set([barcode]);
      this.formInfo.set(translate('catalog.lookup.newBarcode', { barcode }));
    }
    this.drinkFormMode.set('create');
  }

  /**
   * Getränk bearbeiten. Mit `barcode` (gescannt, aber noch nicht zugeordnet) steht
   * der Code schon im Eingabefeld, damit er mit einem Klick hinzugefügt ist.
   */
  protected openEditDrink(id: string, barcode?: string): void {
    this.actionError.set(null);
    this.catalogApi.getDrink(id).subscribe({
      next: (drink) => {
        this.resetDrinkForm();
        if (barcode) {
          this.barcodeInput = barcode;
          this.formInfo.set(translate('catalog.lookup.inCatalog', { barcode, name: drink.name }));
        }
        this.editingDrink.set(drink);
        this.drinkName = drink.name;
        this.drinkCategory = drink.category ?? '';
        this.drinkPrice = Number(drink.defaultPrice);
        this.drinkCostPrice = drink.costPrice ? Number(drink.costPrice) : null;
        this.drinkVolumeMl = drink.volumeMl ?? null;
        this.drinkKcal = drink.kcalPerServing ?? null;
        this.drinkDescription = drink.description ?? '';
        this.drinkActive = drink.active;
        this.drinkFormMode.set('edit');
      },
      error: (err: unknown) => this.actionError.set(describeApiError(err)),
    });
  }

  private resetDrinkForm(): void {
    this.editingDrink.set(null);
    this.drinkName = '';
    this.drinkCategory = '';
    this.drinkPrice = null;
    this.drinkCostPrice = null;
    this.drinkVolumeMl = null;
    this.drinkKcal = null;
    this.drinkDescription = '';
    this.drinkActive = true;
    this.pendingBarcodes.set([]);
    this.barcodeInput = '';
    this.barcodeHint.set(null);
    this.scanningBarcode.set(false);
    this.libraryDrinkId.set(null);
    this.formInfo.set(null);
    this.formError.set(null);
  }

  /**
   * Übernimmt Name, Sorte und Beschreibung aus der Getränkedatenbank in das
   * Anlegeformular. Weitere Codes des Eintrags kommen nur mit, wenn sie in
   * diesem Katalog noch frei sind; der Preis bleibt Sache der Gruppe.
   */
  private applyLibraryEntry(entry: DrinkLibraryEntryDto, freeBarcodes: string[]): void {
    this.libraryDrinkId.set(entry.id);
    this.drinkName = entry.name;
    this.drinkCategory = entry.category ?? '';
    this.drinkDescription = entry.description ?? '';
    this.drinkVolumeMl = entry.volumeMl ?? null;
    this.drinkKcal = entry.kcalPerServing ?? null;
    this.pendingBarcodes.update((list) => [...new Set([...list, ...freeBarcodes])]);
    this.formInfo.set(translate('catalog.lookup.fromLibrary', { name: entry.name }));
  }

  /** Codes, die noch keinem Getränk dieses Katalogs gehören. */
  private freeBarcodes(codes: string[]): Observable<string[]> {
    if (codes.length === 0) return of([]);
    return forkJoin(
      codes.map((code) =>
        this.catalogApi.getDrinkByBarcode(code).pipe(
          map(() => null),
          catchError((err: unknown) =>
            of(err instanceof ApiError && err.status === 404 ? code : null),
          ),
        ),
      ),
    ).pipe(map((list) => list.filter((code): code is string => code !== null)));
  }

  /** Erster passender Eintrag der Getränkedatenbank; ist sie nicht erreichbar, gibt es keinen. */
  private findInLibrary(barcode: string): Observable<DrinkLibraryEntryDto | null> {
    return this.catalogApi.searchLibrary({ barcode }).pipe(
      map((entries) => entries[0] ?? null),
      catchError(() => of(null)),
    );
  }

  protected closeDrinkForm(): void {
    this.scanningBarcode.set(false);
    this.drinkFormMode.set(null);
    this.editingDrink.set(null);
  }

  protected onFormBarcodeScanned(code: string): void {
    this.scanningBarcode.set(false);
    this.barcodeInput = code;
    this.addFormBarcode();
  }

  /**
   * Prüft einen Strichcode, bevor er dem Getränk zugeordnet wird: Ein Code, der
   * schon zu einem anderen Getränk gehört, wird mit dessen Namen abgewiesen.
   * Beim Bearbeiten wird er sofort gespeichert, beim Anlegen mit dem Getränk.
   */
  protected addFormBarcode(): void {
    const barcode = normalizeBarcode(this.barcodeInput);
    if (!barcode) return;
    this.barcodeHint.set(null);
    if (this.formBarcodes().some((bc) => bc.barcode === barcode)) {
      this.barcodeInput = '';
      return;
    }

    this.barcodeBusy.set(true);
    this.catalogApi.getDrinkByBarcode(barcode).subscribe({
      next: (owner) => {
        this.barcodeBusy.set(false);
        this.barcodeHint.set(translate('catalog.form.barcodeTaken', { barcode, name: owner.name }));
      },
      error: (err: unknown) => {
        if (!(err instanceof ApiError) || err.status !== 404) {
          this.barcodeBusy.set(false);
          this.barcodeHint.set(describeApiError(err));
          return;
        }
        const editing = this.editingDrink();
        if (!editing) {
          this.pendingBarcodes.update((list) => [...list, barcode]);
          this.barcodeInput = '';
          // Ein noch leeres Formular wird aus der Getränkedatenbank vorausgefüllt.
          if (this.libraryDrinkId() || this.drinkName.trim()) {
            this.barcodeBusy.set(false);
            return;
          }
          this.prefillFromLibrary(barcode);
          return;
        }
        this.catalogApi.addBarcode(editing.id, { barcode }).subscribe({
          next: (saved) => {
            this.barcodeBusy.set(false);
            this.barcodeInput = '';
            this.editingDrink.set({ ...editing, barcodes: [...editing.barcodes, saved] });
          },
          error: (addErr: unknown) => {
            this.barcodeBusy.set(false);
            this.barcodeHint.set(
              (addErr as Error)?.message || translate('catalog.errors.addBarcode'),
            );
          },
        });
      },
    });
  }

  private prefillFromLibrary(barcode: string): void {
    this.findInLibrary(barcode).subscribe((entry) => {
      if (!entry || entry.catalogDrinkId) {
        this.barcodeBusy.set(false);
        return;
      }
      const others = entry.barcodes.filter((code) => code !== barcode);
      this.freeBarcodes(others).subscribe((free) => {
        this.barcodeBusy.set(false);
        // Hat jemand inzwischen selbst etwas eingetragen, bleibt das stehen.
        if (this.drinkFormMode() !== 'create' || this.drinkName.trim()) return;
        this.applyLibraryEntry(entry, free);
      });
    });
  }

  protected removeFormBarcode(bc: { id?: string; barcode: string }): void {
    const editing = this.editingDrink();
    if (!editing || !bc.id) {
      this.pendingBarcodes.update((list) => list.filter((code) => code !== bc.barcode));
      return;
    }
    const barcodeId = bc.id;
    this.catalogApi.removeBarcode(editing.id, barcodeId).subscribe({
      next: () =>
        this.editingDrink.set({
          ...editing,
          barcodes: editing.barcodes.filter((b) => b.id !== barcodeId),
        }),
      error: (err: unknown) => this.barcodeHint.set(describeApiError(err)),
    });
  }

  protected submitDrinkForm(event: Event): void {
    event.preventDefault();
    if (!this.drinkName.trim() || this.drinkPrice === null) {
      this.formError.set(translate('catalog.form.requiredFields'));
      return;
    }
    // Ein eingetippter, aber nicht hinzugefügter Strichcode soll nicht verloren gehen.
    if (normalizeBarcode(this.barcodeInput)) {
      this.formError.set(translate('catalog.form.barcodeNotAdded'));
      return;
    }

    this.submitting.set(true);
    this.formError.set(null);
    const editing = this.editingDrink();
    const fields = {
      name: this.drinkName.trim(),
      category: this.drinkCategory.trim() || null,
      defaultPrice: this.drinkPrice,
      description: this.drinkDescription.trim() || null,
      ...(this.isBoardOrAdmin() ? { costPrice: this.drinkCostPrice ?? 0 } : {}),
      nutrition: { volumeMl: wholeNumber(this.drinkVolumeMl), kcalPerServing: wholeNumber(this.drinkKcal, 0) },
    };

    if (editing) {
      this.catalogApi
        .updateDrink(editing.id, {
          ...fields,
          // Leere Felder senden, damit gelöschte Kategorien/Beschreibungen auch entfernt werden.
          category: fields.category ?? '',
          description: fields.description ?? '',
          ...(this.isBoardOrAdmin() ? { active: this.drinkActive } : {}),
        })
        .subscribe({
          next: () => {
            this.submitting.set(false);
            this.closeDrinkForm();
            this.reload();
          },
          error: (err: unknown) => {
            this.submitting.set(false);
            this.formError.set((err as Error)?.message || translate('catalog.errors.saveDrink'));
          },
        });
      return;
    }

    const payload: ProposeDrinkRequest = {
      ...fields,
      currency: 'EUR',
      barcodes: this.pendingBarcodes(),
      libraryDrinkId: this.libraryDrinkId(),
    };
    this.catalogApi.proposeDrink(payload).subscribe({
      next: (created) => {
        this.submitting.set(false);
        this.closeDrinkForm();
        this.proposeInfo.set(
          translate(created?.status === 'approved' ? 'catalog.createInfo' : 'catalog.proposeInfo', {
            name: payload.name,
          }),
        );
        this.reload();
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.formError.set((err as Error)?.message || translate('catalog.errors.propose'));
      },
    });
  }

  /** Freigegebenes Getränk in die stammtischübergreifende Getränkedatenbank teilen (ohne Preis). */
  protected shareToLibrary(drink: DrinkDto): void {
    this.sharing.set(true);
    this.formError.set(null);
    this.catalogApi.shareToLibrary(drink.id).subscribe({
      next: (entry) => {
        this.sharing.set(false);
        if (this.editingDrink()?.id === drink.id) {
          this.editingDrink.set({ ...drink, libraryDrinkId: entry.id });
        }
        this.formInfo.set(translate('catalog.library.sharedInfo', { name: drink.name }));
        this.reload();
      },
      error: (err: unknown) => {
        this.sharing.set(false);
        this.formError.set((err instanceof ApiError && err.detail) || describeApiError(err));
      },
    });
  }

  // Strichcode scannen
  protected openLookup(): void {
    this.lookupInput = '';
    this.barcodeHint.set(null);
    this.showLookup.set(true);
  }

  protected closeLookup(): void {
    this.showLookup.set(false);
  }

  /**
   * Bekannter Code öffnet das Getränk. Ein unbekannter wird in der
   * Getränkedatenbank gesucht: Treffer füllen das Anlegeformular vor, sonst
   * öffnet es leer mit dem Code.
   */
  protected lookupBarcode(raw: string): void {
    const barcode = normalizeBarcode(raw);
    if (!barcode) return;
    this.barcodeHint.set(null);
    this.barcodeBusy.set(true);
    this.catalogApi.getDrinkByBarcode(barcode).subscribe({
      next: (drink) => {
        this.barcodeBusy.set(false);
        this.closeLookup();
        if (this.isBoardOrAdmin()) this.openEditDrink(drink.id);
        else this.showDrinkDetail(drink);
      },
      error: (err: unknown) => {
        this.barcodeBusy.set(false);
        if (err instanceof ApiError && err.status === 404) {
          this.createFromBarcode(barcode);
        } else {
          this.barcodeHint.set(describeApiError(err));
        }
      },
    });
  }

  private createFromBarcode(barcode: string): void {
    this.barcodeBusy.set(true);
    this.findInLibrary(barcode).subscribe((entry) => {
      if (!entry) {
        this.barcodeBusy.set(false);
        this.closeLookup();
        this.openCreateDrink(barcode);
        return;
      }
      if (entry.catalogDrinkId) {
        // Schon übernommen, aber unter einem anderen Code: das Getränk öffnen.
        this.barcodeBusy.set(false);
        this.closeLookup();
        if (this.isBoardOrAdmin()) this.openEditDrink(entry.catalogDrinkId, barcode);
        else this.openDrinkDetail(entry.catalogDrinkId);
        return;
      }
      this.freeBarcodes(entry.barcodes.filter((code) => code !== barcode)).subscribe((free) => {
        this.barcodeBusy.set(false);
        this.closeLookup();
        this.openCreateDrink(barcode);
        this.applyLibraryEntry(entry, free);
      });
    });
  }

  // Approve / Reject
  protected approveDrink(id: string): void {
    this.actionError.set(null);
    this.catalogApi.approveDrink(id).subscribe({
      next: () => this.reload(),
      error: (err: unknown) => this.actionError.set(describeApiError(err)),
    });
  }

  protected rejectDrink(id: string): void {
    this.actionError.set(null);
    this.catalogApi.rejectDrink(id).subscribe({
      next: () => this.reload(),
      error: (err: unknown) => this.actionError.set(describeApiError(err)),
    });
  }

  // Drink Detail (lesend)
  protected openDrinkDetail(id: string): void {
    this.actionError.set(null);
    this.catalogApi.getDrink(id).subscribe({
      next: (drink) => this.showDrinkDetail(drink),
      error: (err: unknown) => this.actionError.set(describeApiError(err)),
    });
  }

  private showDrinkDetail(drink: DrinkDto): void {
    this.selectedDrink.set(drink);
    this.showDrinkDetailModal.set(true);
  }

  protected closeDrinkDetailModal(): void {
    this.showDrinkDetailModal.set(false);
    this.selectedDrink.set(null);
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
      this.formError.set(translate('catalog.form.requiredFields'));
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
            this.formError.set((err as Error)?.message || translate('catalog.errors.saveFood'));
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
          this.formError.set((err as Error)?.message || translate('catalog.errors.createFood'));
        },
      });
    }
  }
}

/** Ganze Zahl ab `min` oder `null` (leeres Feld, ungültige Eingabe). */
function wholeNumber(value: number | null, min = 1): number | null {
  if (value === null || value === undefined || (value as unknown) === '') return null;
  const rounded = Math.round(Number(value));
  return Number.isFinite(rounded) && rounded >= min ? rounded : null;
}
